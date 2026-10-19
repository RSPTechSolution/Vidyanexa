"""The AI assistant. Questions are answered by a fixed set of safe, read-only templates over the school's own data, each needing
the permission its data needs (and teachers only see the sections they teach).

Without an AI key, a keyword matcher picks the template. With AI_PROVIDER=anthropic (Claude) or gemini (Google) and its key,
the model picks the template and its parameters from free text, and drafts notices. Only the question and the school's class
names are sent; student data never leaves the server. If the model can't be reached, the keyword matcher answers instead."""
import json
import logging
import re
import uuid
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.permissions import ADMINS, has_permission
from app.models import (
    AttendanceRecord, BookCopy, BookIssue, Book, Exam, ExamMark, ExamPaper, FeeInvoice, FeePayment, School, SchoolClass, Section, StaffLeave, Student, User,
    Visitor,
)
from app.schemas.ai import AiAnswer, AiTemplate
from app.services import audit_service
from app.services.attendance_service import academic_year_start
from app.services.family_service import school_today
from app.services.notice_service import _teacher_sections

log = logging.getLogger(__name__)


@dataclass
class Ctx:
    db: AsyncSession
    user: User
    today: date
    class_id: uuid.UUID | None = None
    class_name: str | None = None
    name: str | None = None
    topic: str | None = None
    sections: set[uuid.UUID] | None = None  # None = whole school
    extra: dict = field(default_factory=dict)


Runner = Callable[[Ctx], Awaitable[AiAnswer]]


@dataclass
class Template:
    id: str
    title: str
    example: str
    permission: str
    keywords: list[str]
    run: Runner
    params: tuple[str, ...] = ()


def _ans(t: str, text: str, columns: list[str] | None = None, rows: list[list] | None = None, link: str | None = None) -> AiAnswer:
    return AiAnswer(template=t, text=text, columns=columns or [], rows=rows or [], link=link)


def _students_q(ctx: Ctx):
    q = select(Student).where(Student.school_id == ctx.user.school_id, Student.status == "active")
    if ctx.class_id:
        q = q.where(Student.class_id == ctx.class_id)
    if ctx.sections is not None:
        q = q.where(Student.section_id.in_(ctx.sections or [uuid.uuid4()]))
    return q


async def _labels(db: AsyncSession, ids) -> dict[uuid.UUID, str]:
    rows = (await db.execute(select(Student.id, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Student.class_id)
                             .join(Section, Section.id == Student.section_id).where(Student.id.in_(list(ids))))).all()
    return {i: f"{c} – {s}" for i, c, s in rows}


def _where(ctx: Ctx) -> str:
    return f" in {ctx.class_name}" if ctx.class_name else ""


def _inr(v) -> str:
    return f"Rs {Decimal(v):,.0f}"


# ---- templates --------------------------------------------------------------------------------

async def absent_today(ctx: Ctx) -> AiAnswer:
    sub = _students_q(ctx).with_only_columns(Student.id)
    rows = (await ctx.db.execute(select(Student.first_name, Student.last_name, Student.id, AttendanceRecord.status, AttendanceRecord.remark)
                                 .join(Student, Student.id == AttendanceRecord.student_id)
                                 .where(AttendanceRecord.school_id == ctx.user.school_id, AttendanceRecord.date == ctx.today,
                                        AttendanceRecord.status.in_(("absent", "leave")), AttendanceRecord.student_id.in_(sub)))).all()
    labels = await _labels(ctx.db, [r[2] for r in rows])
    if not rows:
        marked = await ctx.db.scalar(select(func.count()).select_from(AttendanceRecord).where(
            AttendanceRecord.school_id == ctx.user.school_id, AttendanceRecord.date == ctx.today, AttendanceRecord.student_id.in_(sub))) or 0
        return _ans("absent_today", f"No one is marked absent today{_where(ctx)}." if marked else f"Attendance hasn't been marked yet today{_where(ctx)}.")
    rows = sorted(rows, key=lambda r: (labels.get(r[2], ""), r[0]))
    return _ans("absent_today", f"{len(rows)} student{'s are' if len(rows) != 1 else ' is'} away today{_where(ctx)}.", ["Student", "Class", "Status", "Note"],
                [[f"{f} {lname}", labels.get(i, ""), "On leave" if s == "leave" else "Absent", rem or ""] for f, lname, i, s, rem in rows], "/attendance")


