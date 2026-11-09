"""Homework: teachers set it per class and subject, families mark it done, teachers check it."""
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta

from sqlalchemy import false, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Forbidden, NotFound
from app.core.permissions import STAFF_ROLES, has_permission
from app.models import StoredFile, Homework, HomeworkStatus, SchoolClass, Section, Student, Subject, TimetableEntry, User
from app.schemas.common import PageMeta, PageParams
from app.schemas.communication import (
    AssignTarget, CheckSave, FamilyDone, HomeworkDetail, HomeworkIn, HomeworkOut, HomeworkStudent, HomeworkUpdate, MyHomework,
)
from app.services import audit_service, notification_service, storage_service
from app.services.academics_service import field_error, get_section
from app.services.family_service import own_students, school_today


async def _scope(db: AsyncSession, user: User) -> dict[uuid.UUID, set[uuid.UUID] | None] | None:
    """section -> subjects this teacher may set (None = any subject, as class teacher). None overall = admins."""
    if has_permission(user.role, "exams.manage"):  # admins and principals
        return None
    scope: dict[uuid.UUID, set[uuid.UUID] | None] = {}
    for sid, subj in (await db.execute(select(TimetableEntry.section_id, TimetableEntry.subject_id)
                                       .where(TimetableEntry.teacher_id == user.id).distinct())).all():
        scope.setdefault(sid, set()).add(subj)
    for sid in (await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id))).all():
        scope[sid] = None
    return scope


def _allowed(scope, section_id: uuid.UUID, subject_id: uuid.UUID | None = None) -> bool:
    if scope is None:
        return True
    if section_id not in scope:
        return False
    subjects = scope[section_id]
    return subjects is None or subject_id is None or subject_id in subjects


def _visible(user: User, scope: dict):
    """What a teacher sees: everything in the class they are incharge of, only their own subjects in classes they teach,
    and anything they set themselves. Admins and principals (scope None) see all of it."""
    whole = [sid for sid, subjects in scope.items() if subjects is None]
    pairs = [(sid, subj) for sid, subjects in scope.items() if subjects is not None for subj in subjects]
    return or_(
        Homework.created_by == user.id,
        Homework.section_id.in_(whole) if whole else false(),
        tuple_(Homework.section_id, Homework.subject_id).in_(pairs) if pairs else false(),
    )


async def _labels(db: AsyncSession, school_id: uuid.UUID) -> dict[uuid.UUID, tuple[str, int]]:
    rows = await db.execute(select(Section.id, SchoolClass.name, Section.name, SchoolClass.sort_order)
                            .join(SchoolClass, SchoolClass.id == Section.class_id).where(Section.school_id == school_id))
    return {sid: (f"{c} – {s}", o) for sid, c, s, o in rows.all()}


def _base(h: Homework, labels: dict, subj: tuple, teacher: str | None) -> dict:
    return dict(id=h.id, section_id=h.section_id, section_label=labels.get(h.section_id, ("", 0))[0], subject_id=h.subject_id,
                subject_name=subj[0], subject_color=subj[1], title=h.title, details=h.details, assigned_on=h.assigned_on,
                due_date=h.due_date, teacher=teacher)


async def targets(db: AsyncSession, user: User) -> list[AssignTarget]:
    scope = await _scope(db, user)
    labels = await _labels(db, user.school_id)
    subjects = {s.id: s for s in (await db.scalars(select(Subject).where(Subject.school_id == user.school_id).order_by(Subject.name))).all()}
    taught: dict[uuid.UUID, set] = {}
    for sid, subj in (await db.execute(select(TimetableEntry.section_id, TimetableEntry.subject_id)
                                       .where(TimetableEntry.school_id == user.school_id).distinct())).all():
        taught.setdefault(sid, set()).add(subj)
    out = []
    for sid, (label, order) in sorted(labels.items(), key=lambda x: (x[1][1], x[1][0])):
        if scope is not None and sid not in scope:
            continue
        allowed = taught.get(sid, set(subjects)) if scope is None or scope[sid] is None else scope[sid]
        out.append(AssignTarget(section_id=sid, section_label=label, subjects=[
            {"id": str(s), "name": subjects[s].name, "color": subjects[s].color} for s in sorted(allowed, key=lambda x: subjects[x].name) if s in subjects]))
    return out


async def create(db: AsyncSession, user: User, data: HomeworkIn) -> HomeworkOut:
    await get_section(db, user.school_id, data.section_id)
    subject = await db.scalar(select(Subject).where(Subject.id == data.subject_id, Subject.school_id == user.school_id))
    if not subject:
        raise field_error("subject_id", "Choose a subject from your school")
    if not _allowed(await _scope(db, user), data.section_id, data.subject_id):
        raise Forbidden("You can only set homework for classes and subjects you teach", code="NOT_YOUR_CLASS")
    today = await school_today(db, user.school_id)
    if data.due_date < today:
        raise field_error("due_date", "The due date can't be in the past")
    h = Homework(school_id=user.school_id, section_id=data.section_id, subject_id=subject.id, title=data.title, details=data.details or None,
                 assigned_on=today, due_date=data.due_date, created_by=user.id)
    db.add(h)
    await db.flush()
    await audit_service.record(db, "homework.create", school_id=user.school_id, user_id=user.id, entity_type="homework", entity_id=h.id,
                               meta={"title": h.title})
    await notification_service.notify(
        db, await notification_service.family_of_sections(db, [h.section_id]), school_id=user.school_id, kind="homework",
        title=f"New homework: {subject.name}", body=f"{h.title} · due {h.due_date:%d %b}", link="/my-homework", data={"homework_id": h.id})
    return (await list_homework(db, user, PageParams(page=1, page_size=1), homework_id=h.id))[0][0]


