"""Parent-teacher chat, parent-teacher meeting slots, and surveys."""
import uuid
from collections import Counter
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import func, literal, or_, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Forbidden, NotFound
from app.core.permissions import STAFF_ROLES, Role, has_permission
from app.models import (
    ChatMessage, Conversation, PtmBooking, PtmEvent, Section, Student, StudentGuardian, Subject, Survey, SurveyResponse,
    TimetableEntry, User,
)
from app.schemas.messaging import (
    ChatMessageOut, ChildSlots, Contact, ConversationOut, PtmIn, PtmOut, QuestionSummary, ScheduleRow, SlotOut, SurveyIn, SurveyOut,
    SurveyResults,
)
from app.services import audit_service, notification_service
from app.services.academics_service import field_error
from app.services.family_service import own_students, school_today
from app.services.homework_service import _labels

FAMILY = (Role.PARENT, Role.STUDENT)


def _is_family(user: User) -> bool:
    return user.role in FAMILY


# ---- chat -------------------------------------------------------------------------------------

async def contacts(db: AsyncSession, user: User) -> list[Contact]:
    out: list[Contact] = []
    if _is_family(user):
        subjects = dict((await db.execute(select(Subject.id, Subject.name).where(Subject.school_id == user.school_id))).all())
        for kid in await own_students(db, user):
            name = f"{kid.first_name} {kid.last_name}"
            section = await db.get(Section, kid.section_id)
            seen: set[uuid.UUID] = set()
            if section and section.class_teacher_id:
                t = await db.get(User, section.class_teacher_id)
                if t and t.is_active:
                    out.append(Contact(student_id=kid.id, student_name=name, user_id=t.id, name=t.full_name, role="Class teacher"))
                    seen.add(t.id)
            rows = (await db.execute(select(TimetableEntry.teacher_id, TimetableEntry.subject_id).where(
                TimetableEntry.section_id == kid.section_id, TimetableEntry.teacher_id.is_not(None)).distinct())).all()
            teach: dict[uuid.UUID, list[str]] = {}
            for tid, sid in rows:
                teach.setdefault(tid, []).append(subjects.get(sid, ""))
            names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(list(teach)), User.is_active.is_(True)))).all())
            for tid, subj in sorted(teach.items(), key=lambda x: names.get(x[0], "")):
                if tid in seen or tid not in names:
                    continue
                out.append(Contact(student_id=kid.id, student_name=name, user_id=tid, name=names[tid], role=f"{', '.join(sorted(set(subj)))} teacher"))
        return out
    if user.role not in STAFF_ROLES:
        return []
    # Each active student's parents, and the student too when they have their own login.
    parents = (select(Student, User, StudentGuardian.relationship).join(StudentGuardian, StudentGuardian.student_id == Student.id)
               .join(User, User.id == StudentGuardian.user_id))
    selves = select(Student, User, literal("student")).join(User, User.id == Student.user_id)
    sections = None
    if not has_permission(user.role, "attendance.manage"):  # teachers: families of the classes they teach
        own = set((await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id))).all())
        taught = set((await db.scalars(select(TimetableEntry.section_id).where(TimetableEntry.teacher_id == user.id))).all())
        sections = own | taught
    rows = []
    for q in (parents, selves):
        q = q.where(Student.school_id == user.school_id, Student.status == "active", User.is_active.is_(True), User.deleted_at.is_(None))
        if sections is not None:
            q = q.where(Student.section_id.in_(sections))
        rows += (await db.execute(q)).all()
    rows.sort(key=lambda r: (r[0].first_name, r[0].last_name, r[2] != "student", r[1].full_name))
    for s, u, rel in rows:
        out.append(Contact(student_id=s.id, student_name=f"{s.first_name} {s.last_name}", user_id=u.id, name=u.full_name, role=rel.title()))
    return out