async def class_attendance(ctx: Ctx) -> AiAnswer:
    start = ctx.today.replace(day=1)
    sub = _students_q(ctx).with_only_columns(Student.id)
    s = AttendanceRecord.status
    rows = (await ctx.db.execute(select(AttendanceRecord.student_id, s, func.count()).where(
        AttendanceRecord.school_id == ctx.user.school_id, AttendanceRecord.date.between(start, ctx.today), AttendanceRecord.student_id.in_(sub))
        .group_by(AttendanceRecord.student_id, s))).all()
    per: dict[uuid.UUID, dict[str, int]] = defaultdict(dict)
    for sid, st, n in rows:
        per[sid][st] = n
    if not per:
        return _ans("class_attendance", f"No attendance has been marked this month{_where(ctx)}.")

    def pct(c: dict) -> float | None:
        days = sum(c.values()) - c.get("leave", 0)
        return round(100 * (c.get("present", 0) + c.get("late", 0) + 0.5 * c.get("half_day", 0)) / days, 1) if days else None
    names = {i: f"{f} {lname}" for i, f, lname in (await ctx.db.execute(select(Student.id, Student.first_name, Student.last_name).where(Student.id.in_(per)))).all()}
    labels = await _labels(ctx.db, per)
    table = sorted(([names[i], labels.get(i, ""), pct(c), c.get("absent", 0)] for i, c in per.items()), key=lambda r: (r[2] is None, r[2] or 0))
    total = {k: sum(c.get(k, 0) for c in per.values()) for k in ("present", "late", "half_day", "leave", "absent")}
    overall = pct(total)
    return _ans("class_attendance", f"Attendance this month{_where(ctx)} is {overall}% across {len(per)} students. Lowest first:",
                ["Student", "Class", "Attendance %", "Days absent"], table[:60], "/attendance")


async def low_attendance(ctx: Ctx) -> AiAnswer:
    start = academic_year_start(ctx.today)
    sub = _students_q(ctx).with_only_columns(Student.id)
    s = AttendanceRecord.status
    rows = (await ctx.db.execute(select(AttendanceRecord.student_id, s, func.count()).where(
        AttendanceRecord.school_id == ctx.user.school_id, AttendanceRecord.date.between(start, ctx.today), AttendanceRecord.student_id.in_(sub))
        .group_by(AttendanceRecord.student_id, s))).all()
    per: dict[uuid.UUID, dict[str, int]] = defaultdict(dict)
    for sid, st, n in rows:
        per[sid][st] = n
    low = []
    for sid, c in per.items():
        days = sum(c.values()) - c.get("leave", 0)
        if days >= 10:
            p = round(100 * (c.get("present", 0) + c.get("late", 0) + 0.5 * c.get("half_day", 0)) / days, 1)
            if p < 75:
                low.append((sid, p))
    if not low:
        return _ans("low_attendance", f"No student{_where(ctx)} is below 75% attendance this year.")
    names = {i: f"{f} {lname}" for i, f, lname in (await ctx.db.execute(select(Student.id, Student.first_name, Student.last_name).where(Student.id.in_([x for x, _ in low])))).all()}
    labels = await _labels(ctx.db, [x for x, _ in low])
    low.sort(key=lambda x: x[1])
    return _ans("low_attendance", f"{len(low)} student{'s are' if len(low) != 1 else ' is'} below 75% attendance this year{_where(ctx)}.",
                ["Student", "Class", "Attendance %"], [[names[i], labels.get(i, ""), p] for i, p in low], "/analytics")


