"""Local filming only: makes Suresh Patel's (parent@demo.com) phone look like a good day. His children's outstanding fees
are paid by UPI through the normal payment code (so real receipts exist), and his old notifications are cleared.
Run from api/:  PYTHONPATH=. venv/Scripts/python ../web/scripts/social/prep_parent.py"""
import asyncio
from decimal import Decimal

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import system_session
from app.models import FeeInvoice, Notification, School, StudentGuardian, User
from app.schemas.finance import CollectPayment
from app.services import fee_service


async def main():
    assert settings.ENVIRONMENT != "production", "local demo only"
    async with system_session() as db:
        db.info["suppress_emails"] = True
        s = await db.scalar(select(School).where(School.slug == "demo"))
        parent = await db.scalar(select(User).where(User.email == "parent@demo.com"))
        office = await db.scalar(select(User).where(User.email == "accounts@demo.com"))
        kids = (await db.scalars(select(StudentGuardian.student_id).where(StudentGuardian.user_id == parent.id))).all()
        paid = 0
        for inv in (await db.scalars(select(FeeInvoice).where(FeeInvoice.student_id.in_(kids), FeeInvoice.status != "cancelled"))).all():
            due = Decimal(inv.total) - Decimal(inv.discount or 0) - Decimal(inv.paid or 0)
            if due > 0:
                await fee_service.collect(db, s.id, inv.id, CollectPayment(amount=due, method="upi"), actor_id=office.id)
                paid += 1
        await db.execute(delete(Notification).where(Notification.user_id == parent.id))
        print(f"paid {paid} invoices; cleared notifications")

asyncio.run(main())
