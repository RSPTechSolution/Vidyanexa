"""Exams: date sheets, mark entry, results, report cards."""
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Conflict, Forbidden, NotFound
from app.core.permissions import has_permission
from app.models import (
    AttendanceRecord, Exam, ExamMark, ExamPaper, ExamRemark, School, SchoolClass, Section, Student, Subject, TimetableEntry,
    User,
)
from app.schemas.exams import (
    ChildResults, ClassPapers, ClassPapersSet, ExamDetail, ExamIn, ExamOut, ExamUpdate, FromTimetable, MarkRow, MarksSave,
    MarksSheet, MarksSheetRef, MyExam, PaperOut, ReportCard, SectionResults, StudentResult, SubjectResult, SubjectStat,
)
from app.services import audit_service, co_live_service, notification_service, sms_service
from app.services.academics_service import field_error, get_section
from app.services.attendance_service import _counts, academic_year_start
from app.services.family_service import own_students, school_today, student_label

# CBSE eight-point scale: (lowest percentage, grade)
GRADES = [(91, "A1"), (81, "A2"), (71, "B1"), (61, "B2"), (51, "C1"), (41, "C2"), (33, "D"), (0, "E")]


def grade(percent: float | None) -> str | None:
    if percent is None:
        return None
    return next(g for floor, g in GRADES if percent >= floor)


def _year(d: date) -> str:
    y = academic_year_start(d).year
    return f"{y}-{(y + 1) % 100:02d}"


async def _get_exam(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID) -> Exam:
    e = await db.scalar(select(Exam).where(Exam.id == exam_id, Exam.school_id == school_id))
    if not e:
        raise NotFound("Exam not found")
    return e


def _status(e: Exam, today: date) -> str:
    if e.published_at:
        return "published"
    if not e.start_date:
        return "draft"
    if today < e.start_date:
        return "upcoming"
    if e.end_date and today <= e.end_date:
        return "ongoing"
    return "marks_entry"


async def _class_sizes(db: AsyncSession, school_id: uuid.UUID) -> dict[uuid.UUID, int]:
    return dict((await db.execute(select(Student.class_id, func.count()).where(
        Student.school_id == school_id, Student.status == "active").group_by(Student.class_id))).all())


async def _exam_out(db: AsyncSession, e: Exam, today: date, sizes: dict) -> ExamOut:
    papers = (await db.scalars(select(ExamPaper).where(ExamPaper.exam_id == e.id))).all()
    entered = await db.scalar(select(func.count()).select_from(ExamMark).join(ExamPaper, ExamPaper.id == ExamMark.paper_id)
                              .where(ExamPaper.exam_id == e.id)) or 0
    return ExamOut(id=e.id, name=e.name, kind=e.kind, academic_year=e.academic_year, start_date=e.start_date, end_date=e.end_date,
                   published_at=e.published_at, status=_status(e, today), classes=len({p.class_id for p in papers}),
                   papers=len(papers), marks_entered=entered, marks_expected=sum(sizes.get(p.class_id, 0) for p in papers))


# ---- exams & date sheets ----------------------------------------------------------------------

async def list_exams(db: AsyncSession, school_id: uuid.UUID) -> list[ExamOut]:
    today = await school_today(db, school_id)
    sizes = await _class_sizes(db, school_id)
    exams = (await db.scalars(select(Exam).where(Exam.school_id == school_id)
                              .order_by(Exam.start_date.desc().nulls_first(), Exam.created_at.desc()))).all()
    return [await _exam_out(db, e, today, sizes) for e in exams]


async def create_exam(db: AsyncSession, school_id: uuid.UUID, data: ExamIn, *, actor_id: uuid.UUID) -> Exam:
    if await db.scalar(select(Exam.id).where(Exam.school_id == school_id, func.lower(Exam.name) == data.name.lower())):
        raise field_error("name", f"{data.name} already exists")
    today = await school_today(db, school_id)
    e = Exam(school_id=school_id, name=data.name, kind=data.kind, start_date=data.start_date, end_date=data.end_date,
             academic_year=_year(data.start_date or today))
    db.add(e)
    await db.flush()
    await audit_service.record(db, "exam.create", school_id=school_id, user_id=actor_id, entity_type="exam", entity_id=e.id, meta={"name": e.name})
    return e