async def fee_defaulters(ctx: Ctx) -> AiAnswer:
    sub = _students_q(ctx).with_only_columns(Student.id)
    rows = (await ctx.db.execute(select(FeeInvoice.student_id, func.sum(FeeInvoice.total - FeeInvoice.discount - FeeInvoice.paid), func.min(FeeInvoice.due_date))
                                 .where(FeeInvoice.school_id == ctx.user.school_id, FeeInvoice.status.in_(("unpaid", "partial")),
                                        FeeInvoice.due_date < ctx.today, FeeInvoice.student_id.in_(sub))
                                 .group_by(FeeInvoice.student_id))).all()
    rows = [r for r in rows if r[1] and r[1] > 0]
    if not rows:
        return _ans("fee_defaulters", f"No overdue fees{_where(ctx)}.")
    names = {i: f"{f} {lname}" for i, f, lname in (await ctx.db.execute(select(Student.id, Student.first_name, Student.last_name).where(Student.id.in_([r[0] for r in rows])))).all()}
    labels = await _labels(ctx.db, [r[0] for r in rows])
    rows.sort(key=lambda r: -r[1])
    total = sum(r[1] for r in rows)
    return _ans("fee_defaulters", f"{len(rows)} student{'s have' if len(rows) != 1 else ' has'} overdue fees{_where(ctx)}, {_inr(total)} in all.",
                ["Student", "Class", "Overdue", "Since"], [[names[i], labels.get(i, ""), _inr(b), d.strftime("%d %b %Y")] for i, b, d in rows[:100]], "/fees")


async def fees_collected(ctx: Ctx) -> AiAnswer:
    tz = await ctx.db.scalar(select(School.timezone).where(School.id == ctx.user.school_id)) or "Asia/Kolkata"
    local = func.date(func.timezone(tz, FeePayment.paid_at))
    month_start = ctx.today.replace(day=1)
    rows = (await ctx.db.execute(select(FeePayment.method, func.count(), func.sum(FeePayment.amount)).where(
        FeePayment.school_id == ctx.user.school_id, local.between(month_start, ctx.today)).group_by(FeePayment.method))).all()
    today_total = await ctx.db.scalar(select(func.coalesce(func.sum(FeePayment.amount), 0)).where(FeePayment.school_id == ctx.user.school_id, local == ctx.today)) or 0
    month_total = sum((r[2] for r in rows), Decimal(0))
    names = {"cash": "Cash", "upi": "UPI", "cheque": "Cheque", "card": "Card", "bank_transfer": "Bank transfer", "online": "Online"}
    return _ans("fees_collected", f"Collected today: {_inr(today_total)}. This month so far: {_inr(month_total)} from {sum(r[1] for r in rows)} payments.",
                ["Method", "Payments", "Amount"], [[names.get(m, m), n, _inr(a)] for m, n, a in sorted(rows, key=lambda r: -r[2])], "/fees")


async def top_performers(ctx: Ctx) -> AiAnswer:
    exam = await ctx.db.scalar(select(Exam).where(Exam.school_id == ctx.user.school_id, Exam.published_at.isnot(None)).order_by(Exam.published_at.desc()).limit(1))
    if not exam:
        return _ans("top_performers", "No exam results have been published yet.")
    sub = _students_q(ctx).with_only_columns(Student.id)
    rows = (await ctx.db.execute(select(ExamMark.student_id, func.sum(func.coalesce(ExamMark.marks, 0)), func.sum(ExamPaper.max_marks))
                                 .join(ExamPaper, ExamPaper.id == ExamMark.paper_id)
                                 .where(ExamPaper.exam_id == exam.id, ExamMark.student_id.in_(sub)).group_by(ExamMark.student_id))).all()
    scored = sorted(((i, round(100 * float(g) / float(m), 1)) for i, g, m in rows if m), key=lambda x: -x[1])[:10]
    if not scored:
        return _ans("top_performers", f"No marks in {exam.name}{_where(ctx)}.")
    names = {i: f"{f} {lname}" for i, f, lname in (await ctx.db.execute(select(Student.id, Student.first_name, Student.last_name).where(Student.id.in_([x for x, _ in scored])))).all()}
    labels = await _labels(ctx.db, [x for x, _ in scored])
    return _ans("top_performers", f"Top {len(scored)} in {exam.name}{_where(ctx)}:", ["#", "Student", "Class", "Percent"],
                [[n + 1, names[i], labels.get(i, ""), p] for n, (i, p) in enumerate(scored)], f"/exams/{exam.id}")


