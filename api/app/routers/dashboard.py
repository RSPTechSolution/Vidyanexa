"""Numbers for the school dashboard. Everything here is real data."""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import DB, CurrentUser, enabled_modules, require_permission
from app.models import AuditLog, User
from app.schemas.billing import PlanBrief
from app.schemas.common import ApiResponse, ok
from app.services import billing_service, school_service

router = APIRouter()


class DayCount(BaseModel):
    date: str
    count: int


class RoleCount(BaseModel):
    role: str
    count: int


class Limit(BaseModel):
    used: int
    limit: int | None


class DashboardSummary(BaseModel):
    plan: PlanBrief
    subscription_status: str
    trial_days_left: int
    active_users: int  # accounts that can sign in
    roles: list[RoleCount]  # people: students counted from student records, everyone else by account
    student_logins: int  # students who also have their own app login
    signins: list[DayCount]
    signins_total: int
    students: Limit
    staff: Limit
    storage: Limit  # bytes
    modules_enabled: int
    modules_in_plan: int


@router.get("/summary", response_model=ApiResponse[DashboardSummary])
async def summary(db: DB, current: CurrentUser = require_permission("school.view")):
    school_id = current.require_school()
    school = await school_service.get_school(db, school_id)
    tz = ZoneInfo(school.timezone)

    roles = (await db.execute(
        select(User.role, func.count()).where(
            User.school_id == school_id, User.is_active.is_(True), User.deleted_at.is_(None)
        ).group_by(User.role).order_by(func.count().desc())
    )).all()

    # Sign-ins per day for the last 14 days, in the school's own time zone.
    today = datetime.now(tz).date()
    start = today - timedelta(days=13)
    start_utc = datetime.combine(start, datetime.min.time(), tz).astimezone(UTC)
    local_day = func.date(func.timezone(school.timezone, AuditLog.created_at))
    rows = (await db.execute(
        select(local_day, func.count()).where(
            AuditLog.school_id == school_id, AuditLog.action == "auth.login", AuditLog.created_at >= start_utc
        ).group_by(local_day)
    )).all()
    by_day = {d: n for d, n in rows}
    signins = [DayCount(date=(start + timedelta(days=i)).isoformat(), count=by_day.get(start + timedelta(days=i), 0))
               for i in range(14)]

    used = await billing_service.usage(db, school_id)
    view = billing_service.subscription_view(school, used)
    return ok(DashboardSummary(
        plan=PlanBrief.model_validate(school.plan),
        subscription_status=school.subscription_status,
        trial_days_left=view["trial_days_left"],
        active_users=sum(n for _, n in roles),
        # Students are people with a student record; most have no login of their own (their parents
        # use the app), so counting student accounts here made 200 students look like 17.
        roles=sorted([RoleCount(role=r, count=n) for r, n in roles if r != "student"]
                     + [RoleCount(role="student", count=used["students"])], key=lambda x: -x.count),
        student_logins=dict(roles).get("student", 0),
        signins=signins,
        signins_total=sum(d.count for d in signins),
        students=Limit(used=used["students"], limit=school.plan.max_students),
        staff=Limit(used=used["staff"], limit=school.plan.max_staff),
        storage=Limit(used=used["storage_bytes"], limit=school.plan.storage_gb * 1024 ** 3),
        modules_enabled=len(await enabled_modules(db, school_id)),
        modules_in_plan=len(school.plan.modules),
    ))