async def update_exam(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, data: ExamUpdate, *, actor_id: uuid.UUID) -> Exam:
    e = await _get_exam(db, school_id, exam_id)
    values = data.model_dump(exclude_unset=True)
    if values.get("name") and await db.scalar(select(Exam.id).where(
            Exam.school_id == school_id, func.lower(Exam.name) == values["name"].lower(), Exam.id != e.id)):
        raise field_error("name", f"{values['name']} already exists")
    for k, v in values.items():
        setattr(e, k, v)
    if e.start_date and e.end_date and e.end_date < e.start_date:
        raise field_error("end_date", "The exam can't end before it starts")
    await audit_service.record(db, "exam.update", school_id=school_id, user_id=actor_id, entity_type="exam", entity_id=e.id)
    return e


async def delete_exam(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    e = await _get_exam(db, school_id, exam_id)
    n = await db.scalar(select(func.count()).select_from(ExamMark).join(ExamPaper, ExamPaper.id == ExamMark.paper_id).where(ExamPaper.exam_id == e.id))
    if n:
        raise Conflict(f"{e.name} already has {n} marks entered and can't be deleted", code="EXAM_HAS_MARKS")
    await db.delete(e)
    await audit_service.record(db, "exam.delete", school_id=school_id, user_id=actor_id, entity_type="exam", entity_id=exam_id, meta={"name": e.name})


async def exam_detail(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID) -> ExamDetail:
    e = await _get_exam(db, school_id, exam_id)
    today = await school_today(db, school_id)
    sizes = await _class_sizes(db, school_id)
    base = await _exam_out(db, e, today, sizes)
    rows = (await db.execute(select(ExamPaper, Subject.name, Subject.color, SchoolClass.name, SchoolClass.sort_order)
                             .join(Subject, Subject.id == ExamPaper.subject_id).join(SchoolClass, SchoolClass.id == ExamPaper.class_id)
                             .where(ExamPaper.exam_id == e.id)
                             .order_by(SchoolClass.sort_order, ExamPaper.exam_date.nulls_last(), Subject.name))).all()
    entered = dict((await db.execute(select(ExamMark.paper_id, func.count()).join(ExamPaper, ExamPaper.id == ExamMark.paper_id)
                                     .where(ExamPaper.exam_id == e.id).group_by(ExamMark.paper_id))).all())
    by_class: dict[uuid.UUID, ClassPapers] = {}
    for p, sname, color, cname, _ in rows:
        cp = by_class.setdefault(p.class_id, ClassPapers(class_id=p.class_id, class_name=cname, papers=[]))
        cp.papers.append(PaperOut(id=p.id, class_id=p.class_id, subject_id=p.subject_id, subject_name=sname, subject_color=color,
                                  exam_date=p.exam_date, max_marks=p.max_marks, pass_marks=p.pass_marks,
                                  marks_entered=entered.get(p.id, 0), students=sizes.get(p.class_id, 0)))
    return ExamDetail(**base.model_dump(), classes_detail=list(by_class.values()))


async def set_class_papers(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, data: ClassPapersSet, *, actor_id: uuid.UUID) -> None:
    e = await _get_exam(db, school_id, exam_id)
    if e.published_at:
        raise Conflict("Unpublish the results before changing the date sheet", code="EXAM_PUBLISHED")
    if not await db.scalar(select(SchoolClass.id).where(SchoolClass.id == data.class_id, SchoolClass.school_id == school_id)):
        raise field_error("class_id", "Choose a class from your school")
    subjects = set((await db.scalars(select(Subject.id).where(Subject.school_id == school_id))).all())
    wanted = {}
    for i, p in enumerate(data.papers):
        if p.subject_id not in subjects:
            raise field_error(f"papers.{i}.subject_id", "Choose a subject from your school")
        if p.subject_id in wanted:
            raise field_error(f"papers.{i}.subject_id", "This subject is listed twice")
        if p.exam_date and e.start_date and e.end_date and not (e.start_date <= p.exam_date <= e.end_date):
            raise field_error(f"papers.{i}.exam_date", "Pick a date within the exam period")
        wanted[p.subject_id] = p
    existing = {p.subject_id: p for p in (await db.scalars(select(ExamPaper).where(
        ExamPaper.exam_id == e.id, ExamPaper.class_id == data.class_id))).all()}
    for sid, paper in existing.items():
        if sid not in wanted:
            n = await db.scalar(select(func.count()).select_from(ExamMark).where(ExamMark.paper_id == paper.id))
            if n:
                name = await db.scalar(select(Subject.name).where(Subject.id == sid))
                raise Conflict(f"{name} already has marks entered and can't be removed", code="PAPER_HAS_MARKS")
            await db.delete(paper)
    for sid, p in wanted.items():
        row = existing.get(sid) or ExamPaper(school_id=school_id, exam_id=e.id, class_id=data.class_id, subject_id=sid)
        row.exam_date, row.max_marks, row.pass_marks = p.exam_date, p.max_marks, p.pass_marks
        db.add(row)
    await audit_service.record(db, "exam.datesheet", school_id=school_id, user_id=actor_id, entity_type="exam", entity_id=e.id,
                               meta={"class_id": str(data.class_id), "papers": len(wanted)})


async def papers_from_timetable(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, data: FromTimetable, *, actor_id: uuid.UUID) -> int:
    """Add a paper for every subject each class has in its timetable (skipping existing ones)."""
    e = await _get_exam(db, school_id, exam_id)
    if e.published_at:
        raise Conflict("Unpublish the results before changing the date sheet", code="EXAM_PUBLISHED")
    taught = (await db.execute(select(Section.class_id, TimetableEntry.subject_id).join(Section, Section.id == TimetableEntry.section_id)
                               .where(TimetableEntry.school_id == school_id, Section.class_id.in_(data.class_ids)).distinct())).all()
    existing = set((await db.execute(select(ExamPaper.class_id, ExamPaper.subject_id).where(ExamPaper.exam_id == e.id))).all())
    added = 0
    for cid, sid in taught:
        if (cid, sid) in existing or sid in data.skip_subject_ids:
            continue
        db.add(ExamPaper(school_id=school_id, exam_id=e.id, class_id=cid, subject_id=sid, max_marks=data.max_marks,
                         pass_marks=min(data.pass_marks, data.max_marks)))
        added += 1
    await audit_service.record(db, "exam.datesheet", school_id=school_id, user_id=actor_id, entity_type="exam", entity_id=e.id, meta={"added": added})
    return added


async def publish(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, publish: bool, *, actor_id: uuid.UUID) -> None:
    e = await _get_exam(db, school_id, exam_id)
    if publish and not await db.scalar(select(ExamPaper.id).where(ExamPaper.exam_id == e.id).limit(1)):
        raise Conflict("Add the date sheet and marks before publishing", code="EXAM_EMPTY")
    was_published = e.published_at is not None
    e.published_at = datetime.now(UTC) if publish else None
    if publish and not was_published:
        classes = (await db.scalars(select(ExamPaper.class_id).where(ExamPaper.exam_id == e.id).distinct())).all()
        kids = (await db.scalars(select(Student.id).where(Student.class_id.in_(classes), Student.status == "active"))).all()
        await notification_service.notify(db, await notification_service.family_of(db, kids), school_id=school_id, kind="results",
                                          title=f"{e.name} results are out", body="Open the report card to see marks and grades.",
                                          link="/my-results", data={"exam_id": e.id})
        if await sms_service.channels_for(db, school_id, "results"):
            await sms_service.queue(db, school_id=school_id, event_name="results", phones=await sms_service.family_phones(db, kids),
                                    body=f"{e.name} results are out. Open the Vidyanexa app to see the report card.")
    await audit_service.record(db, "exam.publish" if publish else "exam.unpublish", school_id=school_id, user_id=actor_id,
                               entity_type="exam", entity_id=e.id, meta={"name": e.name})


# ---- mark entry -------------------------------------------------------------------------------

async def _teaching(db: AsyncSession, user: User) -> tuple[set[tuple[uuid.UUID, uuid.UUID]], set[uuid.UUID]] | None:
    """(section, subject) pairs the user teaches and sections they are class teacher of. None = everything (admins)."""
    if has_permission(user.role, "exams.manage"):
        return None
    pairs = set((await db.execute(select(TimetableEntry.section_id, TimetableEntry.subject_id)
                                  .where(TimetableEntry.teacher_id == user.id).distinct())).all())
    own = set((await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id))).all())
    return pairs, own