async def _get(db: AsyncSession, user: User, homework_id: uuid.UUID) -> Homework:
    h = await db.scalar(select(Homework).where(Homework.id == homework_id, Homework.school_id == user.school_id))
    if not h:
        raise NotFound("Homework not found")
    return h


def _can_edit(user: User, h: Homework, scope) -> bool:
    return scope is None or h.created_by == user.id


async def update(db: AsyncSession, user: User, homework_id: uuid.UUID, data: HomeworkUpdate) -> None:
    h = await _get(db, user, homework_id)
    if not _can_edit(user, h, await _scope(db, user)):
        raise Forbidden("You can only edit homework you set", code="NOT_YOUR_HOMEWORK")
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None or k == "details":
            setattr(h, k, v)


async def delete(db: AsyncSession, user: User, homework_id: uuid.UUID) -> None:
    h = await _get(db, user, homework_id)
    if not _can_edit(user, h, await _scope(db, user)):
        raise Forbidden("You can only remove homework you set", code="NOT_YOUR_HOMEWORK")
    await db.delete(h)


async def list_homework(db: AsyncSession, user: User, page: PageParams, *, section_id: uuid.UUID | None = None,
                        homework_id: uuid.UUID | None = None, view: str | None = None) -> tuple[list[HomeworkOut], PageMeta]:
    """view "mine": what this person set, and their own subjects in the classes they teach. view "class": every subject in
    the classes they are class teacher (incharge) of. No view: all they may see."""
    scope = await _scope(db, user)
    stmt = (select(Homework, Subject.name, Subject.color, User.full_name).join(Subject, Subject.id == Homework.subject_id)
            .outerjoin(User, User.id == Homework.created_by).where(Homework.school_id == user.school_id))
    if homework_id:
        stmt = stmt.where(Homework.id == homework_id)
    if section_id:
        stmt = stmt.where(Homework.section_id == section_id)
    if scope is not None:
        stmt = stmt.where(_visible(user, scope))
    if view == "mine":
        taught = (await db.execute(select(TimetableEntry.section_id, TimetableEntry.subject_id)
                                   .where(TimetableEntry.teacher_id == user.id).distinct())).all()
        stmt = stmt.where(or_(Homework.created_by == user.id,
                              tuple_(Homework.section_id, Homework.subject_id).in_([tuple(r) for r in taught]) if taught else false()))
    elif view == "class":
        stmt = stmt.where(Homework.section_id.in_(select(Section.id).where(Section.class_teacher_id == user.id)))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (await db.execute(stmt.order_by(Homework.due_date.desc(), Homework.created_at.desc()).offset(page.offset).limit(page.page_size))).all()
    labels = await _labels(db, user.school_id)
    ids = [h.id for h, *_ in rows]
    stats = Counter()
    for hid, status in (await db.execute(select(HomeworkStatus.homework_id, HomeworkStatus.status).where(HomeworkStatus.homework_id.in_(ids)))).all():
        stats[(hid, status)] += 1
    sizes = dict((await db.execute(select(Student.section_id, func.count()).where(
        Student.school_id == user.school_id, Student.status == "active").group_by(Student.section_id))).all())
    out = [HomeworkOut(**_base(h, labels, (sn, sc), t), students=sizes.get(h.section_id, 0), done=stats[(h.id, "done")],
                       checked=stats[(h.id, "checked")], can_edit=_can_edit(user, h, scope)) for h, sn, sc, t in rows]
    await _attach(db, out)
    return out, PageMeta(total=total, page=page.page, page_size=page.page_size)


async def _attach(db: AsyncSession, items: list) -> None:
    """Fill in each homework's attached files."""
    ids = list({i.id for i in items})
    if not ids:
        return
    files: dict[uuid.UUID, list] = {}
    for f in (await db.scalars(select(StoredFile).where(StoredFile.purpose == "homework", StoredFile.owner_id.in_(ids))
                               .order_by(StoredFile.created_at))).all():
        files.setdefault(f.owner_id, []).append(f)
    for i in items:
        i.attachments = files.get(i.id, [])