async def _conv_out(db: AsyncSession, user: User, convs: list[Conversation]) -> list[ConversationOut]:
    if not convs:
        return []
    ids = [c.id for c in convs]
    students = {s.id: s for s in (await db.scalars(select(Student).where(Student.id.in_({c.student_id for c in convs})))).all()}
    others = {c.id: (c.staff_id if c.family_id == user.id else c.family_id) for c in convs}
    users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_(set(others.values()))))).all()}
    last = {}
    for cid, body in (await db.execute(select(ChatMessage.conversation_id, ChatMessage.body).ext(distinct_on(ChatMessage.conversation_id))
                                       .where(ChatMessage.conversation_id.in_(ids))
                                       .order_by(ChatMessage.conversation_id, ChatMessage.created_at.desc()))).all():
        last[cid] = body
    unread = dict((await db.execute(select(ChatMessage.conversation_id, func.count()).where(
        ChatMessage.conversation_id.in_(ids), ChatMessage.sender_id != user.id, ChatMessage.read_at.is_(None))
        .group_by(ChatMessage.conversation_id))).all())
    out = []
    for c in convs:
        o = users.get(others[c.id])
        s = students.get(c.student_id)
        role = ("Parent" if o and o.role == Role.PARENT else "Student") if c.family_id != user.id else ("Teacher" if o and o.role == Role.TEACHER else "School")
        out.append(ConversationOut(id=c.id, student_id=c.student_id, student_name=f"{s.first_name} {s.last_name}" if s else "",
                                   other_id=others[c.id], other_name=o.full_name if o else "Former user", other_role=role,
                                   last_message=(last.get(c.id) or "")[:120] or None, last_message_at=c.last_message_at, unread=unread.get(c.id, 0)))
    return out


async def conversations(db: AsyncSession, user: User) -> list[ConversationOut]:
    rows = (await db.scalars(select(Conversation).where(Conversation.school_id == user.school_id,
                                                        or_(Conversation.family_id == user.id, Conversation.staff_id == user.id))
                             .order_by(Conversation.last_message_at.desc().nulls_last()))).all()
    return await _conv_out(db, user, list(rows))


async def unread_total(db: AsyncSession, user: User) -> int:
    return await db.scalar(select(func.count()).select_from(ChatMessage).join(Conversation, Conversation.id == ChatMessage.conversation_id)
                           .where(or_(Conversation.family_id == user.id, Conversation.staff_id == user.id),
                                  ChatMessage.sender_id != user.id, ChatMessage.read_at.is_(None))) or 0


async def _post(db: AsyncSession, user: User, c: Conversation, body: str) -> ChatMessage:
    # Stamp from one clock and never before the previous message, so the thread keeps its order even if the clock steps back.
    at = datetime.now(UTC)
    if c.last_message_at and at <= c.last_message_at:
        at = c.last_message_at + timedelta(microseconds=1)
    m = ChatMessage(school_id=c.school_id, conversation_id=c.id, sender_id=user.id, body=body, created_at=at)
    db.add(m)
    c.last_message_at = at
    await db.flush()
    await db.refresh(m)
    other = c.staff_id if c.family_id == user.id else c.family_id
    await notification_service.notify(db, [other], school_id=c.school_id, kind="chat", title=f"Message from {user.full_name}",
                                      body=body[:140], link=f"/messages?c={c.id}", data={"conversation_id": c.id})
    return m


async def start(db: AsyncSession, user: User, student_id: uuid.UUID, other_id: uuid.UUID, body: str) -> ConversationOut:
    if not any(x.student_id == student_id and x.user_id == other_id for x in await contacts(db, user)):
        raise Forbidden("You can't message this person about this student", code="NOT_A_CONTACT")
    family, staff = (user.id, other_id) if _is_family(user) else (other_id, user.id)
    c = await db.scalar(select(Conversation).where(Conversation.student_id == student_id, Conversation.family_id == family,
                                                   Conversation.staff_id == staff))
    if not c:
        c = Conversation(school_id=user.school_id, student_id=student_id, family_id=family, staff_id=staff)
        db.add(c)
        await db.flush()
    await _post(db, user, c, body)
    return (await _conv_out(db, user, [c]))[0]


async def _conversation(db: AsyncSession, user: User, cid: uuid.UUID) -> Conversation:
    c = await db.scalar(select(Conversation).where(Conversation.id == cid, Conversation.school_id == user.school_id))
    if not c or user.id not in (c.family_id, c.staff_id):
        raise NotFound("Conversation not found")
    return c