def _may_enter(scope, section_id: uuid.UUID, subject_id: uuid.UUID) -> bool:
    return scope is None or (section_id, subject_id) in scope[0] or section_id in scope[1]


async def marks_sheets(db: AsyncSession, user: User, exam_id: uuid.UUID) -> list[MarksSheetRef]:
    e = await _get_exam(db, user.school_id, exam_id)
    scope = await _teaching(db, user)
    sections = (await db.execute(select(Section, SchoolClass.name, SchoolClass.sort_order).join(SchoolClass, SchoolClass.id == Section.class_id)
                                 .where(Section.school_id == user.school_id))).all()
    by_class = defaultdict(list)
    for s, cname, order in sections:
        by_class[s.class_id].append((s, f"{cname} – {s.name}", order))
    papers = (await db.execute(select(ExamPaper, Subject.name, Subject.color).join(Subject, Subject.id == ExamPaper.subject_id)
                               .where(ExamPaper.exam_id == e.id))).all()
    sizes = dict((await db.execute(select(Student.section_id, func.count()).where(
        Student.school_id == user.school_id, Student.status == "active").group_by(Student.section_id))).all())
    rows = (await db.execute(
        select(ExamMark.paper_id, Student.section_id, func.count()).join(Student, Student.id == ExamMark.student_id)
        .join(ExamPaper, ExamPaper.id == ExamMark.paper_id).where(ExamPaper.exam_id == e.id)
        .group_by(ExamMark.paper_id, Student.section_id))).all()
    entered = {(p, s): n for p, s, n in rows}
    out = []
    for p, sname, color in papers:
        for s, label, order in by_class.get(p.class_id, []):
            if _may_enter(scope, s.id, p.subject_id):
                out.append((order, label, p.exam_date or date.max, MarksSheetRef(
                    paper_id=p.id, section_id=s.id, section_label=label, subject_name=sname, subject_color=color, exam_date=p.exam_date,
                    max_marks=p.max_marks, entered=entered.get((p.id, s.id), 0), students=sizes.get(s.id, 0))))
    return [x[3] for x in sorted(out, key=lambda x: (x[0], x[1], x[2]))]