async def student_lookup(ctx: Ctx) -> AiAnswer:
    if not ctx.name or len(ctx.name) < 2:
        return _ans("student_lookup", "Which student? For example: \"Tell me about Aarav Patel\".")
    words = [w for w in re.split(r"\s+", ctx.name.strip()) if w]
    q = _students_q(ctx)
    for w in words[:3]:
        q = q.where(or_(Student.first_name.ilike(f"%{w}%"), Student.last_name.ilike(f"%{w}%"), Student.admission_no.ilike(w)))
    found = list((await ctx.db.scalars(q.limit(6))).all())
    if not found:
        return _ans("student_lookup", f"I couldn't find a student called \"{ctx.name}\"{' you teach' if ctx.sections is not None else ''}.")
    if len(found) > 1:
        labels = await _labels(ctx.db, [s.id for s in found])
        return _ans("student_lookup", f"{len(found)} students match \"{ctx.name}\". Which one?", ["Student", "Admission no.", "Class"],
                    [[f"{s.first_name} {s.last_name}", s.admission_no, labels.get(s.id, "")] for s in found])
    s = found[0]
    label = (await _labels(ctx.db, [s.id])).get(s.id, "")
    facts = [["Class", label], ["Admission no.", s.admission_no]]
    st = AttendanceRecord.status
    att = dict((await ctx.db.execute(select(st, func.count()).where(AttendanceRecord.student_id == s.id,
                                                                   AttendanceRecord.date >= academic_year_start(ctx.today)).group_by(st))).all())
    days = sum(att.values()) - att.get("leave", 0)
    if days:
        facts.append(["Attendance this year", f"{round(100 * (att.get('present', 0) + att.get('late', 0) + 0.5 * att.get('half_day', 0)) / days, 1)}% ({att.get('absent', 0)} days absent)"])
    if has_permission(ctx.user.role, "fees.view"):
        due = await ctx.db.scalar(select(func.coalesce(func.sum(FeeInvoice.total - FeeInvoice.discount - FeeInvoice.paid), 0)).where(
            FeeInvoice.student_id == s.id, FeeInvoice.status.in_(("unpaid", "partial")))) or 0
        facts.append(["Fees due", _inr(due) if due else "Nothing due"])
    exam = await ctx.db.scalar(select(Exam).join(ExamPaper, ExamPaper.exam_id == Exam.id).join(ExamMark, ExamMark.paper_id == ExamPaper.id)
                               .where(ExamMark.student_id == s.id, Exam.published_at.isnot(None)).order_by(Exam.published_at.desc()).limit(1))
    if exam:
        g, m = (await ctx.db.execute(select(func.sum(func.coalesce(ExamMark.marks, 0)), func.sum(ExamPaper.max_marks)).join(ExamPaper, ExamPaper.id == ExamMark.paper_id)
                                     .where(ExamPaper.exam_id == exam.id, ExamMark.student_id == s.id))).one()
        if m:
            facts.append([f"{exam.name} result", f"{round(100 * float(g) / float(m), 1)}%"])
    return _ans("student_lookup", f"{s.first_name} {s.last_name}", ["", ""], facts, f"/students/{s.id}")