async def messages(db: AsyncSession, user: User, cid: uuid.UUID) -> list[ChatMessageOut]:
    c = await _conversation(db, user, cid)
    rows = list((await db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == c.id)
                                  .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(200))).all())
    now = datetime.now(UTC)
    for m in rows:
        if m.sender_id != user.id and m.read_at is None:
            m.read_at = now
    await db.flush()
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_({m.sender_id for m in rows if m.sender_id})))).all())
    return [ChatMessageOut(id=m.id, mine=m.sender_id == user.id, sender=names.get(m.sender_id), body=m.body, created_at=m.created_at,
                           read=m.read_at is not None) for m in reversed(rows)]


async def send(db: AsyncSession, user: User, cid: uuid.UUID, body: str) -> ChatMessageOut:
    c = await _conversation(db, user, cid)
    m = await _post(db, user, c, body)
    return ChatMessageOut(id=m.id, mine=True, sender=user.full_name, body=m.body, created_at=m.created_at, read=False)


# ---- parent-teacher meetings ------------------------------------------------------------------

def _slots(e: PtmEvent) -> list[time]:
    out, t = [], datetime.combine(e.date, e.start_time)
    end = datetime.combine(e.date, e.end_time)
    while t + timedelta(minutes=e.slot_minutes) <= end:
        out.append(t.time())
        t += timedelta(minutes=e.slot_minutes)
    return out


async def _ptm_out(db: AsyncSession, user: User, e: PtmEvent) -> PtmOut:
    labels = await _labels(db, user.school_id)
    booked = await db.scalar(select(func.count()).select_from(PtmBooking).where(PtmBooking.event_id == e.id)) or 0
    teachers = await db.scalar(select(func.count(func.distinct(Section.class_teacher_id))).where(Section.id.in_(e.section_ids))) or 0
    today = await school_today(db, user.school_id)
    return PtmOut(id=e.id, title=e.title, date=e.date, start_time=e.start_time.strftime("%H:%M"), end_time=e.end_time.strftime("%H:%M"),
                  slot_minutes=e.slot_minutes, sections_label=", ".join(labels.get(s, ("", 0))[0] for s in e.section_ids[:6])
                  + (f" +{len(e.section_ids) - 6} more" if len(e.section_ids) > 6 else ""),
                  location=e.location, notes=e.notes, booked=booked, slots=len(_slots(e)) * teachers, past=e.date < today)


async def create_ptm(db: AsyncSession, user: User, data: PtmIn) -> PtmOut:
    labels = await _labels(db, user.school_id)
    for i, sid in enumerate(data.section_ids):
        if sid not in labels:
            raise field_error(f"section_ids.{i}", "Choose classes from your school")
    if data.date < await school_today(db, user.school_id):
        raise field_error("date", "The date has passed")
    from app.services.attendance_extra_service import closed_reason
    if reason := await closed_reason(db, user.school_id, data.date):
        raise field_error("date", f"The school is closed that day ({reason.rstrip('.')})")
    e = PtmEvent(school_id=user.school_id, created_by=user.id, **data.model_dump())
    db.add(e)
    await db.flush()
    await notification_service.notify(db, await notification_service.family_of_sections(db, data.section_ids), school_id=user.school_id,
                                      kind="ptm", title=f"{e.title}: book a slot", body=f"{e.date:%A %d %b}, {e.start_time:%H:%M}–{e.end_time:%H:%M}",
                                      link="/ptm", data={"ptm_id": e.id})
    await audit_service.record(db, "ptm.create", school_id=user.school_id, user_id=user.id, entity_type="ptm", entity_id=e.id,
                               meta={"title": e.title, "date": e.date.isoformat()})
    return await _ptm_out(db, user, e)


async def list_ptm(db: AsyncSession, user: User) -> list[PtmOut]:
    q = select(PtmEvent).where(PtmEvent.school_id == user.school_id)
    if _is_family(user):
        q = q.where(PtmEvent.section_ids.overlap([k.section_id for k in await own_students(db, user)] or [uuid.uuid4()]))
    elif not has_permission(user.role, "ptm.manage"):
        q = q.where(PtmEvent.section_ids.overlap(list((await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id))).all())
                                                 or [uuid.uuid4()]))
    return [await _ptm_out(db, user, e) for e in (await db.scalars(q.order_by(PtmEvent.date.desc()))).all()]


