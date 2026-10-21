"""Unauthenticated endpoints used by the public website."""
from fastapi import APIRouter, Request

from app.core import pricing, ratelimit
from app.core.config import settings
from app.core.deps import DB, client_ip
from app.core.errors import BadRequest, TooManyRequests
from app.core.permissions import MODULES
from app.schemas.billing import (
    ContactRequest, ModulePrice, PlanBrief, PlanOut, PricingCatalog, QuoteOut, QuoteRequest, SignupOut, SignupRequest,
)
from app.schemas.common import ApiResponse, Message, ok
from app.schemas.academics_extra import PublicEnquiry
from app.services import billing_service, enquiry_service

router = APIRouter()


async def _limit(request: Request, bucket: str, limit: int, window: int) -> None:
    if not await ratelimit.hit(f"rl:{bucket}:{client_ip(request)}", limit, window):
        raise TooManyRequests("Too many requests. Please try again later.", code="RATE_LIMITED")


@router.get("/plans", response_model=ApiResponse[list[PlanOut]])
async def plans(db: DB):
    return ok([PlanOut.model_validate(p) for p in await billing_service.public_plans(db)])


@router.get("/pricing", response_model=ApiResponse[PricingCatalog])
async def pricing_catalog():
    lower, tiers = 0, []
    for upper, rate in pricing.STUDENT_TIERS:
        tiers.append({"from": lower + 1, "to": upper, "per_student": rate})
        lower = upper
    return ok(PricingCatalog(
        gst_rate=pricing.GST_RATE,
        trial_days=pricing.TRIAL_DAYS,
        yearly_months_charged=pricing.YEARLY_MONTHS_CHARGED,
        platform_fee=pricing.PLATFORM_FEE,
        modules=[ModulePrice(module=k, label=v["label"], monthly=pricing.MODULE_PRICES[k], core=k in pricing.CORE_MODULES)
                 for k, v in MODULES.items()],
        student_tiers=tiers,
        min_students=pricing.MIN_STUDENTS,
        max_students=pricing.MAX_SELF_SERVE_STUDENTS,
    ))


@router.post("/quote", response_model=ApiResponse[QuoteOut])
async def quote(body: QuoteRequest):
    try:
        q = pricing.quote(body.modules, body.students)
    except ValueError as e:
        raise BadRequest(str(e), code="INVALID_CUSTOM_PLAN")
    return ok(QuoteOut(**q.__dict__))


@router.post("/signup", response_model=ApiResponse[SignupOut], status_code=201)
async def signup(body: SignupRequest, request: Request, db: DB):
    await _limit(request, "signup", settings.SIGNUP_RATE_LIMIT, 3600)
    school, admin, code = await billing_service.signup(db, body, ip=client_ip(request))
    return ok(SignupOut(school_slug=school.slug, email=admin.email, plan=PlanBrief.model_validate(school.plan),
                        trial_ends_at=school.trial_ends_at, verify_by=["email", "sms"] if admin.phone else ["email"],
                        expires_in=settings.OTP_EXPIRE_MINUTES * 60,
                        debug_code=code if settings.OTP_DEBUG and settings.ENVIRONMENT != "production" else None))


@router.post("/contact", response_model=ApiResponse[Message], status_code=201)
async def contact(body: ContactRequest, request: Request, db: DB):
    await _limit(request, "contact", settings.CONTACT_RATE_LIMIT, 3600)
    quoted = None
    kind = "contact"
    if body.students and body.modules is not None:
        kind = "quote"
        try:
            quoted = pricing.quote(body.modules, body.students).monthly
        except ValueError:
            quoted = None  # e.g. more students than self-serve: still worth a conversation
    await billing_service.create_lead(
        db, kind=kind, ip=client_ip(request), name=body.name, email=body.email.lower(), phone=body.phone,
        school_name=body.school_name, message=body.message, students=body.students,
        modules=body.modules or [], quoted_monthly=quoted,
    )
    return ok(Message(message="Thanks! Our team will get back to you within one business day."))


@router.post("/schools/{slug}/enquiry", response_model=ApiResponse[Message], status_code=201)
async def admission_enquiry(slug: str, body: PublicEnquiry, request: Request, db: DB):
    """Admission enquiry form on a school's own website."""
    await _limit(request, "enquiry", settings.CONTACT_RATE_LIMIT, 3600)
    await enquiry_service.create_public(db, slug, body)
    return ok(Message(message="Thank you! The school office will call you soon."))


@router.get("/schools/{slug}", response_model=ApiResponse[dict])
async def school_card(slug: str, db: DB):
    """What a school's public admission page shows: name, place, logo and the classes it offers."""
    from sqlalchemy import select

    from app.core.database import elevated
    from app.core.errors import NotFound
    from app.models import School, SchoolClass
    async with elevated(db):
        school = await db.scalar(select(School).where(School.slug == slug, School.is_active.is_(True)))
        if not school:
            raise NotFound("School not found")
        classes = (await db.scalars(select(SchoolClass.name).where(SchoolClass.school_id == school.id)
                                    .order_by(SchoolClass.sort_order, SchoolClass.name))).all()
    return ok({"name": school.name, "city": school.city, "phone": school.phone, "email": school.email,
               "logo_url": school.logo_url, "classes": list(classes)})


@router.get("/platform", response_model=ApiResponse[dict])
async def platform(db: DB):
    """Product name, support contacts, and the current announcement banner (shown on every page)."""
    from app.services import platform_ops_service
    return ok(await platform_ops_service.public_settings(db))