async def _paper(db: AsyncSession, school_id: uuid.UUID, paper_id: uuid.UUID) -> tuple[ExamPaper, Exam, str]:
    row = (await db.execute(select(ExamPaper, Exam, Subject.name).join(Exam, Exam.id == ExamPaper.exam_id)
                            .join(Subject, Subject.id == ExamPaper.subject_id)
                            .where(ExamPaper.id == paper_id, ExamPaper.school_id == school_id))).first()
    if not row:
        raise NotFound("Paper not found")
    return row[0], row[1], row[2]


async def marks_sheet(db: AsyncSession, user: User, paper_id: uuid.UUID, section_id: uuid.UUID) -> MarksSheet:
    paper, exam, sname = await _paper(db, user.school_id, paper_id)
    section = await get_section(db, user.school_id, section_id)
    if section.class_id != paper.class_id:
        raise field_error("section_id", "That section doesn't take this paper")
    scope = await _teaching(db, user)
    allowed = has_permission(user.role, "exams.marks") and _may_enter(scope, section.id, paper.subject_id)
    if not allowed and not has_permission(user.role, "exams.view"):
        raise Forbidden("You can't see these marks", code="NOT_YOUR_PAPER")
    locked = None if allowed else "You can view these marks but only the subject teacher can enter them."
    if allowed and exam.published_at:
        locked = "Results are published. Ask the office to unpublish them to make changes."
    students = (await db.scalars(select(Student).where(Student.section_id == section.id, Student.status == "active")
                                 .order_by(Student.roll_no.nulls_last(), Student.first_name))).all()
    marks = {m.student_id: m for m in (await db.scalars(select(ExamMark).where(ExamMark.paper_id == paper.id))).all()}
    cname = await db.scalar(select(SchoolClass.name).where(SchoolClass.id == section.class_id))
    return MarksSheet(
        paper_id=paper.id, section_id=section.id, exam_name=exam.name, section_label=f"{cname} – {section.name}", subject_name=sname,
        max_marks=paper.max_marks, pass_marks=paper.pass_marks, editable=locked is None, locked_reason=locked,
        rows=[MarkRow(student_id=s.id, name=f"{s.first_name} {s.last_name}", roll_no=s.roll_no,
                      marks=marks[s.id].marks if s.id in marks else None, absent=marks[s.id].absent if s.id in marks else False)
              for s in students])