async def birthdays(ctx: Ctx) -> AiAnswer:
    rows = list((await ctx.db.scalars(_students_q(ctx).where(extract("month", Student.date_of_birth) == ctx.today.month,
                                                            extract("day", Student.date_of_birth) == ctx.today.day))).all())
    if not rows:
        return _ans("birthdays", f"No student birthdays today{_where(ctx)}.")
    labels = await _labels(ctx.db, [s.id for s in rows])
    return _ans("birthdays", f"{len(rows)} birthday{'s' if len(rows) != 1 else ''} today{_where(ctx)} 🎂", ["Student", "Class", "Turns"],
                [[f"{s.first_name} {s.last_name}", labels.get(s.id, ""), ctx.today.year - s.date_of_birth.year] for s in rows])


async def staff_on_leave(ctx: Ctx) -> AiAnswer:
    rows = (await ctx.db.execute(select(User.full_name, User.designation, StaffLeave.from_date, StaffLeave.to_date, StaffLeave.half_day)
                                 .join(User, User.id == StaffLeave.user_id)
                                 .where(StaffLeave.school_id == ctx.user.school_id, StaffLeave.status == "approved",
                                        StaffLeave.from_date <= ctx.today, StaffLeave.to_date >= ctx.today))).all()
    if not rows:
        return _ans("staff_on_leave", "No staff are on approved leave today.")
    return _ans("staff_on_leave", f"{len(rows)} staff member{'s are' if len(rows) != 1 else ' is'} on leave today.", ["Name", "Role", "Until"],
                [[n, d or "", ("Half day" if h else t.strftime("%d %b"))] for n, d, f, t, h in rows], "/hr?tab=leave")


async def library_overdue(ctx: Ctx) -> AiAnswer:
    rows = (await ctx.db.execute(select(Book.title, BookCopy.accession_no, BookIssue.due_on, BookIssue.student_id, BookIssue.user_id)
                                 .join(BookCopy, BookCopy.id == BookIssue.copy_id).join(Book, Book.id == BookCopy.book_id)
                                 .where(BookIssue.school_id == ctx.user.school_id, BookIssue.returned_on.is_(None), BookIssue.due_on < ctx.today)
                                 .order_by(BookIssue.due_on))).all()
    if not rows:
        return _ans("library_overdue", "No library books are overdue.")
    stu = {i: f"{f} {lname}" for i, f, lname in (await ctx.db.execute(select(Student.id, Student.first_name, Student.last_name).where(Student.id.in_({r[3] for r in rows if r[3]})))).all()}
    usr = dict((await ctx.db.execute(select(User.id, User.full_name).where(User.id.in_({r[4] for r in rows if r[4]})))).all())
    return _ans("library_overdue", f"{len(rows)} book{'s are' if len(rows) != 1 else ' is'} overdue.", ["Book", "Copy", "Borrower", "Days late"],
                [[t, a, stu.get(s) or usr.get(u) or "", (ctx.today - d).days] for t, a, d, s, u in rows], "/library?tab=circulation")


async def visitors_inside(ctx: Ctx) -> AiAnswer:
    rows = (await ctx.db.execute(select(Visitor.name, Visitor.purpose, Visitor.meeting, Visitor.in_at).where(
        Visitor.school_id == ctx.user.school_id, Visitor.status == "in").order_by(Visitor.in_at))).all()
    if not rows:
        return _ans("visitors_inside", "There are no visitors on campus right now.")
    return _ans("visitors_inside", f"{len(rows)} visitor{'s are' if len(rows) != 1 else ' is'} on campus.", ["Visitor", "Purpose", "To see"],
                [[n, p, m or ""] for n, p, m, _ in rows], "/gate")


async def draft_notice(ctx: Ctx) -> AiAnswer:
    topic = (ctx.topic or "").strip().rstrip(".") or "an upcoming school event"
    school = await ctx.db.get(School, ctx.user.school_id)
    text = await _llm_notice(topic, school.name) if _llm_on() else None
    if not text:
        dated = re.search(r"(?i)\b(on|from|by)\s+\d|\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|tomorrow|today|next\s+\w+day", topic)
        text = (f"Dear Parents,\n\nThis is to inform you about {topic}.{'' if dated else ' It will take place on [date].'} "
                "Please make a note of it and help your child be prepared.\n\n"
                "For any questions, please contact the class teacher or the school office.\n\n"
                f"Regards,\n{ctx.user.full_name}\n{school.name}")
    return _ans("draft_notice", "Here's a draft. Check the details, then post it from Notices.", ["Draft"], [[text]], "/notices")


