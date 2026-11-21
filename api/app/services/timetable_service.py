"""Subjects, the bell schedule, teacher availability and the weekly timetable."""
import uuid
from collections import Counter

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound
from app.core.permissions import Role
from app.models import (
    Period, SchoolClass, Section, Student, StudentGuardian, Subject, TeacherSubject, TeacherUnavailability,
    TimetableEntry, User,
)
from app.schemas.timetable import (
    AvailableTeacher, CopyTimetable, EntryOut, PeriodOut, PeriodsReplace, Slot, SlotSet, SubjectCreate, SubjectOut,
    SubjectUpdate, TeacherOut, TimetableView,
)
from app.services import audit_service
from app.services.academics_service import field_error, get_section

TEACHING_ROLES = (Role.TEACHER, Role.PRINCIPAL)
DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


# ---- helpers --------------------------------------------------------------------------------

async def _section_labels(db: AsyncSession, school_id: uuid.UUID) -> dict[uuid.UUID, str]:
    rows = await db.execute(
        select(Section.id, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Section.class_id)
        .where(Section.school_id == school_id))
    return {sid: f"{cname} – {sname}" for sid, cname, sname in rows.all()}


async def _teachers(db: AsyncSession, school_id: uuid.UUID) -> list[User]:
    return list((await db.scalars(select(User).where(
        User.school_id == school_id, User.role.in_(TEACHING_ROLES), User.is_active.is_(True), User.deleted_at.is_(None),
    ).order_by(User.full_name))).all())


async def _get_teacher(db: AsyncSession, school_id: uuid.UUID, teacher_id: uuid.UUID, field: str = "teacher_id") -> User:
    t = await db.scalar(select(User).where(User.id == teacher_id, User.school_id == school_id, User.deleted_at.is_(None)))
    if not t or t.role not in TEACHING_ROLES or not t.is_active:
        raise field_error(field, "Choose an active teacher from your school")
    return t


async def _get_period(db: AsyncSession, school_id: uuid.UUID, period_id: uuid.UUID) -> Period:
    p = await db.scalar(select(Period).where(Period.id == period_id, Period.school_id == school_id))
    if not p:
        raise field_error("period_id", "That period no longer exists. Refresh and try again.")
    return p


async def _entries(db: AsyncSession, school_id: uuid.UUID, *where) -> list[EntryOut]:
    labels = await _section_labels(db, school_id)
    rows = (await db.execute(
        select(TimetableEntry, Subject.name, Subject.color, User.full_name)
        .join(Subject, Subject.id == TimetableEntry.subject_id)
        .outerjoin(User, User.id == TimetableEntry.teacher_id)
        .where(TimetableEntry.school_id == school_id, *where)
    )).all()
    return [
        EntryOut(id=e.id, day=e.day, period_id=e.period_id, section_id=e.section_id, section_label=labels.get(e.section_id, ""),
                 subject_id=e.subject_id, subject_name=sname, subject_color=color, teacher_id=e.teacher_id,
                 teacher_name=tname, room=e.room)
        for e, sname, color, tname in rows
    ]


# ---- subjects -------------------------------------------------------------------------------

async def list_subjects(db: AsyncSession, school_id: uuid.UUID) -> list[SubjectOut]:
    subjects = (await db.scalars(select(Subject).where(Subject.school_id == school_id).order_by(Subject.name))).all()
    teachers = dict((await db.execute(select(TeacherSubject.subject_id, func.count()).where(
        TeacherSubject.school_id == school_id).group_by(TeacherSubject.subject_id))).all())
    periods = dict((await db.execute(select(TimetableEntry.subject_id, func.count()).where(
        TimetableEntry.school_id == school_id).group_by(TimetableEntry.subject_id))).all())
    out = []
    for s in subjects:
        o = SubjectOut.model_validate(s)
        o.teacher_count, o.periods_per_week = teachers.get(s.id, 0), periods.get(s.id, 0)
        out.append(o)
    return out


async def _subject(db: AsyncSession, school_id: uuid.UUID, subject_id: uuid.UUID) -> Subject:
    s = await db.scalar(select(Subject).where(Subject.id == subject_id, Subject.school_id == school_id))
    if not s:
        raise NotFound("Subject not found")
    return s


