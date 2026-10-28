import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, Forbidden, NotFound
from app.core.deps import available_modules
from app.core.permissions import MODULES, PREVIEW_MODULES, Role
from app.core.security import hash_password
from app.models import School, SchoolModule, User
from app.schemas.common import PageMeta, PageParams
from app.schemas.school import ModuleOut, SchoolCreate, SchoolUpdate
from app.services import audit_service, billing_service


async def get_school(db: AsyncSession, school_id: uuid.UUID) -> School:
    school = await db.get(School, school_id)
    if not school:
        raise NotFound("School not found")
    return school


async def update_school(db: AsyncSession, school: School, data: SchoolUpdate, *, actor_id: uuid.UUID) -> School:
    changes = data.model_dump(exclude_unset=True)
    if "settings" in changes:
        changes["settings"] = {**(school.settings or {}), **(changes["settings"] or {})}
    for field, value in changes.items():
        setattr(school, field, value)
    await audit_service.record(db, "school.update", school_id=school.id, user_id=actor_id,
                               entity_type="school", entity_id=school.id, meta={"fields": sorted(changes)})
    await db.flush()
    return school


async def list_modules(db: AsyncSession, school_id: uuid.UUID) -> list[ModuleOut]:
    school = await get_school(db, school_id)
    rows = await db.scalars(select(SchoolModule).where(SchoolModule.school_id == school_id))
    switched_on = {m.module: m.is_enabled for m in rows.all()}
    in_plan = available_modules(school)
    plans = await billing_service.public_plans(db)
    out = []
    for key, meta in MODULES.items():
        if key in PREVIEW_MODULES and key not in in_plan:
            continue  # not launched yet: only schools the platform has opened it to see it
        upgrade = None if key in in_plan else billing_service.cheapest_plan_with(plans, key)
        out.append(ModuleOut(module=key, label=meta["label"], in_plan=key in in_plan,
                             is_enabled=key in in_plan and switched_on.get(key, False),
                             upgrade_plan=upgrade.name if upgrade else None))
    return out


async def set_module(db: AsyncSession, school_id: uuid.UUID, module: str, enabled: bool, *, actor_id: uuid.UUID) -> ModuleOut:
    school = await get_school(db, school_id)
    if module not in MODULES or (module in PREVIEW_MODULES and module not in available_modules(school)):
        raise NotFound(f"Unknown module: {module}")
    if enabled and module not in available_modules(school):
        raise Forbidden(f"{MODULES[module]['label']} isn't included in your {school.plan.name} plan. Upgrade to use it.",
                        code="PLAN_UPGRADE_REQUIRED", details={"module": module})
    row = await db.scalar(select(SchoolModule).where(SchoolModule.school_id == school_id, SchoolModule.module == module))
    if row:
        row.is_enabled = enabled
    else:
        db.add(SchoolModule(school_id=school_id, module=module, is_enabled=enabled))
    await audit_service.record(db, "school.module_toggle", school_id=school_id, user_id=actor_id,
                               entity_type="module", entity_id=module, meta={"enabled": enabled})
    await db.flush()
    return ModuleOut(module=module, label=MODULES[module]["label"], is_enabled=enabled,
                     in_plan=module in available_modules(school))


async def set_preview_modules(db: AsyncSession, school: School, modules: list[str], *, actor_id: uuid.UUID) -> list[str]:
    """Platform owner only: open preview modules to one school (to test them), switched on straight away."""
    chosen = sorted(set(modules) & PREVIEW_MODULES)
    school.settings = {**(school.settings or {}), "preview_modules": chosen}
    for module in chosen:
        row = await db.scalar(select(SchoolModule).where(SchoolModule.school_id == school.id, SchoolModule.module == module))
        if row:
            row.is_enabled = True
        else:
            db.add(SchoolModule(school_id=school.id, module=module, is_enabled=True))
    await audit_service.record(db, "school.preview_modules", school_id=school.id, user_id=actor_id,
                               entity_type="school", entity_id=school.id, meta={"modules": chosen})
    await db.flush()
    return chosen


async def list_schools(db: AsyncSession, page: PageParams, search: str | None,
                       is_active: bool | None = None) -> tuple[list[School], PageMeta]:
    stmt = select(School)
    if is_active is not None:
        stmt = stmt.where(School.is_active.is_(is_active))
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(func.lower(School.name).like(like), School.slug.like(like)))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await db.scalars(stmt.order_by(School.created_at.desc()).offset(page.offset).limit(page.page_size))
    return list(rows.all()), PageMeta(total=total or 0, page=page.page, page_size=page.page_size)


async def create_school(db: AsyncSession, data: SchoolCreate, *, actor_id: uuid.UUID) -> School:
    """School + its first admin + default modules, all in the caller's transaction."""
    if await db.scalar(select(School.id).where(School.slug == data.slug)):
        raise Conflict("That school ID is already taken", code="SLUG_TAKEN")
    from app.services.account_service import ensure_email_free
    await ensure_email_free(db, data.admin_email, school_id=None, field="admin_email")
    plan = await billing_service.plan_by_code(db, data.plan_code, public_only=False)
    school = School(name=data.name, slug=data.slug, timezone=data.timezone,
                    currency=data.currency.upper(), language=data.language,
                    plan=plan, subscription_status="active", billing_cycle="yearly")
    db.add(school)
    await db.flush()
    db.add(User(school_id=school.id, email=data.admin_email.lower(), full_name=data.admin_full_name,
                password_hash=hash_password(data.admin_password), role=Role.SCHOOL_ADMIN,
                must_change_password=True))
    for slug in plan.modules:
        db.add(SchoolModule(school_id=school.id, module=slug, is_enabled=True))
    await audit_service.record(db, "school.create", school_id=school.id, user_id=actor_id,
                               entity_type="school", entity_id=school.id)
    await db.flush()
    return school
