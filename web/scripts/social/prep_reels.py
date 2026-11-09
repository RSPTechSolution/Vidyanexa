"""Local filming only: puts the demo school back in the state a reel starts from, so takes can be repeated.
Run from api/:  PYTHONPATH=. venv/Scripts/python ../web/scripts/social/prep_reels.py <step> [<step> …]

  fees      Vihaan Thakur's Quarter 3 fee unpaid again (his payments for it removed)
  requests  no gate passes or leave requests waiting for Aarav Patel; Suresh Patel's alerts cleared
  bus       no bus trips today (the driver can start the morning route afresh)
  notices   notices made by earlier takes removed (Diwali, Children's Day)
  homework  homework set by earlier takes removed; Aarav's older homework marked checked (no "overdue" pile)
  signup    the school made by the sign-up reel removed
  passtime  Aarav's newest gate pass set to leave at 1:30 pm today (so a late-night take still shows a school-day pass)
  subs      no teacher marked away today (substitutions removed)
  enquiry   enquiries made by earlier takes removed
  ptm       an upcoming Term 2 parent-teacher meeting (next Saturday, every class), with no bookings yet
  library   books issued by earlier takes returned to the shelf
  tc        certificates issued to Aarav Patel by earlier takes removed
  admissions  a busy admissions desk for the post: follow-ups due today and ahead (none overdue), recent enquiries,
            and the two applied families admitted this month
"""
import asyncio
import sys
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update

from app.core.config import settings
from app.core.database import system_session
from app.models import (BookCopy, BookIssue, Certificate, Enquiry, FeeInvoice, FeePayment, Homework, HomeworkStatus, Notice,
                        Notification, PtmBooking, PtmEvent, School, Section, Student, Substitution, User)
from app.models.attendance_extra import LeaveRequest
from app.models.security import GatePass
from app.models.transport import Boarding, Trip, TripPing

TAKE_NOTICES = ("Diwali holidays", "Happy Children's Day", "Diwali vacation")  # the last is the demo's old one
TAKE_HOMEWORK = ("Fractions practice: Exercise 6.1",)
SIGNUP_SLUG = "sunrise-academy"
TAKE_ENQUIRIES = ("Gurleen Kaur", "Test Child")
TAKE_PTM = "Term 2 parent-teacher meeting"
TAKE_BOOKS = ("00010",)  # Panchatantra Tales, issued to Aarav in the library reel


async def student(db, first, last):
    return await db.scalar(select(Student).where(Student.first_name == first, Student.last_name == last))