async def _event(db: AsyncSession, user: User, eid: uuid.UUID) -> PtmEvent:
    e = await db.scalar(select(PtmEvent).where(PtmEvent.id == eid, PtmEvent.school_id == user.school_id))
    if not e:
        raise NotFound("Meeting not found")
    return e


async def child_slots(db: AsyncSession, user: User, eid: uuid.UUID) -> list[ChildSlots]:
    e = await _event(db, user, eid)
    out = []
    for kid in await own_students(db, user):
        if kid.section_id not in e.section_ids:
            continue
        section = await db.get(Section, kid.section_id)
        teacher = await db.get(User, section.class_teacher_id) if section and section.class_teacher_id else None
        taken = {b.slot: b for b in (await db.scalars(select(PtmBooking).where(PtmBooking.event_id == e.id,
                                                                             PtmBooking.teacher_id == (teacher.id if teacher else None)))).all()}
        mine = next((b for b in taken.values() if b.student_id == kid.id), None)
        out.append(ChildSlots(student_id=kid.id, student_name=f"{kid.first_name} {kid.last_name}", teacher_id=teacher.id if teacher else None,
                              teacher_name=teacher.full_name if teacher else None, booking=mine.slot.strftime("%H:%M") if mine else None,
                              slots=[SlotOut(time=t.strftime("%H:%M"), free=t not in taken, mine=bool(mine and mine.slot == t)) for t in _slots(e)]
                              if teacher else []))
    return out


async def book(db: AsyncSession, user: User, eid: uuid.UUID, student_id: uuid.UUID, slot: str, note: str | None) -> list[ChildSlots]:
    e = await _event(db, user, eid)
    kid = next((k for k in await own_students(db, user) if k.id == student_id and k.section_id in e.section_ids), None)
    if not kid:
        raise NotFound("Student not found")
    if e.date < await school_today(db, user.school_id):
        raise AppError("This meeting has passed", code="PTM_PAST", status_code=409)
    section = await db.get(Section, kid.section_id)
    if not section.class_teacher_id:
        raise AppError("This class has no class teacher yet", code="NO_TEACHER", status_code=409)
    t = time.fromisoformat(slot)
    if t not in _slots(e):
        raise field_error("slot", "Choose one of the listed times")
    clash = await db.scalar(select(PtmBooking).where(PtmBooking.event_id == e.id, PtmBooking.teacher_id == section.class_teacher_id,
                                                     PtmBooking.slot == t))
    if clash and clash.student_id != kid.id:
        raise AppError("Someone has just booked this time. Choose another.", code="SLOT_TAKEN", status_code=409)
    existing = await db.scalar(select(PtmBooking).where(PtmBooking.event_id == e.id, PtmBooking.student_id == kid.id))
    if existing:
        existing.slot, existing.note, existing.booked_by = t, note, user.id
    else:
        db.add(PtmBooking(school_id=user.school_id, event_id=e.id, teacher_id=section.class_teacher_id, slot=t, student_id=kid.id,
                          booked_by=user.id, note=note))
    await db.flush()
    return await child_slots(db, user, eid)


async def cancel_booking(db: AsyncSession, user: User, eid: uuid.UUID, student_id: uuid.UUID) -> list[ChildSlots]:
    if student_id not in {k.id for k in await own_students(db, user)}:
        raise NotFound("Student not found")
    b = await db.scalar(select(PtmBooking).where(PtmBooking.event_id == eid, PtmBooking.student_id == student_id))
    if b:
        await db.delete(b)
        await db.flush()
    return await child_slots(db, user, eid)


