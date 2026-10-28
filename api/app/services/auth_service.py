import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import set_tenant
from app.core.deps import enabled_modules
from app.core.errors import BadRequest, Forbidden, Unauthorized
from app.core.permissions import PERMISSIONS, Role, has_permission
from app.core.security import (
    DUMMY_HASH, create_access_token, hash_password, hash_token, new_opaque_token, verify_password,
)
from app.models import PasswordResetToken, School, User, UserSession
from app.schemas.auth import LoginResponse, MeOut, SchoolBrief, TokenPair
from app.services import audit_service
from app.services import notify

log = logging.getLogger("eduvia.auth")
INVALID = "Invalid email, password or school"


def _now() -> datetime:
    return datetime.now(UTC)


def awaiting_verification(school: School | None, user: User) -> bool:
    """A school that signed itself up can't be used until its first admin confirms the email (or mobile) with a code."""
    return bool(school and (school.settings or {}).get("awaiting_verification") and not user.verified_at)


async def _verified(db: AsyncSession, user: User, school: School | None) -> None:
    """The person proved they own the address: by a code sent there, or the temporary password sent there. The first
    time this happens for a school that signed itself up, the school opens and its free trial starts."""
    if user.verified_at:
        return
    opening = awaiting_verification(school, user)
    user.verified_at = _now()
    if opening:
        from app.core import pricing
        school.settings = {k: v for k, v in (school.settings or {}).items() if k != "awaiting_verification"}
        if school.subscription_status == "trialing":
            school.trial_ends_at = _now() + timedelta(days=pricing.TRIAL_DAYS)  # the trial counts from the day it opens
        await audit_service.record(db, "school.verified", school_id=school.id, user_id=user.id)
        await notify.school_ready(db, user, school)


async def build_me(db: AsyncSession, user: User) -> MeOut:
    me = MeOut.model_validate(user)
    if user.school_id:
        school = await db.get(School, user.school_id)
        me.school = SchoolBrief.model_validate(school)
        me.school.brand_color = (school.settings or {}).get("brand_color")
        me.modules = await enabled_modules(db, user.school_id)
    me.permissions = sorted(p for p in PERMISSIONS if has_permission(user.role, p))
    return me


async def _find_user(db: AsyncSession, email: str, school_slug: str | None = None) -> tuple[User | None, School | None]:
    """The account for an email. People sign in with their email alone: it has at most one active account across
    Vidyanexa. Failing that, a deactivated one (so the person is told it's disabled). `school_slug` is still accepted from
    older app versions, and only narrows the search."""
    stmt = select(User).where(User.email == email.lower(), User.deleted_at.is_(None))
    if school_slug:
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return None, None
        stmt = stmt.where(User.school_id == school.id)
    user = await db.scalar(stmt.order_by(User.is_active.desc(), User.updated_at.desc()).limit(1))
    if not user:
        return None, None
    return user, await db.get(School, user.school_id) if user.school_id else None


async def _issue_tokens(db: AsyncSession, user: User, *, ip: str | None, user_agent: str | None) -> TokenPair:
    refresh = new_opaque_token()
    session = UserSession(
        school_id=user.school_id, user_id=user.id, refresh_token_hash=hash_token(refresh),
        expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=ip, user_agent=(user_agent or "")[:300] or None,
    )
    db.add(session)
    await db.flush()
    access, ttl = create_access_token(user_id=user.id, session_id=session.id, school_id=user.school_id, role=user.role)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=ttl)


async def login(db: AsyncSession, email: str, password: str, school_slug: str | None,
                *, ip: str | None = None, user_agent: str | None = None) -> LoginResponse:
    await set_tenant(db, None, bypass=True)
    user, school = await _find_user(db, email, school_slug)

    # Always run bcrypt so response time does not reveal whether the email exists.
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise Unauthorized(INVALID, code="INVALID_CREDENTIALS")
    if not user.is_active:
        raise Unauthorized("This account is disabled", code="ACCOUNT_DISABLED")
    if school and not school.is_active:
        raise Unauthorized("This school is inactive", code="SCHOOL_INACTIVE")
    if awaiting_verification(school, user):
        raise Forbidden(f"Confirm your email first: enter the code we sent to {user.email}, or ask for a new one.",
                        code="ACCOUNT_NOT_VERIFIED", details={"email": user.email, "school_slug": school.slug})
    await _verified(db, user, school)  # added by their school: the temporary password reached them, so the address is theirs

    tokens = await _issue_tokens(db, user, ip=ip, user_agent=user_agent)
    user.last_login_at = _now()
    await audit_service.record(db, "auth.login", school_id=user.school_id, user_id=user.id, ip=ip)
    await db.flush()
    await set_tenant(db, user.school_id, bypass=user.role == Role.SUPER_ADMIN)
    return LoginResponse(tokens=tokens, user=await build_me(db, user))