async def save_marks(db: AsyncSession, user: User, paper_id: uuid.UUID, section_id: uuid.UUID, data: MarksSave) -> MarksSheet:
    sheet = await marks_sheet(db, user, paper_id, section_id)
    if not sheet.editable:
        raise AppError(sheet.locked_reason or "Marks can't be changed", code="MARKS_LOCKED", status_code=403)
    ids = {r.student_id for r in sheet.rows}
    for i, m in enumerate(data.entries):
        if m.student_id not in ids:
            raise field_error(f"entries.{i}.student_id", "This student isn't in the section")
        if m.marks is not None and m.marks > sheet.max_marks:
            raise field_error(f"entries.{i}.marks", f"Marks can't be more than {sheet.max_marks:g}")
    existing = {m.student_id: m for m in (await db.scalars(select(ExamMark).where(ExamMark.paper_id == paper_id, ExamMark.student_id.in_(ids)))).all()}
    now = datetime.now(UTC)
    for m in data.entries:
        row = existing.get(m.student_id)
        if m.marks is None and not m.absent:
            if row:
                await db.delete(row)  # cleared
            continue
        row = row or ExamMark(school_id=user.school_id, paper_id=paper_id, student_id=m.student_id)
        row.marks, row.absent, row.entered_by, row.entered_at = (None if m.absent else m.marks), m.absent, user.id, now
        db.add(row)
    await db.flush()
    await audit_service.record(db, "exam.marks", school_id=user.school_id, user_id=user.id, entity_type="exam_paper", entity_id=paper_id,
                               meta={"section": sheet.section_label, "subject": sheet.subject_name, "entries": len(data.entries)})
    return await marks_sheet(db, user, paper_id, section_id)


# ---- results ----------------------------------------------------------------------------------

def _ranked(results: list[StudentResult]) -> None:
    order = sorted([r for r in results if r.percent is not None], key=lambda r: -r.percent)
    prev, rank = None, 0
    for i, r in enumerate(order, start=1):
        if r.percent != prev:
            rank, prev = i, r.percent
        r.rank = rank