async def main(steps):
    assert settings.ENVIRONMENT != "production", "local demo only"
    async with system_session() as db:
        school = await db.scalar(select(School).where(School.slug == "demo"))
        if "fees" in steps:
            v = await student(db, "Vihaan", "Thakur")
            inv = await db.scalar(select(FeeInvoice).where(FeeInvoice.student_id == v.id, FeeInvoice.term.like("Quarter 3%")))
            await db.execute(delete(FeePayment).where(FeePayment.invoice_id == inv.id))
            inv.paid, inv.status = 0, "unpaid"
            parents = (await db.scalars(select(User.id).where(User.email.in_(["amit.thakur2@demo.com", "rashmi.thakur@demo.com"])))).all()
            await db.execute(delete(Notification).where(Notification.user_id.in_(parents)))
        if "requests" in steps:
            a = await student(db, "Aarav", "Patel")
            await db.execute(delete(GatePass).where(GatePass.student_id == a.id))
            await db.execute(delete(LeaveRequest).where(LeaveRequest.student_id == a.id))
            suresh = await db.scalar(select(User.id).where(User.email == "parent@demo.com"))
            await db.execute(delete(Notification).where(Notification.user_id == suresh))
        if "bus" in steps:
            start = datetime.combine(date.today(), time.min, tzinfo=UTC)
            trips = (await db.scalars(select(Trip.id).where(Trip.school_id == school.id, Trip.started_at >= start))).all()
            if trips:
                await db.execute(delete(TripPing).where(TripPing.trip_id.in_(trips)))
                await db.execute(delete(Boarding).where(Boarding.trip_id.in_(trips)))
                await db.execute(delete(Trip).where(Trip.id.in_(trips)))
            await db.execute(update(Trip).where(Trip.school_id == school.id, Trip.status == "running").values(status="completed"))
        if "notices" in steps:
            await db.execute(delete(Notice).where(Notice.school_id == school.id, Notice.title.in_(TAKE_NOTICES)))
        if "homework" in steps:
            await db.execute(delete(Homework).where(Homework.school_id == school.id, Homework.title.in_(TAKE_HOMEWORK)))
            a = await student(db, "Aarav", "Patel")
            for hw in (await db.scalars(select(Homework).where(Homework.section_id == a.section_id))).all():
                await db.execute(delete(HomeworkStatus).where(HomeworkStatus.homework_id == hw.id, HomeworkStatus.student_id == a.id))
                db.add(HomeworkStatus(school_id=school.id, homework_id=hw.id, student_id=a.id, status="checked", updated_at=datetime.now(UTC)))
        if "passtime" in steps:
            a = await student(db, "Aarav", "Patel")
            gp = await db.scalar(select(GatePass).where(GatePass.student_id == a.id).order_by(GatePass.created_at.desc()))
            gp.leave_at = datetime.combine(date.today(), time(13, 30), tzinfo=ZoneInfo("Asia/Kolkata"))
        if "subs" in steps:
            await db.execute(delete(Substitution).where(Substitution.school_id == school.id, Substitution.date == date.today()))
        if "enquiry" in steps:
            await db.execute(delete(Enquiry).where(Enquiry.school_id == school.id, Enquiry.student_name.in_(TAKE_ENQUIRIES)))
        if "ptm" in steps:
            await db.execute(delete(PtmEvent).where(PtmEvent.school_id == school.id, PtmEvent.title == TAKE_PTM))
            sections = (await db.scalars(select(Section.id).where(Section.school_id == school.id))).all()
            saturday = date.today() + timedelta(days=(5 - date.today().weekday()) % 7 or 7)
            db.add(PtmEvent(school_id=school.id, title=TAKE_PTM, date=saturday, start_time=time(9), end_time=time(12),
                            slot_minutes=10, section_ids=list(sections), location="Each class's own room"))
        if "library" in steps:
            copies = (await db.scalars(select(BookCopy).where(BookCopy.school_id == school.id, BookCopy.accession_no.in_(TAKE_BOOKS)))).all()
            for c in copies:
                await db.execute(delete(BookIssue).where(BookIssue.copy_id == c.id, BookIssue.returned_on.is_(None)))
                c.status = "available"
        if "tc" in steps:
            a = await student(db, "Aarav", "Patel")
            await db.execute(delete(Certificate).where(Certificate.student_id == a.id))
            if a.status != "active":
                a.status = "active"
        if "admissions" in steps:
            now = datetime.now(UTC)
            rows = (await db.scalars(select(Enquiry).where(Enquiry.school_id == school.id).order_by(Enquiry.created_at))).all()
            open_ = [e for e in rows if e.status not in ("admitted", "lost")]
            for i, e in enumerate(open_):
                if e.status == "applied":
                    e.status, e.updated_at = "admitted", now
                    continue
                e.follow_up_on = date.today() + timedelta(days=0 if i < 3 else i - 1)
            for i, e in enumerate(open_[-5:]):
                e.created_at = now - timedelta(days=i + 1)
        if "signup" in steps:
            old = await db.scalar(select(School).where(School.slug == SIGNUP_SLUG))
            if old:
                await db.delete(old)
        print("ready:", " ".join(steps))


asyncio.run(main(sys.argv[1:]))
