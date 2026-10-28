"""FastAPI dependencies: database session with tenant context, auth, permissions."""
import hmac
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_tenant
from app.core.errors import Forbidden, Unauthorized
from app.core.permissions import PREVIEW_MODULES, Role, has_permission, preview_modules_for
from app.core.security import decode_access_token, decode_download_token
from app.models import School, User, UserSession

# scope="function": commit before the response is sent. With the default ("request") the client could
# get its answer before the data was saved, and a request made straight after (e.g. /auth/me after
# login) could miss it.
DB = Annotated[AsyncSession, Depends(get_db, scope="function")]


@dataclass
class CurrentUser:
    user: User
    session_id: uuid.UUID

    @property
    def id(self) -> uuid.UUID:
        return self.user.id

    @property
    def school_id(self) -> uuid.UUID | None:
        return self.user.school_id

    @property
    def role(self) -> str:
        return self.user.role

    @property
    def is_super_admin(self) -> bool:
        return self.user.role == Role.SUPER_ADMIN

    def require_school(self) -> uuid.UUID:
        if not self.user.school_id:
            raise Forbidden("This action requires a school account", code="SCHOOL_REQUIRED")
        return self.user.school_id


def client_ip(request: Request) -> str | None:
    """The visitor's address. Requests from our own website carry it in X-Client-IP, believed only with the shared
    secret (anyone can send the header); everything else is the connecting address (the phone, or the website)."""
    secret = settings.WEB_PROXY_SECRET
    if secret and hmac.compare_digest(request.headers.get("x-web-secret", "").encode(), secret.encode()):
        ip = request.headers.get("x-client-ip", "").strip()
        if ip:
            return ip[:64]
    return request.client.host if request.client else None


async def get_current_user(request: Request, db: DB) -> CurrentUser:
    auth = request.headers.get("Authorization", "")
    scheme, _, token = auth.partition(" ")
    if scheme.lower() == "bearer" and token:
        payload = decode_access_token(token)
    elif request.method == "GET" and request.query_params.get("dl"):
        # A signed download link (see POST /auth/download-link): valid only for the path it was made for.
        payload = decode_download_token(request.query_params["dl"], request.url.path)
    else:
        raise Unauthorized("Not authenticated")

    # Identity lookups happen before we know the tenant, so they run with bypass,
    # then the context is narrowed to the user's school for the rest of the request.
    await set_tenant(db, None, bypass=True)
    session = await db.get(UserSession, uuid.UUID(payload["sid"]))
    now = datetime.now(UTC)
    if not session or session.revoked_at or session.expires_at <= now or str(session.user_id) != payload["sub"]:
        raise Unauthorized("Session expired", code="SESSION_REVOKED")

    user = await db.get(User, session.user_id)
    if not user or not user.is_active or user.deleted_at:
        raise Unauthorized("Account disabled", code="ACCOUNT_DISABLED")
    if user.school_id:
        school = await db.get(School, user.school_id)
        if not school or not school.is_active:
            raise Unauthorized("School is inactive", code="SCHOOL_INACTIVE")

    await set_tenant(db, user.school_id, bypass=user.role == Role.SUPER_ADMIN)
    return CurrentUser(user=user, session_id=session.id)


Auth = Annotated[CurrentUser, Depends(get_current_user)]


def require_permission(permission: str):
    async def checker(current: Auth) -> CurrentUser:
        if not has_permission(current.role, permission):
            raise Forbidden(f"Missing permission: {permission}", code="PERMISSION_DENIED")
        return current
    return Depends(checker)


def require_super_admin():
    async def checker(current: Auth) -> CurrentUser:
        if not current.is_super_admin:
            raise Forbidden("Super admin only", code="PERMISSION_DENIED")
        return current
    return Depends(checker)


async def enabled_modules(db: AsyncSession, school_id: uuid.UUID) -> list[str]:
    """Modules the school has switched on AND its plan includes (preview modules: only where the platform allows them)."""
    from app.models import SchoolModule
    school = await db.get(School, school_id)
    if not school:
        return []
    rows = await db.scalars(select(SchoolModule.module).where(
        SchoolModule.school_id == school_id, SchoolModule.is_enabled.is_(True)))
    allowed = available_modules(school)
    return sorted(m for m in rows.all() if m in allowed)


def available_modules(school: School) -> set[str]:
    """What the school may switch on: its plan's modules, less preview modules unless the platform has allowed them."""
    return (set(school.plan.modules) - PREVIEW_MODULES) | preview_modules_for(school.settings)


def require_module(module: str):
    """Reject requests to a module the school has disabled."""
    async def checker(current: Auth, db: DB) -> CurrentUser:
        if current.is_super_admin:
            return current
        if module not in await enabled_modules(db, current.require_school()):
            raise Forbidden(f"The {module} module is not enabled for this school", code="MODULE_DISABLED")
        return current
    return Depends(checker)
