"""Sending email.

Callers queue a message inside the request's transaction; it is sent only after that
transaction commits, so a rolled-back request never emails anyone. Each attempt is
recorded in ``email_log`` (without the body, which can contain passwords).

Providers:
- ``console``: write the message to the log instead of sending (development, tests).
- ``brevo``: Brevo's HTTP API for keys starting ``xkeysib-``, its SMTP relay otherwise.
"""
import asyncio
import logging
import smtplib
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formataddr

import httpx
from sqlalchemy import event, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, TenantContext
from app.models import EmailLog

log = logging.getLogger("eduvia.email")

# The last messages "sent" in console mode, so tests and developers can read them.
CONSOLE_OUTBOX: deque["Email"] = deque(maxlen=50)


@dataclass
class Email:
    to: str
    subject: str
    html: str
    text: str
    to_name: str | None = None
    kind: str = "general"
    log_id: uuid.UUID | None = None
    content: dict | None = None  # the parts (title, intro, rows...), so the school's branding can be applied when queued
    from_name: str | None = None  # e.g. "Green Valley Public School via Vidyanexa"; EMAIL_FROM_NAME when empty
    reply_to: str | None = None  # the school office, so replies reach the school


def provider_name() -> str:
    if settings.EMAIL_PROVIDER != "brevo":
        return "console"
    return "brevo-api" if settings.BREVO_API_KEY.startswith("xkeysib-") else "brevo-smtp"


async def queue(db: AsyncSession, msg: Email, *, school_id: uuid.UUID | None) -> None:
    """Record the email and send it once the current transaction commits.

    Bulk imports set ``db.info["suppress_emails"]`` while they validate rows, then decide afterwards
    whether to email the new accounts."""
    if db.info.get("suppress_emails"):
        return
    if school_id and msg.content:
        # Every school email looks like the school's own: its colour band, logo and details on top, its name as sender.
        from app.models import School
        from app.services import email_templates
        school = await db.get(School, school_id)
        if school:
            email_templates.apply_brand(msg, school)
    row = EmailLog(school_id=school_id, to_email=msg.to, to_name=msg.to_name, subject=msg.subject, kind=msg.kind,
                   provider=provider_name(), status="queued")
    db.add(row)
    await db.flush()
    msg.log_id = row.id
    domain = msg.to.rsplit("@", 1)[-1].lower()
    if domain in settings.EMAIL_SKIP_DOMAINS and provider_name() != "console":
        row.status = "skipped"  # demo and test addresses are never really emailed
        CONSOLE_OUTBOX.append(msg)
        log.info("Email to %s skipped (demo domain): %s", msg.to, msg.subject)
        return
    if provider_name() == "console":
        row.status, row.sent_at = "logged", datetime.now(UTC)
        CONSOLE_OUTBOX.append(msg)
        log.info("Email (console mode) to %s: %s\n%s", msg.to, msg.subject, msg.text)
        return
    db.sync_session.info.setdefault("email_outbox", []).append(msg)


_running: set[asyncio.Task] = set()  # keep a reference so pending sends aren't garbage-collected


@event.listens_for(Session, "after_commit")
def _send_after_commit(session: Session) -> None:
    outbox = session.info.pop("email_outbox", None)
    if outbox:
        task = asyncio.get_running_loop().create_task(_deliver_all(outbox))
        _running.add(task)
        task.add_done_callback(_running.discard)


@event.listens_for(Session, "after_rollback")
def _drop_on_rollback(session: Session) -> None:
    session.info.pop("email_outbox", None)


async def _deliver_all(messages: list[Email]) -> None:
    for msg in messages:
        error = None
        try:
            await deliver(msg)
        except Exception as e:  # noqa: BLE001 - any failure is recorded, never raised into a request
            error = f"{type(e).__name__}: {e}"[:1000]
            log.warning("Email to %s failed: %s", msg.to, error)
        await _record(msg.log_id, error)


async def _record(log_id: uuid.UUID | None, error: str | None) -> None:
    if not log_id:
        return
    async with SessionLocal() as s:
        s.info["tenant"] = TenantContext(bypass=True)
        await s.execute(update(EmailLog).where(EmailLog.id == log_id).values(
            status="failed" if error else "sent", error=error, sent_at=None if error else datetime.now(UTC)))
        await s.commit()


async def deliver(msg: Email) -> None:
    """Send one message now with the configured provider."""
    if provider_name() == "brevo-api":
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post("https://api.brevo.com/v3/smtp/email", headers={"api-key": settings.BREVO_API_KEY}, json={
                "sender": {"email": settings.EMAIL_FROM, "name": msg.from_name or settings.EMAIL_FROM_NAME},
                "to": [{"email": msg.to, **({"name": msg.to_name} if msg.to_name else {})}],
                **({"replyTo": {"email": msg.reply_to}} if msg.reply_to else {}),
                "subject": msg.subject, "htmlContent": msg.html, "textContent": msg.text,
            })
            if res.status_code >= 300:
                raise RuntimeError(f"Brevo API {res.status_code}: {res.text[:300]}")
        return
    if provider_name() == "brevo-smtp":
        await asyncio.to_thread(_smtp_send, msg)
        return
    CONSOLE_OUTBOX.append(msg)


def _smtp_send(msg: Email) -> None:
    m = EmailMessage()
    m["From"] = formataddr((msg.from_name or settings.EMAIL_FROM_NAME, settings.EMAIL_FROM))
    m["To"] = formataddr((msg.to_name or "", msg.to))
    if msg.reply_to:
        m["Reply-To"] = msg.reply_to
    m["Subject"] = msg.subject
    m.set_content(msg.text)
    m.add_alternative(msg.html, subtype="html")
    with smtplib.SMTP(settings.BREVO_SMTP_HOST, settings.BREVO_SMTP_PORT, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(settings.BREVO_SMTP_LOGIN, settings.BREVO_API_KEY)
        smtp.send_message(m)


async def sent_today(db: AsyncSession, school_id: uuid.UUID | None = None) -> int:
    start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    # Only real sends count against the provider's daily limit (not logged, skipped or failed ones).
    stmt = select(func.count()).select_from(EmailLog).where(EmailLog.created_at >= start, EmailLog.status.in_(["sent", "queued"]))
    if school_id:
        stmt = stmt.where(EmailLog.school_id == school_id)
    return await db.scalar(stmt) or 0