TEMPLATES: list[Template] = [
    Template("absent_today", "Who is absent today?", "Who is absent today in Class 5?", "attendance.view",
             ["absent", "absentees", "not present", "missing today", "who is away", "students on leave"], absent_today, ("class_name",)),
    Template("class_attendance", "Attendance this month", "Attendance of Class 7 this month", "attendance.view",
             ["attendance", "present percentage", "attendance percent"], class_attendance, ("class_name",)),
    Template("low_attendance", "Students below 75% attendance", "Which students are below 75% attendance?", "attendance.view",
             ["below 75", "low attendance", "short attendance", "poor attendance", "chronic"], low_attendance, ("class_name",)),
    Template("fee_defaulters", "Fee defaulters", "Fee defaulters in Class 9", "fees.view",
             ["defaulter", "overdue fee", "fees due", "fee due", "pending fee", "not paid", "unpaid", "outstanding"], fee_defaulters, ("class_name",)),
    Template("fees_collected", "Fees collected", "How much fee was collected this month?", "fees.view",
             ["collected", "collection", "received today", "fee received", "how much fee"], fees_collected),
    Template("top_performers", "Top students in the last exam", "Top 10 students in Class 10", "exams.view",
             ["top", "topper", "best students", "highest marks", "rank", "toppers"], top_performers, ("class_name",)),
    Template("student_lookup", "About a student", "Tell me about Aarav Patel", "students.view",
             ["tell me about", "details of", "how is", "show me", "profile of", "about student"], student_lookup, ("name",)),
    Template("birthdays", "Birthdays today", "Whose birthday is it today?", "students.view", ["birthday", "born today"], birthdays, ("class_name",)),
    Template("staff_on_leave", "Staff on leave today", "Which teachers are on leave today?", "hr.view",
             ["staff on leave", "teachers on leave", "teacher leave", "staff leave", "teachers are on leave", "staff are on leave", "teacher is on leave",
              "staff absent", "teachers absent", "teachers are absent"], staff_on_leave),
    Template("library_overdue", "Overdue library books", "Which library books are overdue?", "library.manage",
             ["library", "overdue book", "books overdue", "not returned"], library_overdue),
    Template("visitors_inside", "Visitors on campus", "Who are the visitors on campus now?", "gate.view", ["visitor", "on campus", "guests"], visitors_inside),
    Template("draft_notice", "Draft a notice", "Write a notice about the annual sports day on 15 November", "notices.post",
             ["write a notice", "draft a notice", "notice about", "draft notice", "circular about", "write a circular", "announce"], draft_notice, ("topic",)),
]
_BY_ID = {t.id: t for t in TEMPLATES}
MODULE_OF = {"absent_today": "attendance", "class_attendance": "attendance", "low_attendance": "attendance", "fee_defaulters": "fees",
             "fees_collected": "fees", "top_performers": "exams", "student_lookup": "students", "birthdays": "students", "staff_on_leave": "hr",
             "library_overdue": "library", "visitors_inside": "security", "draft_notice": "communication"}


def available(user: User, modules: set[str]) -> list[Template]:
    return [t for t in TEMPLATES if has_permission(user.role, t.permission) and MODULE_OF[t.id] in modules]


def templates_out(user: User, modules: set[str]) -> list[AiTemplate]:
    return [AiTemplate(id=t.id, title=t.title, example=t.example) for t in available(user, modules)]


# ---- understanding the question ---------------------------------------------------------------

