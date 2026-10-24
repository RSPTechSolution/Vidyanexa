"""Local filming only: marks today's attendance for the whole demo school (most present, a few absent or late), so the
overview shows a real school day. Run from api/:  PYTHONPATH=. venv/Scripts/python ../web/scripts/social/fill_today.py"""
import asyncio
import random
from datetime import date

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import system_session
from app.models import AttendanceRecord, School, Student


async def main():
    assert settings.ENVIRONMENT != "production", "local demo only"
    rnd = random.Random(24)
    async with system_session() as db:
        s = await db.scalar(select(School).where(School.slug == "demo"))
        today = date.today()
        await db.execute(delete(AttendanceRecord).where(AttendanceRecord.school_id == s.id, AttendanceRecord.date == today))
        students = (await db.scalars(select(Student).where(Student.school_id == s.id, Student.status == "active"))).all()
        for st in students:
            r = rnd.random()
            status = "absent" if r < 0.05 else "late" if r < 0.09 else "present"
            db.add(AttendanceRecord(school_id=s.id, student_id=st.id, section_id=st.section_id, date=today, status=status))
        print(f"marked {len(students)} students for {today}")

asyncio.run(main())
