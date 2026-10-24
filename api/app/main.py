import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine
from app.core.errors import install_error_handlers
from app.core.permissions import MODULES
from app.core.redis import close_redis, get_redis
from app.core import roles
from app.routers import academics, academics_extra, accounts, ai, storage, analytics, campus, hr, security, transport, messaging, online, attendance, attendance_extra, auth, billing, communication, dashboard, emails, exams, fees, files, notifications, platform, public, schools, timetable, transfer, users
from app.schemas.common import ok

logging.basicConfig(level=logging.DEBUG if settings.DEBUG else logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    from app.services.backup_service import daily_loop
    task = asyncio.create_task(daily_loop()) if settings.BACKUP_DAILY and not settings.is_test else None
    app.state.started_at = time.time()
    yield
    if task:
        task.cancel()
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.ENVIRONMENT == "production" else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
install_error_handlers(app)

API = "/api/v1"
app.include_router(auth.router, prefix=f"{API}/auth", tags=["Auth"])
app.include_router(schools.router, prefix=f"{API}/schools", tags=["Schools"])
app.include_router(users.router, prefix=f"{API}/users", tags=["Users"])
app.include_router(academics.classes, prefix=f"{API}/classes", tags=["Classes"])
app.include_router(academics.students, prefix=f"{API}/students", tags=["Students"])
app.include_router(academics_extra.syllabus, prefix=f"{API}/syllabus", tags=["Syllabus"])
app.include_router(academics_extra.lessons, prefix=f"{API}/lesson-plans", tags=["Syllabus"])
app.include_router(academics_extra.certificates, prefix=f"{API}/certificates", tags=["Certificates"])
app.include_router(academics_extra.admissions, prefix=f"{API}/admissions", tags=["Admissions"])
app.include_router(academics_extra.promotion, prefix=f"{API}/promotion", tags=["Promotion"])
app.include_router(academics_extra.substitutions, prefix=f"{API}/substitutions", tags=["Substitutions"])
app.include_router(timetable.router, prefix=f"{API}/timetable", tags=["Timetable"])
app.include_router(attendance_extra.attendance, prefix=f"{API}/attendance", tags=["Attendance"])
app.include_router(attendance.router, prefix=f"{API}/attendance", tags=["Attendance"])
app.include_router(attendance_extra.calendar, prefix=f"{API}/calendar", tags=["Calendar"])
app.include_router(attendance_extra.leave, prefix=f"{API}/leave", tags=["Leave"])
app.include_router(attendance_extra.devices, prefix=f"{API}/devices", tags=["Biometric devices"])
app.include_router(attendance_extra.iclock, prefix="/iclock", tags=["ADMS"])
app.include_router(accounts.fees, prefix=f"{API}/fees", tags=["Fees"])
app.include_router(fees.router, prefix=f"{API}/fees", tags=["Fees"])
app.include_router(accounts.accounts, prefix=f"{API}/accounts", tags=["Accounts"])
app.include_router(exams.router, prefix=f"{API}/exams", tags=["Exams"])
app.include_router(online.questions, prefix=f"{API}/questions", tags=["Online tests"])
app.include_router(online.tests, prefix=f"{API}/online-tests", tags=["Online tests"])
app.include_router(online.co_scholastic, prefix=f"{API}/co-scholastic", tags=["Exams"])
app.include_router(online.live, prefix=f"{API}/live-classes", tags=["Live classes"])
app.include_router(emails.router, prefix=f"{API}/emails", tags=["Email"])
app.include_router(transfer.router, prefix=f"{API}/transfer", tags=["Import & export"])
app.include_router(messaging.messaging, prefix=f"{API}/messaging", tags=["SMS and WhatsApp"])
app.include_router(messaging.chat, prefix=f"{API}/chat", tags=["Chat"])
app.include_router(messaging.ptm, prefix=f"{API}/ptm", tags=["Parent-teacher meetings"])
app.include_router(messaging.surveys, prefix=f"{API}/surveys", tags=["Surveys"])
app.include_router(communication.notices, prefix=f"{API}/notices", tags=["Notices"])
app.include_router(communication.homework, prefix=f"{API}/homework", tags=["Homework"])
app.include_router(files.router, prefix=f"{API}/files", tags=["Files"])
app.include_router(storage.router, prefix=f"{API}/storage", tags=["Storage"])
app.include_router(notifications.router, prefix=f"{API}/notifications", tags=["Notifications"])
app.include_router(transport.router, prefix=f"{API}/transport", tags=["Transport"])
app.include_router(hr.router, prefix=f"{API}/hr", tags=["HR and payroll"])
app.include_router(campus.library, prefix=f"{API}/library", tags=["Library"])
app.include_router(campus.hostel, prefix=f"{API}/hostels", tags=["Hostel"])
app.include_router(campus.inventory, prefix=f"{API}/inventory", tags=["Inventory and assets"])
app.include_router(security.gate, prefix=f"{API}/gate", tags=["Gate and security"])
app.include_router(security.compliance, prefix=f"{API}/compliance", tags=["Compliance"])
app.include_router(security.cctv, prefix=f"{API}/cctv", tags=["CCTV"])
app.include_router(billing.router, prefix=f"{API}/subscription", tags=["Subscription"])
app.include_router(dashboard.router, prefix=f"{API}/dashboard", tags=["Dashboard"])
app.include_router(analytics.router, prefix=f"{API}/analytics", tags=["Analytics"])
app.include_router(ai.router, prefix=f"{API}/ai", tags=["AI assistant"])
app.include_router(platform.router, prefix=f"{API}/platform", tags=["Platform"])
app.include_router(public.router, prefix=f"{API}/public", tags=["Public website"])


@app.get(f"{API}/health", tags=["Meta"])
async def health():
    checks = {}
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
    return ok({"status": "ok" if all(v == "ok" for v in checks.values()) else "degraded", **checks})


@app.get(f"{API}/meta/modules", tags=["Meta"])
async def module_registry():
    return ok([{"module": k, "label": v["label"], "default": v["default"]} for k, v in MODULES.items()])


@app.get(f"{API}/meta/roles", tags=["Meta"])
async def role_rules():
    """What each role must and may provide; the web forms are built from this."""
    return ok({
        "roles": {r: {"required": v["required"], "optional": v["optional"]} for r, v in roles.ROLE_RULES.items()},
        "labels": roles.FIELD_LABELS,
        "relationships": roles.RELATIONSHIPS,
        "linked_roles": sorted(roles.LINKED_ROLES),
    })