def _find_class(question: str, classes: list[tuple[uuid.UUID, str]]) -> tuple[uuid.UUID | None, str | None]:
    q = " " + re.sub(r"[^a-z0-9 ]", " ", question.lower()) + " "
    for cid, name in sorted(classes, key=lambda c: -len(c[1])):
        n = name.lower()
        if f" {n} " in q:
            return cid, name
        m = re.fullmatch(r"class (\d+)", n)
        if m and re.search(rf"\b(class|grade|std)\s*{m.group(1)}(st|nd|rd|th)?\b|\b{m.group(1)}(st|nd|rd|th)\s+(class|grade|std)\b", q):
            return cid, name
    return None, None


def match_rules(question: str, allowed: list[Template]) -> tuple[Template | None, dict]:
    q = question.lower()
    best, score = None, 0
    for t in allowed:
        s = max((len(k) for k in t.keywords if k in q), default=0)
        if s > score:
            best, score = t, s
    params: dict = {}
    if best and "name" in best.params:
        rest = re.sub(r"(?i)\b(tell me about|details of|how is|show me|profile of|about student|student|please|doing|the)\b", " ", question)
        params["name"] = re.sub(r"[^\w\s]", " ", rest).strip()
    if best and "topic" in best.params:
        m = re.search(r"(?i)(?:notice|circular)\s+(?:about|on|for|regarding)\s+(.+)", question) or re.search(r"(?i)announce\s+(.+)", question)
        params["topic"] = m.group(1).strip() if m else None
    return best, params


def _llm_on() -> bool:
    return (settings.AI_PROVIDER == "anthropic" and bool(settings.ANTHROPIC_API_KEY)) or \
        (settings.AI_PROVIDER == "gemini" and bool(settings.GEMINI_API_KEY))


def llm_name() -> str:
    """Which model answers, for the platform's system page."""
    return {"anthropic": "claude", "gemini": "gemini"}[settings.AI_PROVIDER] if _llm_on() else "rules"


ROUTER_PROMPT = "You route questions from school staff to exactly one tool. Never answer directly."
NOTICE_PROMPT = ("You write short, warm, clear notices from an Indian school to parents. Plain text, under 150 words, start with "
                 "'Dear Parents,', end with 'Regards,' and the school name. Use placeholders like [date] for anything not given. No markdown.")