async def _subject_name_taken(db, school_id, name: str, exclude: uuid.UUID | None = None) -> bool:
    stmt = select(Subject.id).where(Subject.school_id == school_id, func.lower(Subject.name) == name.lower())
    if exclude:
        stmt = stmt.where(Subject.id != exclude)
    return bool(await db.scalar(stmt))


async def create_subject(db: AsyncSession, school_id: uuid.UUID, data: SubjectCreate, *, actor_id: uuid.UUID) -> Subject:
    if await _subject_name_taken(db, school_id, data.name):
        raise field_error("name", f"{data.name} already exists")
    s = Subject(school_id=school_id, name=data.name, code=data.code or None, color=data.color)
    db.add(s)
    await db.flush()
    await audit_service.record(db, "subject.create", school_id=school_id, user_id=actor_id, entity_type="subject",
                               entity_id=s.id, meta={"name": s.name})
    return s


async def update_subject(db: AsyncSession, school_id: uuid.UUID, subject_id: uuid.UUID, data: SubjectUpdate, *, actor_id: uuid.UUID) -> Subject:
    s = await _subject(db, school_id, subject_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("name") and await _subject_name_taken(db, school_id, values["name"], exclude=s.id):
        raise field_error("name", f"{values['name']} already exists")
    for k, v in values.items():
        if v is not None or k == "code":
            setattr(s, k, v or None if k == "code" else v)
    await audit_service.record(db, "subject.update", school_id=school_id, user_id=actor_id, entity_type="subject", entity_id=s.id)
    return s


async def delete_subject(db: AsyncSession, school_id: uuid.UUID, subject_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    s = await _subject(db, school_id, subject_id)
    used = await db.scalar(select(func.count()).select_from(TimetableEntry).where(TimetableEntry.subject_id == s.id))
    if used:
        raise Conflict(f"{s.name} is in {used} timetable slot{'s' if used != 1 else ''}. Remove it from the timetable first.",
                       code="SUBJECT_IN_USE")
    await db.delete(s)
    await audit_service.record(db, "subject.delete", school_id=school_id, user_id=actor_id, entity_type="subject",
                               entity_id=subject_id, meta={"name": s.name})


# ---- bell schedule --------------------------------------------------------------------------

async def list_periods(db: AsyncSession, school_id: uuid.UUID) -> list[Period]:
    return list((await db.scalars(select(Period).where(Period.school_id == school_id)
                                  .order_by(Period.sort_order, Period.start_time))).all())


async def replace_periods(db: AsyncSession, school_id: uuid.UUID, data: PeriodsReplace, *, actor_id: uuid.UUID) -> list[Period]:
    """Save the whole bell schedule. Periods left out are removed with their timetable slots."""
    items = sorted(data.periods, key=lambda p: p.start_time)
    for i in range(1, len(items)):
        if items[i].start_time < items[i - 1].end_time:
            raise field_error(f"periods.{data.periods.index(items[i])}",
                              f"{items[i].name} overlaps {items[i - 1].name}")
    existing = {p.id: p for p in await list_periods(db, school_id)}
    keep: set[uuid.UUID] = set()
    for order, item in enumerate(items, start=1):
        if item.id:
            p = existing.get(item.id)
            if not p:
                raise field_error(f"periods.{data.periods.index(item)}", "That period no longer exists. Refresh and try again.")
            keep.add(p.id)
            if item.is_break and not p.is_break:  # a lesson slot became a break
                await db.execute(delete(TimetableEntry).where(TimetableEntry.period_id == p.id))
            p.name, p.start_time, p.end_time, p.is_break, p.sort_order = item.name, item.start_time, item.end_time, item.is_break, order
        else:
            db.add(Period(school_id=school_id, name=item.name, start_time=item.start_time, end_time=item.end_time,
                          is_break=item.is_break, sort_order=order))
    for pid, p in existing.items():
        if pid not in keep:
            await db.delete(p)
    await db.flush()
    await audit_service.record(db, "timetable.periods", school_id=school_id, user_id=actor_id, entity_type="period",
                               meta={"periods": len(items), "removed": len(existing) - len(keep)})
    return await list_periods(db, school_id)


# ---- teachers -------------------------------------------------------------------------------

async def list_teachers(db: AsyncSession, school_id: uuid.UUID) -> list[TeacherOut]:
    teachers = await _teachers(db, school_id)
    subjects: dict[uuid.UUID, list[uuid.UUID]] = {}
    for tid, sid in (await db.execute(select(TeacherSubject.teacher_id, TeacherSubject.subject_id)
                                      .where(TeacherSubject.school_id == school_id))).all():
        subjects.setdefault(tid, []).append(sid)
    load = dict((await db.execute(select(TimetableEntry.teacher_id, func.count()).where(
        TimetableEntry.school_id == school_id, TimetableEntry.teacher_id.is_not(None)).group_by(TimetableEntry.teacher_id))).all())
    blocked: dict[uuid.UUID, list[Slot]] = {}
    for u in (await db.scalars(select(TeacherUnavailability).where(TeacherUnavailability.school_id == school_id))).all():
        blocked.setdefault(u.teacher_id, []).append(Slot(day=u.day, period_id=u.period_id))
    return [TeacherOut(id=t.id, full_name=t.full_name, designation=t.designation, employee_id=t.employee_id,
                       subject_ids=subjects.get(t.id, []), periods_per_week=load.get(t.id, 0), unavailable=blocked.get(t.id, []))
            for t in teachers]


async def set_teacher_subjects(db: AsyncSession, school_id: uuid.UUID, teacher_id: uuid.UUID, subject_ids: list[uuid.UUID], *, actor_id: uuid.UUID) -> None:
    await _get_teacher(db, school_id, teacher_id)
    ids = set(subject_ids)
    found = set((await db.scalars(select(Subject.id).where(Subject.school_id == school_id, Subject.id.in_(ids)))).all())
    if found != ids:
        raise field_error("subject_ids", "Choose subjects from your school")
    await db.execute(delete(TeacherSubject).where(TeacherSubject.teacher_id == teacher_id))
    db.add_all([TeacherSubject(school_id=school_id, teacher_id=teacher_id, subject_id=s) for s in ids])
    await audit_service.record(db, "teacher.subjects", school_id=school_id, user_id=actor_id, entity_type="user",
                               entity_id=teacher_id, meta={"subjects": len(ids)})


async def set_unavailability(db: AsyncSession, school_id: uuid.UUID, teacher_id: uuid.UUID, slots: list[Slot], *, actor_id: uuid.UUID) -> None:
    teacher = await _get_teacher(db, school_id, teacher_id)
    wanted = {(s.day, s.period_id) for s in slots}
    periods = {p.id: p for p in await list_periods(db, school_id)}
    if any(pid not in periods for _, pid in wanted):
        raise field_error("slots", "That period no longer exists. Refresh and try again.")
    # Can't mark a slot unavailable while the teacher is timetabled in it.
    labels = await _section_labels(db, school_id)
    for e in (await db.scalars(select(TimetableEntry).where(TimetableEntry.teacher_id == teacher_id))).all():
        if (e.day, e.period_id) in wanted:
            raise Conflict(f"{teacher.full_name} teaches {labels.get(e.section_id)} on {DAY_NAMES[e.day]}, "
                           f"{periods[e.period_id].name}. Reassign that lesson first.", code="TEACHER_SCHEDULED")
    await db.execute(delete(TeacherUnavailability).where(TeacherUnavailability.teacher_id == teacher_id))
    db.add_all([TeacherUnavailability(school_id=school_id, teacher_id=teacher_id, day=d, period_id=p) for d, p in wanted])
    await audit_service.record(db, "teacher.availability", school_id=school_id, user_id=actor_id, entity_type="user",
                               entity_id=teacher_id, meta={"unavailable_slots": len(wanted)})


async def available_teachers(db: AsyncSession, school_id: uuid.UUID, *, day: int, period_id: uuid.UUID,
                             subject_id: uuid.UUID | None, section_id: uuid.UUID | None) -> list[AvailableTeacher]:
    """Every teacher with whether they can take this slot, best candidates first."""
    await _get_period(db, school_id, period_id)
    labels = await _section_labels(db, school_id)
    busy = {e.teacher_id: e.section_id for e in (await db.scalars(select(TimetableEntry).where(
        TimetableEntry.school_id == school_id, TimetableEntry.day == day, TimetableEntry.period_id == period_id,
        TimetableEntry.teacher_id.is_not(None)))).all()}
    blocked = set((await db.scalars(select(TeacherUnavailability.teacher_id).where(
        TeacherUnavailability.school_id == school_id, TeacherUnavailability.day == day,
        TeacherUnavailability.period_id == period_id))).all())
    qualified = set((await db.scalars(select(TeacherSubject.teacher_id).where(TeacherSubject.subject_id == subject_id))).all()) if subject_id else None
    week: Counter = Counter()
    today: Counter = Counter()
    for tid, d in (await db.execute(select(TimetableEntry.teacher_id, TimetableEntry.day).where(
            TimetableEntry.school_id == school_id, TimetableEntry.teacher_id.is_not(None)))).all():
        week[tid] += 1
        if d == day:
            today[tid] += 1

    out = []
    for t in await _teachers(db, school_id):
        if t.id in busy:
            status = "current" if busy[t.id] == section_id else "busy"
        else:
            status = "unavailable" if t.id in blocked else "free"
        out.append(AvailableTeacher(
            id=t.id, full_name=t.full_name, status=status,
            busy_with=labels.get(busy[t.id]) if status == "busy" else None,
            qualified=True if qualified is None else t.id in qualified,
            periods_per_week=week[t.id], periods_that_day=today[t.id]))
    # Current teacher, then free and qualified, with the lightest load first.
    rank = {"current": 0, "free": 1, "busy": 2, "unavailable": 3}
    out.sort(key=lambda a: (rank[a.status], not a.qualified, a.periods_that_day, a.periods_per_week, a.full_name))
    return out


# ---- timetable ------------------------------------------------------------------------------

async def section_timetable(db: AsyncSession, school_id: uuid.UUID, section_id: uuid.UUID) -> TimetableView:
    section = await get_section(db, school_id, section_id)
    class_name = await db.scalar(select(SchoolClass.name).where(SchoolClass.id == section.class_id))
    teacher = await db.scalar(select(User.full_name).where(User.id == section.class_teacher_id)) if section.class_teacher_id else None
    return TimetableView(
        title=f"{class_name} – {section.name}", subtitle=f"Class teacher: {teacher}" if teacher else None,
        kind="section", owner_id=section.id,
        periods=[PeriodOut.model_validate(p) for p in await list_periods(db, school_id)],
        entries=await _entries(db, school_id, TimetableEntry.section_id == section.id))


async def teacher_timetable(db: AsyncSession, school_id: uuid.UUID, teacher_id: uuid.UUID) -> TimetableView:
    t = await db.scalar(select(User).where(User.id == teacher_id, User.school_id == school_id))
    if not t or t.role not in TEACHING_ROLES:
        raise NotFound("Teacher not found")
    entries = await _entries(db, school_id, TimetableEntry.teacher_id == t.id)
    return TimetableView(
        title=t.full_name, subtitle=f"{len(entries)} periods a week" + (f" · {t.designation}" if t.designation else ""),
        kind="teacher", owner_id=t.id,
        periods=[PeriodOut.model_validate(p) for p in await list_periods(db, school_id)], entries=entries)


async def set_slot(db: AsyncSession, school_id: uuid.UUID, data: SlotSet, *, actor_id: uuid.UUID) -> EntryOut:
    await get_section(db, school_id, data.section_id)
    period = await _get_period(db, school_id, data.period_id)
    if period.is_break:
        raise field_error("period_id", f"{period.name} is a break")
    subject = await db.scalar(select(Subject).where(Subject.id == data.subject_id, Subject.school_id == school_id))
    if not subject:
        raise field_error("subject_id", "Choose a subject from your school")
    if data.teacher_id:
        teacher = await _get_teacher(db, school_id, data.teacher_id)
        clash = await db.scalar(select(TimetableEntry).where(
            TimetableEntry.teacher_id == teacher.id, TimetableEntry.day == data.day, TimetableEntry.period_id == period.id,
            TimetableEntry.section_id != data.section_id))
        if clash:
            labels = await _section_labels(db, school_id)
            raise Conflict(f"{teacher.full_name} is already teaching {labels.get(clash.section_id)} "
                           f"on {DAY_NAMES[data.day]}, {period.name}", code="TEACHER_BUSY")
        if await db.scalar(select(TeacherUnavailability.id).where(
                TeacherUnavailability.teacher_id == teacher.id, TeacherUnavailability.day == data.day,
                TeacherUnavailability.period_id == period.id)):
            raise Conflict(f"{teacher.full_name} is marked unavailable on {DAY_NAMES[data.day]}, {period.name}",
                           code="TEACHER_UNAVAILABLE")

    entry = await db.scalar(select(TimetableEntry).where(
        TimetableEntry.section_id == data.section_id, TimetableEntry.day == data.day, TimetableEntry.period_id == period.id))
    if not entry:
        entry = TimetableEntry(school_id=school_id, section_id=data.section_id, day=data.day, period_id=period.id)
        db.add(entry)
    entry.subject_id, entry.teacher_id, entry.room = subject.id, data.teacher_id, data.room or None
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:  # someone booked the teacher a moment ago
        raise Conflict("That teacher was just booked for this period elsewhere. Refresh and try again.", code="TEACHER_BUSY") from None
    await audit_service.record(db, "timetable.set", school_id=school_id, user_id=actor_id, entity_type="timetable_entry",
                               entity_id=entry.id, meta={"day": data.day, "period": period.name, "subject": subject.name})
    return (await _entries(db, school_id, TimetableEntry.id == entry.id))[0]


async def clear_slot(db: AsyncSession, school_id: uuid.UUID, section_id: uuid.UUID, day: int, period_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    entry = await db.scalar(select(TimetableEntry).where(
        TimetableEntry.school_id == school_id, TimetableEntry.section_id == section_id,
        TimetableEntry.day == day, TimetableEntry.period_id == period_id))
    if not entry:
        raise NotFound("Nothing is scheduled in that slot")
    await db.delete(entry)
    await audit_service.record(db, "timetable.clear", school_id=school_id, user_id=actor_id, entity_type="timetable_entry", entity_id=entry.id)


async def copy_timetable(db: AsyncSession, school_id: uuid.UUID, target_id: uuid.UUID, data: CopyTimetable, *, actor_id: uuid.UUID) -> dict:
    """Replace a section's timetable with another's subjects. Teachers are copied only where they're free."""
    if data.source_section_id == target_id:
        raise field_error("source_section_id", "Choose a different section to copy from")
    await get_section(db, school_id, target_id)
    await get_section(db, school_id, data.source_section_id)
    source = (await db.scalars(select(TimetableEntry).where(TimetableEntry.section_id == data.source_section_id))).all()
    if not source:
        raise field_error("source_section_id", "That section has no timetable yet")
    await db.execute(delete(TimetableEntry).where(TimetableEntry.section_id == target_id))
    await db.flush()
    taken = set((await db.execute(select(TimetableEntry.teacher_id, TimetableEntry.day, TimetableEntry.period_id).where(
        TimetableEntry.school_id == school_id, TimetableEntry.teacher_id.is_not(None)))).all())
    taken |= set((await db.execute(select(TeacherUnavailability.teacher_id, TeacherUnavailability.day, TeacherUnavailability.period_id)
                                   .where(TeacherUnavailability.school_id == school_id))).all())
    with_teacher = 0
    for e in source:
        teacher = e.teacher_id if data.include_teachers and e.teacher_id and (e.teacher_id, e.day, e.period_id) not in taken else None
        if teacher:
            taken.add((teacher, e.day, e.period_id))
            with_teacher += 1
        db.add(TimetableEntry(school_id=school_id, section_id=target_id, day=e.day, period_id=e.period_id,
                              subject_id=e.subject_id, teacher_id=teacher, room=None))
    await db.flush()
    await audit_service.record(db, "timetable.copy", school_id=school_id, user_id=actor_id, entity_type="section",
                               entity_id=target_id, meta={"slots": len(source), "with_teacher": with_teacher})
    return {"copied": len(source), "with_teacher": with_teacher}


async def my_timetables(db: AsyncSession, user: User) -> list[TimetableView]:
    """What the signed-in user should see: their own teaching week, their children's, or their class's."""
    school_id = user.school_id
    if user.role in TEACHING_ROLES:
        return [await teacher_timetable(db, school_id, user.id)]
    if user.role == Role.PARENT:
        children = (await db.scalars(
            select(Student).join(StudentGuardian, StudentGuardian.student_id == Student.id)
            .where(StudentGuardian.user_id == user.id, Student.status == "active").order_by(Student.first_name))).all()
        views = []
        for c in children:
            v = await section_timetable(db, school_id, c.section_id)
            v.subtitle, v.title, v.student_id = v.title, f"{c.first_name} {c.last_name}", c.id
            views.append(v)
        return views
    if user.role == Role.STUDENT:
        s = await db.scalar(select(Student).where(Student.user_id == user.id, Student.status == "active"))
        return [await section_timetable(db, school_id, s.section_id)] if s else []
    return []
