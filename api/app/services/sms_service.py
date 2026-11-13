"""SMS and WhatsApp to parents' phones.

Each school chooses which events also go by SMS and/or WhatsApp (School.settings["messaging"]: {event: [channels]}).
Messages are logged in the transaction and sent after the commit. With the "console" providers they are only
logged, so the feature can be tried without an account.
"""
import asyncio
import logging
import re
import uuid

import httpx
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import system_session
from app.models import MessageLog, School

log = logging.getLogger("eduvia.sms")

EVENTS = {
    "absent": "Child marked absent",
    "fee_reminder": "Fee reminders",
    "fee_receipt": "Fee received",
    "notice": "Urgent notices",
    "leave": "Leave approved or declined",
    "transport": "Child boarded or left the bus",
    "gate": "Child left school early with a gate pass",
}
CHANNELS = ("sms", "whatsapp")


def provider(channel: str) -> str:
    return settings.SMS_PROVIDER if channel == "sms" else settings.WHATSAPP_PROVIDER


def normalise(phone: str | None) -> str | None:
    """+91 98140 10001 / 09814010001 / 9814010001 -> +919814010001. None if it can't be a mobile number."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        digits = "91" + digits
    return f"+{digits}" if 11 <= len(digits) <= 15 else None


async def channels_for(db: AsyncSession, school_id: uuid.UUID, event_name: str) -> list[str]:
    school = await db.get(School, school_id)
    chosen = ((school.settings or {}).get("messaging") or {}).get(event_name) or [] if school else []
    return [c for c in chosen if c in CHANNELS]


async def queue(db: AsyncSession, *, school_id: uuid.UUID | None, event_name: str, phones, body: str, force: list[str] | None = None) -> int:
    """Send `body` to each phone on the channels the school turned on for this event (or `force`)."""
    chans = force if force is not None else await channels_for(db, school_id, event_name)
    numbers = list(dict.fromkeys(n for n in (normalise(p) for p in phones) if n))
    if not chans or not numbers:
        return 0
    n = 0
    for ch in chans:
        for to in numbers:
            row = MessageLog(school_id=school_id, channel=ch, to=to, body=body[:1000], kind=event_name,
                             status="logged" if provider(ch) == "console" else "queued")
            db.add(row)
            await db.flush()
            if provider(ch) != "console":
                db.info.setdefault("sms_outbox", []).append(row.id)
            else:
                log.info("%s (console) to %s: %s", ch, to, body[:80])
            n += 1
    return n


_running: set[asyncio.Task] = set()


@event.listens_for(Session, "after_commit")
def _send_after_commit(session: Session) -> None:
    ids = session.info.pop("sms_outbox", None)
    if ids:
        try:
            task = asyncio.get_running_loop().create_task(_send(ids))
        except RuntimeError:
            return
        _running.add(task)
        task.add_done_callback(_running.discard)


@event.listens_for(Session, "after_rollback")
def _drop(session: Session) -> None:
    session.info.pop("sms_outbox", None)


async def _send(ids: list[uuid.UUID]) -> None:
    async with system_session(bypass=True) as db:
        for row in (await db.scalars(select(MessageLog).where(MessageLog.id.in_(ids)))).all():
            try:
                await deliver(row.channel, row.to, row.body)
                row.status, row.error = "sent", None
            except Exception as e:  # noqa: BLE001 - recorded for the school to see
                row.status, row.error = "failed", str(e)[:300]
                log.warning("%s to %s failed: %s", row.channel, row.to, e)
        await db.commit()


async def deliver(channel: str, to: str, body: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        if channel == "sms" and settings.SMS_PROVIDER == "twilio":
            r = await client.post(f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
                                  auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                                  data={"To": to, "From": settings.TWILIO_FROM, "Body": body})
        elif channel == "sms" and settings.SMS_PROVIDER == "msg91":
            r = await client.post("https://control.msg91.com/api/v5/flow/", headers={"authkey": settings.MSG91_AUTH_KEY},
                                  json={"sender": settings.MSG91_SENDER_ID, "mobiles": to.lstrip("+"), "message": body})
        elif channel == "whatsapp" and settings.WHATSAPP_PROVIDER == "meta":
            r = await client.post(f"https://graph.facebook.com/v20.0/{settings.WHATSAPP_PHONE_ID}/messages",
                                  headers={"Authorization": f"Bearer {settings.WHATSAPP_TOKEN}"},
                                  json={"messaging_product": "whatsapp", "to": to.lstrip("+"), "type": "text", "text": {"body": body}})
        else:
            raise RuntimeError(f"No {channel} provider configured")
    if r.status_code >= 300:
        raise RuntimeError(f"{r.status_code}: {r.text[:200]}")


async def recent(db: AsyncSession, school_id: uuid.UUID, limit: int = 100) -> list[MessageLog]:
    return list((await db.scalars(select(MessageLog).where(MessageLog.school_id == school_id)
                                  .order_by(MessageLog.created_at.desc()).limit(limit))).all())


async def counts_today(db: AsyncSession, school_id: uuid.UUID) -> dict[str, int]:
    rows = (await db.execute(select(MessageLog.channel, func.count()).where(
        MessageLog.school_id == school_id, MessageLog.created_at >= func.date_trunc("day", func.now())).group_by(MessageLog.channel))).all()
    return {c: n for c, n in rows}





async def family_phones(db: AsyncSession, student_ids) -> list[str]:
    """Phones of a student's active parents (and the student's own login, if it has a phone)."""
    from app.models import Student, StudentGuardian, User
    ids = list(student_ids)
    parents = (await db.scalars(select(User.phone).join(StudentGuardian, StudentGuardian.user_id == User.id)
                                .where(StudentGuardian.student_id.in_(ids), User.is_active.is_(True), User.phone.is_not(None)))).all()
    own = (await db.scalars(select(User.phone).join(Student, Student.user_id == User.id)
                            .where(Student.id.in_(ids), User.phone.is_not(None)))).all()
    return [p for p in [*parents, *own] if p]