async def _claude(body: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post("https://api.anthropic.com/v1/messages", json=body, headers={
                "x-api-key": settings.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        if r.status_code != 200:
            log.warning("Claude API returned %s: %s", r.status_code, r.text[:300])
            return None
        return r.json()
    except httpx.HTTPError as e:
        log.warning("Claude API unreachable: %s", e)
        return None


async def _gemini(body: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
                                  json=body, headers={"x-goog-api-key": settings.GEMINI_API_KEY, "content-type": "application/json"})
        if r.status_code != 200:
            log.warning("Gemini API returned %s: %s", r.status_code, r.text[:300])
            return None
        return r.json()
    except httpx.HTTPError as e:
        log.warning("Gemini API unreachable: %s", e)
        return None


def _gemini_parts(data: dict) -> list[dict]:
    cands = data.get("candidates") or []
    return ((cands[0].get("content") or {}).get("parts") or []) if cands else []


async def match_llm(question: str, allowed: list[Template], class_names: list[str]) -> tuple[Template | None, dict] | None:
    """Ask the model which template answers the question. Returns None if the API isn't usable (the caller falls back to rules)."""
    props = {"class_name": {"type": "string", "description": f"One of: {', '.join(class_names)}. Leave out for the whole school."},
             "name": {"type": "string", "description": "The student's name or admission number."},
             "topic": {"type": "string", "description": "What the notice is about, including any date."}}
    tools = [(t.id, f"{t.title}. Example: {t.example}", {p: props[p] for p in t.params}) for t in allowed]
    tools.append(("none", "Use when no other tool fits the question.", {}))

    if settings.AI_PROVIDER == "gemini":
        # A function with no parameters leaves them out: Gemini refuses an object schema with no properties.
        decls = [{"name": n, "description": d, **({"parameters": {"type": "object", "properties": p}} if p else {})} for n, d, p in tools]
        data = await _gemini({"systemInstruction": {"parts": [{"text": ROUTER_PROMPT}]},
                              "contents": [{"role": "user", "parts": [{"text": question[:500]}]}],
                              "tools": [{"functionDeclarations": decls}],
                              "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
                              "generationConfig": {"maxOutputTokens": 300, "temperature": 0}})
        if not data:
            return None
        call = next((p["functionCall"] for p in _gemini_parts(data) if "functionCall" in p), None)
        if not call or call.get("name") == "none":
            return None, {}
        return _BY_ID.get(call.get("name")), call.get("args") or {}

    data = await _claude({"model": settings.AI_MODEL, "max_tokens": 300, "tool_choice": {"type": "any"}, "system": ROUTER_PROMPT,
                          "tools": [{"name": n, "description": d, "input_schema": {"type": "object", "properties": p}} for n, d, p in tools],
                          "messages": [{"role": "user", "content": question[:500]}]})
    if not data:
        return None
    use = next((c for c in data.get("content", []) if c.get("type") == "tool_use"), None)
    if not use or use["name"] == "none":
        return None, {}
    return _BY_ID.get(use["name"]), use.get("input") or {}


async def _llm_notice(topic: str, school_name: str) -> str | None:
    prompt = f"School: {school_name}\nWrite a notice about: {topic[:400]}"
    if settings.AI_PROVIDER == "gemini":
        data = await _gemini({"systemInstruction": {"parts": [{"text": NOTICE_PROMPT}]},
                              "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                              "generationConfig": {"maxOutputTokens": 600}})
        text = "".join(p.get("text", "") for p in _gemini_parts(data) if not p.get("thought")).strip() if data else ""
        return text or None
    data = await _claude({"model": settings.AI_MODEL, "max_tokens": 600, "system": NOTICE_PROMPT,
                          "messages": [{"role": "user", "content": prompt}]})
    if not data:
        return None
    text = "".join(c.get("text", "") for c in data.get("content", []) if c.get("type") == "text").strip()
    return text or None


async def ask(db: AsyncSession, user: User, modules: set[str], question: str) -> AiAnswer:
    allowed = available(user, modules)
    classes = (await db.execute(select(SchoolClass.id, SchoolClass.name).where(SchoolClass.school_id == user.school_id).order_by(SchoolClass.sort_order))).all()
    mode = "rules"
    picked = None
    if _llm_on():
        picked = await match_llm(question, allowed, [c[1] for c in classes])
        if picked is not None:
            mode = "ai"
    template, params = picked if picked is not None else match_rules(question, allowed)
    if not template:
        await audit_service.record(db, "ai.ask", school_id=user.school_id, user_id=user.id, meta={"template": None, "mode": mode})
        other, _ = match_rules(question, [t for t in TEMPLATES if MODULE_OF[t.id] in modules and t not in allowed])
        text = (f"\"{other.title}\" needs access your role doesn't have. Ask the school admin if you need it. Things you can ask:" if other
                else "I can't answer that yet. Try one of these:")
        return AiAnswer(template=None, mode=mode, text=text, columns=[], rows=[], link=None, suggestions=[t.example for t in allowed])
    ctx = Ctx(db=db, user=user, today=await school_today(db, user.school_id), name=params.get("name"), topic=params.get("topic"))
    cname = params.get("class_name")
    cid, cname = (next(((i, n) for i, n in classes if n.lower() == str(cname).lower()), (None, None)) if cname else _find_class(question, classes))
    ctx.class_id, ctx.class_name = cid, cname
    if user.role == "teacher" and not has_permission(user.role, "attendance.manage") and user.role not in ADMINS:
        ctx.sections = await _teacher_sections(db, user)
    answer = await template.run(ctx)
    answer.mode = mode
    await audit_service.record(db, "ai.ask", school_id=user.school_id, user_id=user.id, meta={"template": template.id, "mode": mode})
    return answer