async def detail(db: AsyncSession, user: User, homework_id: uuid.UUID) -> HomeworkDetail:
    h = await _get(db, user, homework_id)
    base = (await list_homework(db, user, PageParams(page=1, page_size=1), homework_id=h.id))[0]
    if not base:
        raise NotFound("Homework not found")
    students = (await db.scalars(select(Student).where(Student.section_id == h.section_id, Student.status == "active")
                                 .order_by(Student.roll_no.nulls_last(), Student.first_name))).all()
    st = {s.student_id: s for s in (await db.scalars(select(HomeworkStatus).where(HomeworkStatus.homework_id == h.id))).all()}
    roster = [HomeworkStudent(student_id=s.id, name=f"{s.first_name} {s.last_name}", roll_no=s.roll_no,
                              status=st[s.id].status if s.id in st else "pending", note=st[s.id].note if s.id in st else None,
                              remark=st[s.id].remark if s.id in st else None) for s in students]
    return HomeworkDetail(**base[0].model_dump(), roster=roster)


async def check(db: AsyncSession, user: User, homework_id: uuid.UUID, data: CheckSave) -> HomeworkDetail:
    h = await _get(db, user, homework_id)
    if not _allowed(await _scope(db, user), h.section_id, h.subject_id):
        raise Forbidden("You can only check homework for classes you teach", code="NOT_YOUR_CLASS")
    in_section = set((await db.scalars(select(Student.id).where(Student.section_id == h.section_id))).all())
    existing = {s.student_id: s for s in (await db.scalars(select(HomeworkStatus).where(HomeworkStatus.homework_id == h.id))).all()}
    now = datetime.now(UTC)
    for i, e in enumerate(data.entries):
        if e.student_id not in in_section:
            raise field_error(f"entries.{i}.student_id", "This student isn't in the class")
        row = existing.get(e.student_id)
        if e.status == "pending":  # undo the teacher's check; keep what the family said
            if row and row.note:
                row.status, row.remark, row.updated_at = "done", None, now
            elif row:
                await db.delete(row)
            continue
        row = row or HomeworkStatus(school_id=user.school_id, homework_id=h.id, student_id=e.student_id)
        row.status, row.remark, row.updated_at = e.status, e.remark or None, now
        db.add(row)
    await db.flush()
    return await detail(db, user, h.id)


async def my_homework(db: AsyncSession, user: User, days: int = 21) -> list[MyHomework]:
    today = await school_today(db, user.school_id)
    kids = await own_students(db, user)
    if not kids:
        return []
    labels = await _labels(db, user.school_id)
    rows = (await db.execute(select(Homework, Subject.name, Subject.color, User.full_name).join(Subject, Subject.id == Homework.subject_id)
                             .outerjoin(User, User.id == Homework.created_by)
                             .where(Homework.section_id.in_([k.section_id for k in kids]), Homework.due_date >= today - timedelta(days=days))
                             .order_by(Homework.due_date, Subject.name))).all()
    statuses = {(s.homework_id, s.student_id): s for s in (await db.scalars(select(HomeworkStatus).where(
        HomeworkStatus.student_id.in_([k.id for k in kids])))).all()}
    out = []
    for h, sn, sc, t in rows:
        for k in kids:
            if k.section_id != h.section_id:
                continue
            s = statuses.get((h.id, k.id))
            status = s.status if s else "pending"
            out.append(MyHomework(**_base(h, labels, (sn, sc), t), student_id=k.id, student_name=f"{k.first_name} {k.last_name}",
                                  status=status, note=s.note if s else None, remark=s.remark if s else None,
                                  overdue=status == "pending" and h.due_date < today))
    await _attach(db, out)
    return out


async def family_done(db: AsyncSession, user: User, homework_id: uuid.UUID, data: FamilyDone) -> None:
    h = await _get(db, user, homework_id)
    kid = next((k for k in await own_students(db, user) if k.id == data.student_id and k.section_id == h.section_id), None)
    if not kid:
        raise NotFound("Homework not found")
    row = await db.scalar(select(HomeworkStatus).where(HomeworkStatus.homework_id == h.id, HomeworkStatus.student_id == kid.id))
    if row and row.status in ("checked", "incomplete"):
        raise AppError("The teacher has already checked this homework", code="ALREADY_CHECKED", status_code=409)
    if not data.done:
        if row:
            await db.delete(row)
        return
    row = row or HomeworkStatus(school_id=user.school_id, homework_id=h.id, student_id=kid.id)
    row.status, row.note, row.updated_at = "done", data.note or None, datetime.now(UTC)
    db.add(row)


# ---- attachments: the teacher who set it (or an admin) uploads; staff and the class's families read --

async def _may_attach(db: AsyncSession, user: User, owner_id: uuid.UUID | None) -> bool:
    if not owner_id or not has_permission(user.role, "homework.manage"):
        return False
    h = await db.scalar(select(Homework).where(Homework.id == owner_id, Homework.school_id == user.school_id))
    return bool(h) and _can_edit(user, h, await _scope(db, user))


async def _may_read(db: AsyncSession, user: User, owner_id: uuid.UUID | None) -> bool:
    h = await db.scalar(select(Homework).where(Homework.id == owner_id, Homework.school_id == user.school_id))
    if not h:
        return False
    return user.role in STAFF_ROLES or h.section_id in {k.section_id for k in await own_students(db, user)}


storage_service.register_purpose("homework", storage_service.Purpose(can_upload=_may_attach, can_read=_may_read))
