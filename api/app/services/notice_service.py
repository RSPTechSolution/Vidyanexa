"""Notices: who can post to whom, who sees what, and read receipts."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select, true
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, NotFound
from app.core.permissions import STAFF_ROLES, Role, has_permission
from app.models import Notice, NoticeRead, SchoolClass, Section, Student, StudentGuardian, TimetableEntry, User
from app.schemas.common import PageMeta, PageParams
from app.schemas.communication import NoticeIn, NoticeOut
from app.services import audit_service, notification_service, sms_service
from app.services.academics_service import field_error
from app.services.family_service import own_students

AUDIENCE = {"everyone": "Everyone", "staff": "Staff", "families": "Parents & students"}


async def _section_labels(db: AsyncSession, school_id: uuid.UUID) -> dict[uuid.UUID, str]:
    rows = await db.execute(select(Section.id, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Section.class_id)
                            .where(Section.school_id == school_id))
    return {sid: f"{c} – {s}" for sid, c, s in rows.all()}


async def _audience_labeller(db: AsyncSession, school_id: uuid.UUID):
    """Turns section ids into "Class 6, Class 7 – A": whole classes by name, in class order."""
    rows = (await db.execute(select(Section.id, Section.name, SchoolClass.id, SchoolClass.name, SchoolClass.sort_order)
                             .join(SchoolClass, SchoolClass.id == Section.class_id).where(Section.school_id == school_id)
                             .order_by(SchoolClass.sort_order, Section.name))).all()
    by_class: dict[uuid.UUID, list] = {}
    info = {}
    for sid, sname, cid, cname, order in rows:
        by_class.setdefault(cid, []).append(sid)
        info[sid] = (cid, cname, sname, order)

    def label(section_ids: list[uuid.UUID]) -> str:
        picked = set(section_ids)
        parts = []
        for cid, sids in by_class.items():
            chosen = [s for s in sids if s in picked]
            if not chosen:
                continue
            cname = info[chosen[0]][1]
            parts += [cname] if len(chosen) == len(sids) else [f"{cname} – {info[s][2]}" for s in chosen]
        return ", ".join(parts) if len(parts) <= 4 else f"{', '.join(parts[:3])} and {len(parts) - 3} more"
    return label


async def _teacher_sections(db: AsyncSession, user: User) -> set[uuid.UUID]:
    own = set((await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id))).all())
    taught = set((await db.scalars(select(TimetableEntry.section_id).where(TimetableEntry.teacher_id == user.id).distinct())).all())
    return own | taught


async def _visible_filter(db: AsyncSession, user: User):
    """SQL condition for the notices this user may read."""
    if user.role in STAFF_ROLES:
        return true()  # staff see every notice, so they know what families were told
    sections = {s.section_id for s in await own_students(db, user)}
    conds = [Notice.audience.in_(["everyone", "families"])]
    if sections:
        conds.append(Notice.section_ids.overlap(list(sections)))
    return or_(*conds)


async def _recipients(db: AsyncSession, school_id: uuid.UUID, n: Notice) -> int:
    active = (User.school_id == school_id, User.is_active.is_(True), User.deleted_at.is_(None))
    if n.audience == "everyone":
        return await db.scalar(select(func.count()).select_from(User).where(*active)) or 0
    if n.audience == "staff":
        return await db.scalar(select(func.count()).select_from(User).where(*active, User.role.in_(STAFF_ROLES))) or 0
    if n.audience == "families":
        return await db.scalar(select(func.count()).select_from(User).where(*active, User.role.in_([Role.PARENT, Role.STUDENT]))) or 0
    kids = select(Student.id).where(Student.section_id.in_(n.section_ids), Student.status == "active")
    parents = select(StudentGuardian.user_id).where(StudentGuardian.student_id.in_(kids))
    students = select(Student.user_id).where(Student.id.in_(kids), Student.user_id.is_not(None))
    return await db.scalar(select(func.count(func.distinct(User.id))).where(*active, or_(User.id.in_(parents), User.id.in_(students)))) or 0


async def _recipient_ids(db: AsyncSession, school_id: uuid.UUID, n: Notice) -> list[uuid.UUID]:
    if n.audience == "sections":
        return await notification_service.family_of_sections(db, n.section_ids)
    q = select(User.id).where(User.school_id == school_id, User.is_active.is_(True), User.deleted_at.is_(None))
    if n.audience == "staff":
        q = q.where(User.role.in_(STAFF_ROLES))
    elif n.audience == "families":
        q = q.where(User.role.in_([Role.PARENT, Role.STUDENT]))
    return list((await db.scalars(q)).all())


def _can_edit(user: User, n: Notice) -> bool:
    return has_permission(user.role, "notices.manage") or n.created_by == user.id


async def _out(db: AsyncSession, user: User, n: Notice, read: bool, author: str | None, labels) -> NoticeOut:
    label = AUDIENCE.get(n.audience) or labels(n.section_ids)
    out = NoticeOut(id=n.id, title=n.title, body=n.body, audience=n.audience, audience_label=label, section_ids=n.section_ids,
                    priority=n.priority, pinned=n.pinned, created_at=n.created_at, author=author, read=read, can_edit=_can_edit(user, n))
    if out.can_edit:
        out.reads = await db.scalar(select(func.count()).select_from(NoticeRead).where(NoticeRead.notice_id == n.id)) or 0
        out.recipients = await _recipients(db, user.school_id, n)
    return out


async def list_notices(db: AsyncSession, user: User, page: PageParams, *, unread_only: bool = False) -> tuple[list[NoticeOut], PageMeta]:
    cond = await _visible_filter(db, user)
    read_ids = select(NoticeRead.notice_id).where(NoticeRead.user_id == user.id)
    stmt = select(Notice, User.full_name).outerjoin(User, User.id == Notice.created_by).where(Notice.school_id == user.school_id, cond)
    if unread_only:
        stmt = stmt.where(Notice.id.not_in(read_ids))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (await db.execute(stmt.order_by(Notice.pinned.desc(), Notice.created_at.desc()).offset(page.offset).limit(page.page_size))).all()
    read = set((await db.scalars(read_ids.where(NoticeRead.notice_id.in_([n.id for n, _ in rows])))).all())
    labels = await _audience_labeller(db, user.school_id)
    return [await _out(db, user, n, n.id in read, a, labels) for n, a in rows], PageMeta(total=total, page=page.page, page_size=page.page_size)


async def unread_count(db: AsyncSession, user: User) -> int:
    cond = await _visible_filter(db, user)
    read_ids = select(NoticeRead.notice_id).where(NoticeRead.user_id == user.id)
    return await db.scalar(select(func.count()).select_from(Notice).where(Notice.school_id == user.school_id, cond, Notice.id.not_in(read_ids))) or 0


async def _check_audience(db: AsyncSession, user: User, data: NoticeIn) -> None:
    if data.audience == "sections":
        labels = await _section_labels(db, user.school_id)
        for i, sid in enumerate(data.section_ids):
            if sid not in labels:
                raise field_error(f"section_ids.{i}", "Choose classes from your school")
    if has_permission(user.role, "notices.manage"):
        return
    if data.audience != "sections":
        raise field_error("audience", "Class teachers can post to their own class. Ask the office to send school-wide notices.")
    from app.services.academics_service import class_teacher_sections
    mine = await class_teacher_sections(db, user)
    if not set(data.section_ids) <= mine:
        raise field_error("section_ids", "Only the class teacher (incharge) can post to a class")
    if data.pinned:
        raise field_error("pinned", "Only the office can pin notices")


async def create(db: AsyncSession, user: User, data: NoticeIn) -> NoticeOut:
    await _check_audience(db, user, data)
    n = Notice(school_id=user.school_id, title=data.title, body=data.body, audience=data.audience, section_ids=data.section_ids,
               priority=data.priority, pinned=data.pinned, created_by=user.id)
    db.add(n)
    await db.flush()
    await mark_read(db, user, n.id)
    await audit_service.record(db, "notice.create", school_id=user.school_id, user_id=user.id, entity_type="notice", entity_id=n.id,
                               meta={"title": n.title, "audience": n.audience})
    await notification_service.notify(db, [u for u in await _recipient_ids(db, user.school_id, n) if u != user.id],
                                      school_id=user.school_id, kind="notice", title=n.title, body=n.body[:180],
                                      link="/notices", data={"notice_id": n.id, "priority": n.priority})
    # By SMS/WhatsApp on the channels the school chose: "Every notice" for all of them, "Urgent notices" (or either) for
    # an urgent one, each phone once.
    chans = set(await sms_service.channels_for(db, user.school_id, "notices"))
    if n.priority == "urgent":
        chans |= set(await sms_service.channels_for(db, user.school_id, "notice"))
    if chans:
        phones = (await db.scalars(select(User.phone).where(User.id.in_(await _recipient_ids(db, user.school_id, n)), User.phone.is_not(None)))).all()
        prefix = "Urgent from school" if n.priority == "urgent" else "Notice from school"
        await sms_service.queue(db, school_id=user.school_id, event_name="notice" if n.priority == "urgent" else "notices",
                                phones=list(dict.fromkeys(phones)), force=sorted(chans), body=f"{prefix}: {n.title}. {n.body[:300]}")
    await db.refresh(n)
    return await _out(db, user, n, True, user.full_name, await _audience_labeller(db, user.school_id))


async def _get(db: AsyncSession, user: User, notice_id: uuid.UUID) -> Notice:
    n = await db.scalar(select(Notice).where(Notice.id == notice_id, Notice.school_id == user.school_id, await _visible_filter(db, user)))
    if not n:
        raise NotFound("Notice not found")
    return n


async def update(db: AsyncSession, user: User, notice_id: uuid.UUID, data: NoticeIn) -> NoticeOut:
    n = await _get(db, user, notice_id)
    if not _can_edit(user, n):
        raise Forbidden("You can only edit your own notices", code="NOT_YOUR_NOTICE")
    await _check_audience(db, user, data)
    n.title, n.body, n.audience, n.section_ids, n.priority, n.pinned = data.title, data.body, data.audience, data.section_ids, data.priority, data.pinned
    await db.flush()
    await audit_service.record(db, "notice.update", school_id=user.school_id, user_id=user.id, entity_type="notice", entity_id=n.id)
    await db.refresh(n)
    author = await db.scalar(select(User.full_name).where(User.id == n.created_by))
    return await _out(db, user, n, True, author, await _audience_labeller(db, user.school_id))


async def delete(db: AsyncSession, user: User, notice_id: uuid.UUID) -> None:
    n = await _get(db, user, notice_id)
    if not _can_edit(user, n):
        raise Forbidden("You can only remove your own notices", code="NOT_YOUR_NOTICE")
    await db.delete(n)
    await audit_service.record(db, "notice.delete", school_id=user.school_id, user_id=user.id, entity_type="notice", entity_id=notice_id,
                               meta={"title": n.title})


async def mark_read(db: AsyncSession, user: User, notice_id: uuid.UUID) -> None:
    await db.execute(insert(NoticeRead).values(id=uuid.uuid4(), school_id=user.school_id, notice_id=notice_id, user_id=user.id,
                                               read_at=datetime.now(UTC)).on_conflict_do_nothing(constraint="uq_notice_read"))


async def read(db: AsyncSession, user: User, notice_id: uuid.UUID) -> None:
    await _get(db, user, notice_id)
    await mark_read(db, user, notice_id)


async def postable_sections(db: AsyncSession, user: User) -> list[dict]:
    labels = await _section_labels(db, user.school_id)
    from app.services.academics_service import class_teacher_sections
    allowed = set(labels) if has_permission(user.role, "notices.manage") else await class_teacher_sections(db, user)
    order = {sid: i for i, sid in enumerate((await db.scalars(select(Section.id).join(SchoolClass, SchoolClass.id == Section.class_id)
                                                               .where(Section.school_id == user.school_id).order_by(SchoolClass.sort_order, Section.name))).all())}
    return [{"id": str(s), "label": labels[s]} for s in sorted(allowed, key=lambda x: order.get(x, 0))]