async def refresh(db: AsyncSession, token: str, *, ip: str | None = None) -> TokenPair:
    await set_tenant(db, None, bypass=True)
    token_hash = hash_token(token)
    session = await db.scalar(select(UserSession).where(UserSession.refresh_token_hash == token_hash).with_for_update())

    if not session:
        # A rotated-out token being replayed means it may have been stolen: kill that session.
        reused = await db.scalar(select(UserSession).where(UserSession.previous_token_hash == token_hash))
        if reused and not reused.revoked_at:
            reused.revoked_at = _now()
            await audit_service.record(db, "auth.refresh_reuse", school_id=reused.school_id,
                                       user_id=reused.user_id, ip=ip)
            await db.commit()  # persist the revocation even though we raise below
        raise Unauthorized("Invalid refresh token", code="INVALID_REFRESH_TOKEN")

    if session.revoked_at or session.expires_at <= _now():
        raise Unauthorized("Session expired", code="SESSION_REVOKED")

    user = await db.get(User, session.user_id)
    if not user or not user.is_active or user.deleted_at:
        raise Unauthorized("Account disabled", code="ACCOUNT_DISABLED")
    if user.school_id:
        school = await db.get(School, user.school_id)
        if not school or not school.is_active:
            raise Unauthorized("This school is inactive", code="SCHOOL_INACTIVE")

    new_refresh = new_opaque_token()
    session.previous_token_hash = token_hash
    session.refresh_token_hash = hash_token(new_refresh)
    session.last_used_at = _now()
    if ip:
        session.ip_address = ip
    await db.flush()
    access, ttl = create_access_token(user_id=user.id, session_id=session.id, school_id=user.school_id, role=user.role)
    return TokenPair(access_token=access, refresh_token=new_refresh, expires_in=ttl)


async def revoke_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    await set_tenant(db, None, bypass=True)
    await db.execute(update(UserSession).where(UserSession.id == session_id, UserSession.revoked_at.is_(None))
                     .values(revoked_at=_now()))


async def revoke_user_sessions(db: AsyncSession, user_id: uuid.UUID, *, except_session: uuid.UUID | None = None) -> None:
    stmt = update(UserSession).where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
    if except_session:
        stmt = stmt.where(UserSession.id != except_session)
    await db.execute(stmt.values(revoked_at=_now()))