async def schedule(db: AsyncSession, user: User, eid: uuid.UUID, teacher_id: uuid.UUID | None) -> list[ScheduleRow]:
    e = await _event(db, user, eid)
    tid = teacher_id if teacher_id and has_permission(user.role, "ptm.manage") else user.id
    bookings = {b.slot: b for b in (await db.scalars(select(PtmBooking).where(PtmBooking.event_id == e.id, PtmBooking.teacher_id == tid))).all()}
    students = {s.id: s for s in (await db.scalars(select(Student).where(Student.id.in_([b.student_id for b in bookings.values()])))).all()}
    bookers = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_([b.booked_by for b in bookings.values() if b.booked_by])))).all()}
    out = []
    for t in _slots(e):
        b = bookings.get(t)
        s = students.get(b.student_id) if b else None
        u = bookers.get(b.booked_by) if b else None
        out.append(ScheduleRow(time=t.strftime("%H:%M"), student_id=s.id if s else None, student_name=f"{s.first_name} {s.last_name}" if s else None,
                               parent=u.full_name if u else None, phone=u.phone if u else None, note=b.note if b else None))
    return out


async def delete_ptm(db: AsyncSession, user: User, eid: uuid.UUID) -> None:
    await db.delete(await _event(db, user, eid))


# ---- surveys ----------------------------------------------------------------------------------

AUDIENCE = {"everyone": "Everyone", "families": "Parents and students", "staff": "Staff"}


async def _audience_ids(db: AsyncSession, school_id: uuid.UUID, s: Survey) -> list[uuid.UUID]:
    if s.audience == "sections":
        return await notification_service.family_of_sections(db, s.section_ids)
    q = select(User.id).where(User.school_id == school_id, User.is_active.is_(True), User.deleted_at.is_(None))
    if s.audience == "staff":
        q = q.where(User.role.in_(STAFF_ROLES))
    elif s.audience == "families":
        q = q.where(User.role.in_(FAMILY))
    return list((await db.scalars(q)).all())


async def _for_me(db: AsyncSession, user: User, s: Survey) -> bool:
    if s.audience == "everyone":
        return True
    if s.audience == "staff":
        return user.role in STAFF_ROLES
    if s.audience == "families":
        return _is_family(user)
    return bool({k.section_id for k in await own_students(db, user)} & set(s.section_ids))


def _open(s: Survey) -> bool:
    return s.published and (s.closes_at is None or s.closes_at > datetime.now(UTC))


async def _survey_out(db: AsyncSession, user: User, s: Survey) -> SurveyOut:
    labels = await _labels(db, user.school_id)
    n = await db.scalar(select(func.count()).select_from(SurveyResponse).where(SurveyResponse.survey_id == s.id)) or 0
    mine = await db.scalar(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id, SurveyResponse.user_id == user.id))
    return SurveyOut(id=s.id, title=s.title, description=s.description, audience=s.audience,
                     audience_label=AUDIENCE.get(s.audience) or ", ".join(labels.get(x, ("", 0))[0] for x in s.section_ids),
                     section_ids=s.section_ids, questions=s.questions, anonymous=s.anonymous, closes_at=s.closes_at, published=s.published,
                     open=_open(s), responses=n, answered=mine is not None, can_edit=has_permission(user.role, "surveys.manage"))


async def list_surveys(db: AsyncSession, user: User) -> list[SurveyOut]:
    rows = (await db.scalars(select(Survey).where(Survey.school_id == user.school_id).order_by(Survey.created_at.desc()))).all()
    if has_permission(user.role, "surveys.manage"):
        return [await _survey_out(db, user, s) for s in rows]
    return [await _survey_out(db, user, s) for s in rows if s.published and await _for_me(db, user, s)]


async def save_survey(db: AsyncSession, user: User, data: SurveyIn, sid: uuid.UUID | None = None) -> SurveyOut:
    labels = await _labels(db, user.school_id)
    for i, x in enumerate(data.section_ids):
        if x not in labels:
            raise field_error(f"section_ids.{i}", "Choose classes from your school")
    body = {**data.model_dump(), "questions": [q.model_dump() for q in data.questions]}
    if sid:
        s = await _survey(db, user, sid)
        if await db.scalar(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id).limit(1)):
            raise AppError("People have answered this survey; it can't be changed", code="SURVEY_ANSWERED", status_code=409)
        for k, v in body.items():
            setattr(s, k, v)
    else:
        s = Survey(school_id=user.school_id, created_by=user.id, **body)
        db.add(s)
    await db.flush()
    await db.refresh(s)
    return await _survey_out(db, user, s)


