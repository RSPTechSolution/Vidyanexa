"""In-app notification centre plus phone push.

Services call `notify(...)` inside their transaction. The rows are saved with the rest of the change;
pushes are sent only after the commit, the same way queued emails are.
"""
import asyncio
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import event, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import elevated, system_session
from app.core.errors import NotFound
from app.models import DeviceToken, Notification, Student, StudentGuardian, User
from app.schemas.common import PageMeta, PageParams

log = logging.getLogger("eduvia.push")

CONSOLE_PUSHES: list[dict] = []  # console mode keeps the last pushes here, for tests


async def notify(db: AsyncSession, user_ids, *, school_id: uuid.UUID | None, kind: str, title: str,
                 body: str | None = None, link: str | None = None, data: dict | None = None) -> int:
    """Add a notification for each user (duplicates removed). Returns how many were added."""
    ids = list(dict.fromkeys(u for u in user_ids if u))
    if not ids or db.info.get("suppress_notifications"):
        return 0
    data = {k: v if isinstance(v, (int, float, bool)) or v is None else str(v) for k, v in (data or {}).items()}
    for uid in ids:
        db.add(Notification(school_id=school_id, user_id=uid, kind=kind, title=title[:200], body=body, link=link, data=data))
    # FCM data values must be strings.
    db.info.setdefault("push_outbox", []).append({"user_ids": ids, "title": title[:200], "body": body or "",
                                                   "data": {"kind": kind, "link": link or "", **{k: str(v) for k, v in data.items()}}})
    return len(ids)


async def family_of(db: AsyncSession, student_ids) -> list[uuid.UUID]:
    """Users who should hear about these students: their active parents and their own student logins."""
    student_ids = list(student_ids)
    if not student_ids:
        return []
    parents = await db.scalars(select(StudentGuardian.user_id).join(User, User.id == StudentGuardian.user_id)
                               .where(StudentGuardian.student_id.in_(student_ids), User.is_active.is_(True)))
    own = await db.scalars(select(Student.user_id).where(Student.id.in_(student_ids), Student.user_id.is_not(None)))
    return list(dict.fromkeys([*parents.all(), *own.all()]))


async def family_of_sections(db: AsyncSession, section_ids) -> list[uuid.UUID]:
    students = await db.scalars(select(Student.id).where(Student.section_id.in_(list(section_ids)), Student.status == "active"))
    return await family_of(db, students.all())


# ---- reading --------------------------------------------------------------------------------------

async def list_for(db: AsyncSession, user: User, page: PageParams, *, unread_only: bool = False) -> tuple[list[Notification], PageMeta]:
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = (await db.scalars(q.order_by(Notification.created_at.desc()).offset(page.offset).limit(page.page_size))).all()
    return list(rows), PageMeta(total=total, page=page.page, page_size=page.page_size)


async def unread_count(db: AsyncSession, user: User) -> int:
    return await db.scalar(select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None))) or 0


async def mark_read(db: AsyncSession, user: User, notification_id: uuid.UUID) -> None:
    n = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if not n:
        raise NotFound("Notification not found")
    if not n.read_at:
        n.read_at = datetime.now(UTC)


async def mark_all_read(db: AsyncSession, user: User) -> int:
    res = await db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                           .values(read_at=datetime.now(UTC)))
    return res.rowcount or 0


# ---- devices --------------------------------------------------------------------------------------

async def register_device(db: AsyncSession, user: User, token: str, platform: str, app: str) -> None:
    """A phone signs in: it now gets this user's pushes (a token moves to whoever signed in last).

    One insert-or-move, so two registrations at the same moment can't collide, and across schools (row security would
    hide a token last used at another school, and the insert would then fail on the unique token)."""
    now = datetime.now(UTC)
    values = dict(school_id=user.school_id, user_id=user.id, platform=platform, app=app, last_seen=now)
    async with elevated(db):
        await db.execute(insert(DeviceToken).values(token=token, **values)
                         .on_conflict_do_update(index_elements=[DeviceToken.token], set_=values))


async def unregister_device(db: AsyncSession, user: User, token: str) -> None:
    d = await db.scalar(select(DeviceToken).where(DeviceToken.token == token, DeviceToken.user_id == user.id))
    if d:
        await db.delete(d)


# ---- sending after commit ---------------------------------------------------------------------------

_running: set[asyncio.Task] = set()


@event.listens_for(Session, "after_commit")
def _push_after_commit(session: Session) -> None:
    outbox = session.info.pop("push_outbox", None)
    if outbox:
        try:
            task = asyncio.get_running_loop().create_task(_send_all(outbox))
        except RuntimeError:
            return
        _running.add(task)
        task.add_done_callback(_running.discard)


@event.listens_for(Session, "after_rollback")
def _drop_on_rollback(session: Session) -> None:
    session.info.pop("push_outbox", None)


async def _send_all(outbox: list[dict]) -> None:
    for item in outbox:
        try:
            if settings.PUSH_PROVIDER == "console":
                CONSOLE_PUSHES.append(item)
                del CONSOLE_PUSHES[:-200]
                log.info("push (console) to %d users: %s", len(item["user_ids"]), item["title"])
                continue
            async with system_session(bypass=True) as db:
                tokens = (await db.execute(select(DeviceToken.id, DeviceToken.token)
                                           .where(DeviceToken.user_id.in_(item["user_ids"])))).all()
                dead = [tid for tid, tok in tokens if not await _fcm_send(tok, item)]
                if dead:
                    for d in (await db.scalars(select(DeviceToken).where(DeviceToken.id.in_(dead)))).all():
                        await db.delete(d)
                    await db.commit()
        except Exception:
            log.exception("push failed: %s", item.get("title"))


_fcm_creds = None


def _fcm_access_token() -> tuple[str, str]:
    """(OAuth token, Firebase project id) from the service-account file."""
    global _fcm_creds
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account
    if _fcm_creds is None:
        _fcm_creds = service_account.Credentials.from_service_account_file(
            settings.FIREBASE_CREDENTIALS_FILE, scopes=["https://www.googleapis.com/auth/firebase.messaging"])
    if not _fcm_creds.valid:
        _fcm_creds.refresh(Request())
    return _fcm_creds.token, _fcm_creds.project_id


async def _fcm_send(token: str, item: dict) -> bool:
    """Send one push. False means the token is no longer valid and should be forgotten."""
    import httpx
    access, project = await asyncio.to_thread(_fcm_access_token)
    msg = {"message": {"token": token, "notification": {"title": item["title"], "body": item["body"]}, "data": item["data"]}}
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
                              headers={"Authorization": f"Bearer {access}"}, json=msg)
    if r.status_code == 404 or (r.status_code == 400 and "registration token" in r.text.lower()):
        return False  # the app was uninstalled or the token expired
    if r.status_code >= 300:
        log.warning("FCM %s: %s", r.status_code, r.text[:300])
    return True