async def _section_results(db: AsyncSession, school_id: uuid.UUID, exam: Exam, section: Section, students: list[Student] | None = None) -> tuple[list[StudentResult], list[tuple[ExamPaper, str]]]:
    papers = (await db.execute(select(ExamPaper, Subject.name).join(Subject, Subject.id == ExamPaper.subject_id)
                               .where(ExamPaper.exam_id == exam.id, ExamPaper.class_id == section.class_id)
                               .order_by(ExamPaper.exam_date.nulls_last(), Subject.name))).all()
    students = students or list((await db.scalars(select(Student).where(Student.section_id == section.id, Student.status == "active")
                                                  .order_by(Student.roll_no.nulls_last(), Student.first_name))).all())
    ids = [s.id for s in students]
    marks = {(m.paper_id, m.student_id): m for m in (await db.scalars(select(ExamMark).where(
        ExamMark.paper_id.in_([p.id for p, _ in papers]), ExamMark.student_id.in_(ids)))).all()}
    remarks = dict((await db.execute(select(ExamRemark.student_id, ExamRemark.remark).where(
        ExamRemark.exam_id == exam.id, ExamRemark.student_id.in_(ids)))).all())
    results = []
    for s in students:
        subjects, total, max_total, passed = [], Decimal(0), Decimal(0), True
        for p, sname in papers:
            m = marks.get((p.id, s.id))
            if m is None:
                subjects.append(SubjectResult(subject_name=sname, max_marks=p.max_marks, pass_marks=p.pass_marks, marks=None, absent=False, grade=None, passed=None))
                continue
            got = m.marks or Decimal(0)
            ok = not m.absent and got >= p.pass_marks
            passed &= ok
            total += got
            max_total += p.max_marks
            subjects.append(SubjectResult(subject_name=sname, max_marks=p.max_marks, pass_marks=p.pass_marks, marks=m.marks, absent=m.absent,
                                          grade="AB" if m.absent else grade(float(100 * got / p.max_marks)), passed=ok))
        pct = round(float(100 * total / max_total), 1) if max_total else None
        results.append(StudentResult(student_id=s.id, name=f"{s.first_name} {s.last_name}", roll_no=s.roll_no, subjects=subjects, total=total,
                                     max_total=max_total, percent=pct, grade=grade(pct), passed=passed and max_total > 0, rank=None,
                                     remark=remarks.get(s.id)))
    _ranked(results)
    return results, list(papers)


async def section_results(db: AsyncSession, school_id: uuid.UUID, exam_id: uuid.UUID, section_id: uuid.UUID) -> SectionResults:
    exam = await _get_exam(db, school_id, exam_id)
    section = await get_section(db, school_id, section_id)
    results, papers = await _section_results(db, school_id, exam, section)
    stats = []
    for i, (p, sname) in enumerate(papers):
        got = [r.subjects[i] for r in results if r.subjects[i].marks is not None or r.subjects[i].absent]
        scores = [float(x.marks or 0) for x in got]
        stats.append(SubjectStat(subject_name=sname, average=round(sum(scores) / len(scores), 1) if scores else None,
                                 highest=max((x.marks for x in got if x.marks is not None), default=None),
                                 pass_rate=round(100 * sum(1 for x in got if x.passed) / len(got), 1) if got else None))
    pcts = [r.percent for r in results if r.percent is not None]
    cname = await db.scalar(select(SchoolClass.name).where(SchoolClass.id == section.class_id))
    return SectionResults(exam_id=exam.id, exam_name=exam.name, section_label=f"{cname} – {section.name}", published=exam.published_at is not None,
                          students=results, subjects=stats, average_percent=round(sum(pcts) / len(pcts), 1) if pcts else None,
                          pass_rate=round(100 * sum(1 for r in results if r.passed) / len(results), 1) if results else None)


async def set_remark(db: AsyncSession, user: User, exam_id: uuid.UUID, student_id: uuid.UUID, remark: str) -> None:
    exam = await _get_exam(db, user.school_id, exam_id)
    student = await db.scalar(select(Student).where(Student.id == student_id, Student.school_id == user.school_id))
    if not student:
        raise NotFound("Student not found")
    if not has_permission(user.role, "exams.manage"):
        teacher = await db.scalar(select(Section.class_teacher_id).where(Section.id == student.section_id))
        if teacher != user.id:
            raise Forbidden("Only the class teacher can write report-card remarks", code="NOT_CLASS_TEACHER")
    row = await db.scalar(select(ExamRemark).where(ExamRemark.exam_id == exam.id, ExamRemark.student_id == student.id))
    if not remark:
        if row:
            await db.delete(row)
        return
    row = row or ExamRemark(school_id=user.school_id, exam_id=exam.id, student_id=student.id)
    row.remark = remark
    db.add(row)