async def _survey(db: AsyncSession, user: User, sid: uuid.UUID) -> Survey:
    s = await db.scalar(select(Survey).where(Survey.id == sid, Survey.school_id == user.school_id))
    if not s:
        raise NotFound("Survey not found")
    return s


async def publish_survey(db: AsyncSession, user: User, sid: uuid.UUID, on: bool) -> SurveyOut:
    s = await _survey(db, user, sid)
    was = s.published
    s.published = on
    await db.flush()
    if on and not was:
        await notification_service.notify(db, [u for u in await _audience_ids(db, user.school_id, s) if u != user.id], school_id=user.school_id,
                                          kind="survey", title=f"Survey: {s.title}", body="A few quick questions from the school.", link="/surveys",
                                          data={"survey_id": s.id})
    return await _survey_out(db, user, s)


async def delete_survey(db: AsyncSession, user: User, sid: uuid.UUID) -> None:
    await db.delete(await _survey(db, user, sid))


async def respond(db: AsyncSession, user: User, sid: uuid.UUID, answers: dict) -> SurveyOut:
    s = await _survey(db, user, sid)
    if not s.published or not await _for_me(db, user, s):
        raise NotFound("Survey not found")
    if not _open(s):
        raise AppError("This survey has closed", code="SURVEY_CLOSED", status_code=409)
    if await db.scalar(select(SurveyResponse.id).where(SurveyResponse.survey_id == s.id, SurveyResponse.user_id == user.id)):
        raise AppError("You've already answered this survey", code="SURVEY_ANSWERED", status_code=409)
    clean = {}
    for q in s.questions:
        a = answers.get(q["id"])
        empty = a in (None, "", [])
        if empty:
            if q.get("required", True):
                raise field_error(f"answers.{q['id']}", "Please answer this question")
            continue
        if q["kind"] == "choice" and a not in q["options"]:
            raise field_error(f"answers.{q['id']}", "Choose one of the options")
        if q["kind"] == "multi" and (not isinstance(a, list) or not set(a) <= set(q["options"])):
            raise field_error(f"answers.{q['id']}", "Choose from the options")
        if q["kind"] == "rating" and (not isinstance(a, int) or not 1 <= a <= 5):
            raise field_error(f"answers.{q['id']}", "Rate from 1 to 5")
        if q["kind"] == "text":
            a = str(a)[:2000]
        clean[q["id"]] = a
    db.add(SurveyResponse(school_id=user.school_id, survey_id=s.id, user_id=user.id, answers=clean))
    await db.flush()
    return await _survey_out(db, user, s)


async def results(db: AsyncSession, user: User, sid: uuid.UUID) -> SurveyResults:
    s = await _survey(db, user, sid)
    rows = (await db.execute(select(SurveyResponse, User.full_name).join(User, User.id == SurveyResponse.user_id)
                             .where(SurveyResponse.survey_id == s.id))).all()
    out = []
    for q in s.questions:
        vals = [(r.answers or {}).get(q["id"]) for r, _ in rows]
        given = [v for v in vals if v not in (None, "", [])]
        summ = QuestionSummary(id=q["id"], kind=q["kind"], text=q["text"], answers=len(given))
        if q["kind"] == "choice":
            c = Counter(given)
            summ.counts = {o: c.get(o, 0) for o in q["options"]}
        elif q["kind"] == "multi":
            c = Counter(x for v in given for x in v)
            summ.counts = {o: c.get(o, 0) for o in q["options"]}
        elif q["kind"] == "rating":
            c = Counter(given)
            summ.counts = {str(i): c.get(i, 0) for i in range(1, 6)}
            summ.average = round(sum(given) / len(given), 2) if given else None
        else:
            summ.texts = [{"text": (r.answers or {}).get(q["id"]), "by": None if s.anonymous else name}
                          for r, name in rows if (r.answers or {}).get(q["id"])][:300]
        out.append(summ)
    return SurveyResults(survey=await _survey_out(db, user, s), responses=len(rows),
                         audience_size=len(await _audience_ids(db, user.school_id, s)), questions=out)