async def change_password(db: AsyncSession, user: User, session_id: uuid.UUID, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise BadRequest("Current password is incorrect", code="WRONG_PASSWORD")
    if verify_password(new, user.password_hash):
        raise BadRequest("New password must differ from the current one", code="PASSWORD_REUSED")
    user.password_hash = hash_password(new)
    user.must_change_password = False
    await revoke_user_sessions(db, user.id, except_session=session_id)
    await audit_service.record(db, "auth.password_change", school_id=user.school_id, user_id=user.id)
    await notify.password_changed(db, user)


# ---- sign in with a one-time code ------------------------------------------------------------

async def _find_for_otp(db: AsyncSession, identifier: str, school_slug: str | None) -> User | None:
    from sqlalchemy import func

    from app.services.sms_service import normalise
    ident = identifier.strip()
    if "@" in ident:
        user, _ = await _find_user(db, ident, school_slug)
        return user
    phone = normalise(ident)
    if not phone:
        return None
    stmt = select(User).where(User.deleted_at.is_(None), User.is_active.is_(True), User.phone.isnot(None),
                              func.right(func.regexp_replace(User.phone, r"\D", "", "g"), 10) == phone[-10:])
    if school_slug:
        school = await db.scalar(select(School).where(School.slug == school_slug))
        if not school:
            return None
        stmt = stmt.where(User.school_id == school.id)
    rows = (await db.scalars(stmt.limit(2))).all()
    return rows[0] if len(rows) == 1 else None  # a shared number can't say whose account it is: use email instead


def _otp_key(user_id: uuid.UUID) -> str:
    return f"otp:{user_id}"


async def request_login_code(db: AsyncSession, identifier: str, school_slug: str | None) -> str | None:
    """Send a 6-digit code to the account's email (and phone, when signing in by phone). Returns the code, or None if no account matched.
    Callers answer the same either way."""
    await set_tenant(db, None, bypass=True)
    user = await _find_for_otp(db, identifier, school_slug)
    if not user or not user.is_active:
        return None
    code = await issue_code(user)
    await audit_service.record(db, "auth.login_code_requested", school_id=user.school_id, user_id=user.id)
    school = await db.get(School, user.school_id) if user.school_id else None
    if awaiting_verification(school, user):
        await notify.signup_code(db, user, school, code)  # "send again" while confirming a new school
    else:
        await notify.login_code(db, user, code, by_sms="@" not in identifier)
    return code


async def issue_code(user: User) -> str:
    """A fresh 6-digit code for this person, replacing any earlier one. Stored hashed, with a count of wrong tries."""
    import secrets

    from app.core.redis import get_redis
    code = f"{secrets.randbelow(10**6):06d}"
    await get_redis().set(_otp_key(user.id), f"{hash_token(code + str(user.id))}|0", ex=settings.OTP_EXPIRE_MINUTES * 60)
    return code


async def login_with_code(db: AsyncSession, identifier: str, code: str, school_slug: str | None,
                          *, ip: str | None = None, user_agent: str | None = None) -> LoginResponse:
    from app.core.redis import get_redis
    await set_tenant(db, None, bypass=True)
    user = await _find_for_otp(db, identifier, school_slug)
    bad = Unauthorized("That code is wrong or has expired", code="INVALID_CODE")
    if not user:
        raise bad
    redis = get_redis()
    stored = await redis.get(_otp_key(user.id))
    if not stored:
        raise bad
    digest, tries = (stored.decode() if isinstance(stored, bytes) else stored).split("|")
    if not secrets_equal(digest, hash_token(code.strip() + str(user.id))):
        if int(tries) + 1 >= 5:
            await redis.delete(_otp_key(user.id))  # too many wrong guesses: ask for a new code
        else:
            await redis.set(_otp_key(user.id), f"{digest}|{int(tries) + 1}", keepttl=True)
        raise bad
    await redis.delete(_otp_key(user.id))
    if not user.is_active:
        raise Unauthorized("This account is disabled", code="ACCOUNT_DISABLED")
    school = await db.get(School, user.school_id) if user.school_id else None
    if school and not school.is_active:
        raise Unauthorized("This school is inactive", code="SCHOOL_INACTIVE")
    await _verified(db, user, school)  # the code reached their email or phone
    tokens = await _issue_tokens(db, user, ip=ip, user_agent=user_agent)
    user.last_login_at = _now()
    await audit_service.record(db, "auth.login", school_id=user.school_id, user_id=user.id, ip=ip, meta={"method": "code"})
    await db.flush()
    await set_tenant(db, user.school_id, bypass=user.role == Role.SUPER_ADMIN)
    return LoginResponse(tokens=tokens, user=await build_me(db, user))


def secrets_equal(a: str, b: str) -> bool:
    import hmac
    return hmac.compare_digest(a, b)


async def request_password_reset(db: AsyncSession, email: str, school_slug: str | None) -> str | None:
    """Creates a reset token. Returns the raw token (for delivery) or None if no such user.
    Callers must respond identically either way to avoid account enumeration."""
    await set_tenant(db, None, bypass=True)
    user, _ = await _find_user(db, email, school_slug.strip().lower() if school_slug else None)
    if not user or not user.is_active:
        return None
    token = new_opaque_token()
    db.add(PasswordResetToken(
        school_id=user.school_id, user_id=user.id, token_hash=hash_token(token),
        expires_at=_now() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
    ))
    await audit_service.record(db, "auth.password_reset_requested", school_id=user.school_id, user_id=user.id)
    await db.flush()
    await notify.password_reset(db, user, token)
    return token


async def confirm_password_reset(db: AsyncSession, token: str, new_password: str) -> None:
    await set_tenant(db, None, bypass=True)
    row = await db.scalar(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == hash_token(token)).with_for_update())
    if not row or row.used_at or row.expires_at <= _now():
        raise BadRequest("Reset link is invalid or has expired", code="INVALID_RESET_TOKEN")
    user = await db.get(User, row.user_id)
    if not user or not user.is_active or user.deleted_at:
        raise BadRequest("Reset link is invalid or has expired", code="INVALID_RESET_TOKEN")
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    row.used_at = _now()
    await revoke_user_sessions(db, user.id)
    await audit_service.record(db, "auth.password_reset", school_id=user.school_id, user_id=user.id)
    await notify.password_changed(db, user)