async def report_card(db: AsyncSession, user: User, exam_id: uuid.UUID, student_id: uuid.UUID) -> ReportCard:
    exam = await _get_exam(db, user.school_id, exam_id)
    student = await db.scalar(select(Student).where(Student.id == student_id, Student.school_id == user.school_id))
    staff = has_permission(user.role, "exams.view")
    if not student or (not staff and student.id not in {s.id for s in await own_students(db, user)}):
        raise NotFound("Report card not found")
    if not staff and not exam.published_at:
        raise NotFound("Results for this exam aren't out yet")
    section = await db.get(Section, student.section_id)
    classmates = list((await db.scalars(select(Student).where(Student.section_id == section.id, Student.status == "active"))).all())
    results, _ = await _section_results(db, user.school_id, exam, section, classmates)
    mine = next(r for r in results if r.student_id == student.id)
    school = await db.get(School, user.school_id)
    end = exam.end_date or await school_today(db, user.school_id)
    statuses = (await db.scalars(select(AttendanceRecord.status).where(
        AttendanceRecord.student_id == student.id, AttendanceRecord.date >= academic_year_start(end), AttendanceRecord.date <= end))).all()
    teacher = await db.scalar(select(User.full_name).where(User.id == section.class_teacher_id)) if section.class_teacher_id else None
    return ReportCard(exam_id=exam.id, exam_name=exam.name, academic_year=exam.academic_year, school_name=school.name, school_address=school.address,
                      student_name=f"{student.first_name} {student.last_name}", admission_no=student.admission_no,
                      class_section=await student_label(db, student), roll_no=student.roll_no, date_of_birth=student.date_of_birth,
                      class_teacher=teacher, result=mine, class_size=len(classmates), attendance_percent=_counts(statuses).percent(),
                      published=exam.published_at is not None,
                      co_scholastic=await co_live_service.for_report(db, user.school_id, exam.id, student.id))


async def my_results(db: AsyncSession, user: User) -> list[ChildResults]:
    out = []
    exams = (await db.scalars(select(Exam).where(Exam.school_id == user.school_id).order_by(Exam.start_date.desc().nulls_last()))).all()
    for st in await own_students(db, user):
        section = await db.get(Section, st.section_id)
        done, upcoming = [], []
        for e in exams:
            if e.published_at:
                classmates = list((await db.scalars(select(Student).where(Student.section_id == section.id, Student.status == "active"))).all())
                results, papers = await _section_results(db, user.school_id, e, section, classmates)
                if not papers:
                    continue
                r = next(x for x in results if x.student_id == st.id)
                done.append(MyExam(exam_id=e.id, exam_name=e.name, kind=e.kind, published_at=e.published_at, percent=r.percent, grade=r.grade,
                                   rank=r.rank, class_size=len(classmates), passed=r.passed))
            else:
                rows = (await db.execute(select(ExamPaper, Subject.name, Subject.color).join(Subject, Subject.id == ExamPaper.subject_id)
                                         .where(ExamPaper.exam_id == e.id, ExamPaper.class_id == st.class_id)
                                         .order_by(ExamPaper.exam_date.nulls_last()))).all()
                upcoming += [PaperOut(id=p.id, class_id=p.class_id, subject_id=p.subject_id, subject_name=f"{e.name}: {n}", subject_color=c,
                                      exam_date=p.exam_date, max_marks=p.max_marks, pass_marks=p.pass_marks, marks_entered=0, students=0)
                             for p, n, c in rows]
        out.append(ChildResults(student_id=st.id, name=f"{st.first_name} {st.last_name}", class_section=await student_label(db, st),
                                exams=done, upcoming=sorted(upcoming, key=lambda p: p.exam_date or date.max)))
    return out
