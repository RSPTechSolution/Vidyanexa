"""Local filming only: puts the demo school back in the state a reel starts from, so takes can be repeated.
Run from api/:  PYTHONPATH=. venv/Scripts/python ../web/scripts/social/prep_reels.py <step> [<step> …]

  fees      Vihaan Thakur's Quarter 3 fee unpaid again (his payments for it removed)
  requests  no gate passes or leave requests waiting for Aarav Patel; Suresh Patel's alerts cleared
  bus       no bus trips today (the driver can start the morning route afresh)
  notices   notices made by earlier takes removed (Diwali, Children's Day)
  homework  homework set by earlier takes removed; Aarav's older homework marked checked (no "overdue" pile)
  signup    the school made by the sign-up reel removed
  passtime  Aarav's newest gate pass set to leave at 1:30 pm today (so a late-night take still shows a school-day pass)
"""
import asyncio
import sys
from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select, update

from app.core.config import settings
from app.core.database import system_session
from app.models import FeeInvoice, FeePayment, Homework, HomeworkStatus, Notice, Notification, School, Student, User
from app.models.attendance_extra import LeaveRequest
from app.models.security import GatePass
from app.models.transport import Boarding, Trip, TripPing

TAKE_NOTICES = ("Diwali holidays", "Happy Children's Day", "Diwali vacation")  # the last is the demo's old one
TAKE_HOMEWORK = ("Fractions practice: Exercise 6.1",)
SIGNUP_SLUG = "sunrise-academy"


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
        if "signup" in steps:
            old = await db.scalar(select(School).where(School.slug == SIGNUP_SLUG))
            if old:
                await db.delete(old)
        print("ready:", " ".join(steps))


asyncio.run(main(sys.argv[1:]))
