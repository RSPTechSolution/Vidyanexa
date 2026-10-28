"""Platform administration: plans, leads, and assigning plans to schools. Super admin only."""
import uuid

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core import pricing
from app.core.deps import DB, CurrentUser, require_super_admin
from app.core.errors import BadRequest, NotFound
from app.core.permissions import MODULES, PREVIEW_MODULES
from app.models import Lead, Plan
from app.schemas.billing import AssignPlanRequest, LeadOut, LeadUpdate, PlanOut, PlanUpdate
from app.schemas.common import ApiResponse, PageMeta, PageParams, ok
from app.schemas.school import SchoolOut
from app.services import audit_service, billing_service, school_service
from app.services.platform_ops_service import PlatformSettings

router = APIRouter()


@router.get("/plans", response_model=ApiResponse[list[PlanOut]])
async def list_plans(db: DB, include_custom: bool = False, _: CurrentUser = require_super_admin()):
    stmt = select(Plan).order_by(Plan.is_custom, Plan.sort_order, Plan.created_at)
    if not include_custom:
        stmt = stmt.where(Plan.is_custom.is_(False))
    return ok([PlanOut.model_validate(p) for p in (await db.scalars(stmt)).all()])


@router.patch("/plans/{plan_id}", response_model=ApiResponse[PlanOut])
async def update_plan(plan_id: uuid.UUID, body: PlanUpdate, db: DB, current: CurrentUser = require_super_admin()):
    plan = await db.get(Plan, plan_id)
    if not plan:
        raise NotFound("Plan not found")
    changes = body.model_dump(exclude_unset=True)
    if "modules" in changes:
        unknown = set(changes["modules"]) - set(MODULES)
        if unknown:
            raise BadRequest(f"Unknown modules: {', '.join(sorted(unknown))}")
        changes["modules"] = [m for m in MODULES if m in set(changes["modules"]) | set(pricing.CORE_MODULES)]
    if changes.pop("unlimited_students", False):
        changes["max_students"] = None
    if changes.pop("unlimited_staff", False):
        changes["max_staff"] = None
    for field, value in changes.items():
        setattr(plan, field, value)
    await audit_service.record(db, "platform.plan_update", school_id=None, user_id=current.id,
                               entity_type="plan", entity_id=plan.code, meta={"fields": sorted(changes)})
    await db.flush()
    return ok(PlanOut.model_validate(plan))


@router.get("/leads", response_model=ApiResponse[list[LeadOut]])
async def list_leads(db: DB, page: PageParams = Depends(), status: str | None = Query(None, max_length=20),
                     kind: str | None = Query(None, max_length=20), _: CurrentUser = require_super_admin()):
    rows, total = await billing_service.list_leads(db, status=status, kind=kind, page=page)
    return ok([LeadOut.model_validate(r) for r in rows], PageMeta(total=total, page=page.page, page_size=page.page_size))


@router.patch("/leads/{lead_id}", response_model=ApiResponse[LeadOut])
async def update_lead(lead_id: uuid.UUID, body: LeadUpdate, db: DB, _: CurrentUser = require_super_admin()):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise NotFound("Lead not found")
    lead.status = body.status
    await db.flush()
    return ok(LeadOut.model_validate(lead))


@router.put("/schools/{school_id}/plan", response_model=ApiResponse[SchoolOut])
async def assign_plan(school_id: uuid.UUID, body: AssignPlanRequest, db: DB, current: CurrentUser = require_super_admin()):
    school = await school_service.get_school(db, school_id)
    if body.plan_code == "custom":
        try:
            q = pricing.quote(body.custom_modules or [], body.custom_students or 0)
        except ValueError as e:
            raise BadRequest(str(e), code="INVALID_CUSTOM_PLAN")
        plan = await billing_service.create_custom_plan(db, q, school.slug)
    else:
        plan = await billing_service.plan_by_code(db, body.plan_code, public_only=False)
    await billing_service.apply_plan(db, school, plan, cycle=body.billing_cycle, status=body.status, actor_id=current.id)
    return ok(SchoolOut.model_validate(school))


class PreviewModules(BaseModel):
    modules: list[str] = Field(default_factory=list, max_length=20)


@router.get("/preview-modules", response_model=ApiResponse[list[dict]])
async def preview_modules(_: CurrentUser = require_super_admin()):
    """Modules not launched yet, which can be opened to a school for testing."""
    return ok([{"module": k, "label": MODULES[k]["label"]} for k in MODULES if k in PREVIEW_MODULES])


@router.put("/schools/{school_id}/preview-modules", response_model=ApiResponse[SchoolOut])
async def set_preview_modules(school_id: uuid.UUID, body: PreviewModules, db: DB, current: CurrentUser = require_super_admin()):
    school = await school_service.get_school(db, school_id)
    await school_service.set_preview_modules(db, school, body.modules, actor_id=current.id)
    return ok(SchoolOut.model_validate(school))


# ---- operations: health, backups, platform settings -------------------------------------------

@router.get("/health", response_model=ApiResponse[dict])
async def system_health(request: Request, db: DB, _: CurrentUser = require_super_admin()):
    from app.services import platform_ops_service
    return ok(await platform_ops_service.health(db, getattr(request.app.state, "started_at", None)))


@router.get("/backups", response_model=ApiResponse[list[dict]])
async def backups(_: CurrentUser = require_super_admin()):
    from app.services import backup_service
    return ok(backup_service.list_backups())


@router.post("/backups", response_model=ApiResponse[dict], status_code=201)
async def make_backup(db: DB, current: CurrentUser = require_super_admin()):
    from app.services import backup_service
    m = await backup_service.create_backup("manual")
    await audit_service.record(db, "platform.backup", school_id=None, user_id=current.user.id, meta={"name": m["name"], "rows": m["row_total"]})
    return ok(m)


@router.get("/backups/{name}")
async def download_backup(name: str, db: DB, current: CurrentUser = require_super_admin()):
    from fastapi.responses import FileResponse

    from app.services import backup_service
    p = backup_service.path_of(name)
    if not p:
        raise NotFound("Backup not found")
    await audit_service.record(db, "platform.backup_download", school_id=None, user_id=current.user.id, meta={"name": name})
    return FileResponse(p, media_type="application/zip", filename=name)


@router.delete("/backups/{name}", response_model=ApiResponse[dict])
async def delete_backup(name: str, db: DB, current: CurrentUser = require_super_admin()):
    from app.services import backup_service
    p = backup_service.path_of(name)
    if not p:
        raise NotFound("Backup not found")
    p.unlink()
    await audit_service.record(db, "platform.backup_delete", school_id=None, user_id=current.user.id, meta={"name": name})
    return ok({"message": "Backup deleted"})


@router.get("/settings", response_model=ApiResponse[dict])
async def platform_settings(db: DB, _: CurrentUser = require_super_admin()):
    from app.services import platform_ops_service
    return ok((await platform_ops_service.get_settings(db)).model_dump(mode="json"))


@router.put("/settings", response_model=ApiResponse[dict])
async def save_platform_settings(body: PlatformSettings, db: DB, current: CurrentUser = require_super_admin()):
    from app.services import platform_ops_service
    saved = await platform_ops_service.save_settings(db, body)
    await audit_service.record(db, "platform.settings", school_id=None, user_id=current.user.id, meta={"banner": bool(body.banner.text)})
    return ok(saved.model_dump(mode="json"))

