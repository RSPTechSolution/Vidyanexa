"""Platform operations for the super admin: system health and platform settings (support contacts, announcement banner)."""
import shutil
import time
from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import get_redis
from app.models import PlatformSetting, School, StoredFile, Student, User, UserSession
from app.services import ai_service, backup_service


class Banner(BaseModel):
    text: str = Field("", max_length=300)
    tone: str = Field("info", pattern=r"^(info|warning|danger)$")
    until: datetime | None = None  # hidden after this time


class PlatformSettings(BaseModel):
    product_name: str = Field("Vidyanexa", min_length=2, max_length=60)
    support_email: EmailStr | None = None
    support_phone: str | None = Field(None, max_length=20)
    banner: Banner = Banner()


async def get_settings(db: AsyncSession) -> PlatformSettings:
    row = await db.get(PlatformSetting, "platform")
    return PlatformSettings(**(row.value if row else {}))


async def save_settings(db: AsyncSession, data: PlatformSettings) -> PlatformSettings:
    row = await db.get(PlatformSetting, "platform")
    value = data.model_dump(mode="json")
    if row:
        row.value = value
    else:
        db.add(PlatformSetting(key="platform", value=value))
    await db.flush()
    return data


async def public_settings(db: AsyncSession) -> dict:
    """What every visitor may see: product name, support contacts, and the banner while it is current."""
    s = await get_settings(db)
    banner = s.banner if s.banner.text and (not s.banner.until or s.banner.until > datetime.now(UTC)) else None
    return {"product_name": s.product_name, "support_email": s.support_email, "support_phone": s.support_phone,
            "banner": banner.model_dump(mode="json") if banner else None}


async def health(db: AsyncSession, started_at: float | None) -> dict:
    checks: dict = {}
    t = time.perf_counter()
    try:
        version = (await db.execute(text("SHOW server_version"))).scalar()
        size = (await db.execute(text("SELECT pg_database_size(current_database())"))).scalar()
        revision = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalar()
        checks["database"] = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1), "version": version, "size_mb": round(size / 1048576, 1),
                              "revision": revision}
    except Exception as e:  # report, don't fail
        checks["database"] = {"ok": False, "error": type(e).__name__}
    t = time.perf_counter()
    try:
        redis = get_redis()
        await redis.ping()
        info = await redis.info("memory")
        checks["redis"] = {"ok": True, "ms": round((time.perf_counter() - t) * 1000, 1), "memory_mb": round(int(info.get("used_memory", 0)) / 1048576, 1)}
    except Exception as e:
        checks["redis"] = {"ok": False, "error": type(e).__name__}
    disk = shutil.disk_usage(backup_service.backup_dir())
    files = (await db.execute(select(func.count(), func.coalesce(func.sum(StoredFile.size), 0)))).one()
    checks["storage"] = {"ok": disk.free / disk.total > 0.05, "free_gb": round(disk.free / 1e9, 1), "total_gb": round(disk.total / 1e9, 1),
                         "files": files[0], "files_mb": round(files[1] / 1048576, 1)}
    backups = backup_service.list_backups()
    newest = backups[0] if backups else None
    age_h = (datetime.now(UTC) - datetime.fromisoformat(newest["created_at"])).total_seconds() / 3600 if newest and newest["created_at"] else None
    checks["backups"] = {"ok": age_h is not None and age_h < 48, "count": len(backups), "newest": newest["name"] if newest else None,
                         "hours_ago": round(age_h, 1) if age_h is not None else None, "daily": settings.BACKUP_DAILY}
    checks["providers"] = {"email": settings.EMAIL_PROVIDER, "sms": settings.SMS_PROVIDER, "whatsapp": settings.WHATSAPP_PROVIDER,
                           "push": settings.PUSH_PROVIDER, "payments": settings.PAYMENT_GATEWAY,
                           "ai": ai_service.llm_name()}
    day = datetime.now(UTC) - timedelta(days=1)
    usage = {
        "schools": await db.scalar(select(func.count()).select_from(School).where(School.is_active.is_(True))) or 0,
        "users": await db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True), User.deleted_at.is_(None))) or 0,
        "students": await db.scalar(select(func.count()).select_from(Student).where(Student.status == "active")) or 0,
        "signins_24h": await db.scalar(select(func.count()).select_from(User).where(User.last_login_at >= day)) or 0,
        "sessions": await db.scalar(select(func.count()).select_from(UserSession).where(UserSession.revoked_at.is_(None),
                                                                                      UserSession.expires_at > datetime.now(UTC))) or 0,
    }
    status = "ok" if all(c.get("ok", True) for k, c in checks.items() if k != "providers") else "degraded"
    return {"status": status, "environment": settings.ENVIRONMENT, "uptime_s": round(time.time() - started_at) if started_at else None,
            "checked_at": datetime.now(UTC).isoformat(), **checks, "usage": usage}
