"""Local filming only: clears today's attendance (daily and period) for the demo school, so each take starts from an
empty register. Run from api/:  PYTHONPATH=. venv/Scripts/python ../web/scripts/social/reset_today.py"""
import asyncio
from datetime import date

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import system_session
from app.models import AttendanceRecord, School
from app.models.attendance_extra import PeriodAttendance


async def main():
    assert settings.ENVIRONMENT != "production", "local demo only"
    async with system_session() as db:
        s = await db.scalar(select(School).where(School.slug == "demo"))
        today = date.today()
        a = await db.execute(delete(AttendanceRecord).where(AttendanceRecord.school_id == s.id, AttendanceRecord.date == today))
        p = await db.execute(delete(PeriodAttendance).where(PeriodAttendance.school_id == s.id, PeriodAttendance.date == today))
        print(f"cleared {a.rowcount} attendance and {p.rowcount} period records for {today}")

asyncio.run(main())
