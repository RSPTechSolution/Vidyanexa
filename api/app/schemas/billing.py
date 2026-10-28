import re
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, PlainSerializer, field_validator

from app.schemas.auth import NewPassword
from app.schemas.common import Schema

_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$")
Cycle = Literal["monthly", "yearly"]
Num = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]


class PlanBrief(Schema):
    code: str
    name: str
    is_custom: bool


class PlanOut(Schema):
    id: uuid.UUID
    code: str
    name: str
    tagline: str | None
    price_monthly: int
    price_yearly: int
    max_students: int | None
    max_staff: int | None
    storage_gb: int
    modules: list[str]
    features: list[str]
    is_public: bool
    is_custom: bool
    highlight: bool

    @classmethod
    def for_schools(cls, plan) -> "PlanOut":
        """The plan as schools and the website see it: without modules that are still in preview."""
        from app.core.permissions import PREVIEW_MODULES
        out = cls.model_validate(plan)
        out.modules = [m for m in out.modules if m not in PREVIEW_MODULES]
        return out
    sort_order: int
    is_active: bool


class ModulePrice(BaseModel):
    """A module in the custom-plan builder. Prices aren't published per module: the quote gives the plan's total."""
    module: str
    label: str
    core: bool


class PricingCatalog(BaseModel):
    currency: str = "INR"
    gst_rate: float
    trial_days: int
    yearly_months_charged: int
    platform_fee: int
    modules: list[ModulePrice]
    student_tiers: list[dict]
    min_students: int
    max_students: int


class QuoteRequest(BaseModel):
    modules: list[str] = Field(default_factory=list, max_length=30)
    students: int = Field(ge=1, le=1_000_000)


class QuoteOut(BaseModel):
    modules: list[str]
    students: int
    max_staff: int
    storage_gb: int
    monthly: int
    yearly: int


class SignupRequest(BaseModel):
    school_name: str = Field(min_length=2, max_length=200)
    school_slug: str
    city: str | None = Field(None, max_length=100)
    full_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(None, max_length=20)
    password: NewPassword
    plan_code: str = Field(max_length=80)  # basic | pro | max | custom
    billing_cycle: Cycle = "yearly"
    custom_modules: list[str] | None = Field(None, max_length=30)
    custom_students: int | None = Field(None, ge=1, le=1_000_000)
    accept_terms: bool

    @field_validator("school_slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG.match(v):
            raise ValueError("3–50 characters: lowercase letters, numbers and hyphens")
        return v

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Please accept the terms and privacy policy")
        return v


class SignupOut(BaseModel):
    school_slug: str
    email: str
    plan: PlanBrief
    trial_ends_at: datetime
    # The school opens once the code sent here is entered (POST /auth/login-code; ask again with /auth/login-code/request).
    verify_by: list[str] = ["email"]
    expires_in: int = 600
    debug_code: str | None = None  # local development and automated tests only (OTP_DEBUG)


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(None, max_length=20)
    school_name: str | None = Field(None, max_length=200)
    message: str = Field(min_length=5, max_length=4000)
    students: int | None = Field(None, ge=1, le=1_000_000)
    modules: list[str] | None = Field(None, max_length=30)


class LeadOut(Schema):
    id: uuid.UUID
    kind: str
    status: str
    name: str
    email: str
    phone: str | None
    school_name: str | None
    message: str | None
    students: int | None
    modules: list[str]
    quoted_monthly: int | None
    plan_code: str | None
    created_at: datetime


class LeadUpdate(BaseModel):
    status: Literal["new", "contacted", "closed"]


class UsageOut(BaseModel):
    students: int
    staff: int
    storage_bytes: int = 0  # everything the school has uploaded; the plan's storage_gb is the limit


class SubscriptionOut(BaseModel):
    plan: PlanOut
    status: str
    billing_cycle: str
    trial_ends_at: datetime | None
    trial_days_left: int
    trial_expired: bool
    current_period_end: datetime | None
    can_self_change: bool
    usage: UsageOut
    available_plans: list[PlanOut] = []
    gst_rate: float = 0.18
    online_payment: bool = False  # schools can pay for their plan online
    test_mode: bool = False


class CheckoutRequest(BaseModel):
    plan_code: str = Field(max_length=80)
    billing_cycle: Cycle = "yearly"
    custom_modules: list[str] | None = None
    custom_students: int | None = Field(None, ge=1, le=1_000_000)


class CheckoutOut(BaseModel):
    payment_id: uuid.UUID
    plan_name: str
    billing_cycle: str
    base_amount: Num
    gst_rate: float
    gst_amount: Num
    total: Num
    gateway: str
    test_mode: bool


class ConfirmSubscriptionPayment(BaseModel):
    outcome: Literal["success", "failure"]


class SubscriptionPaymentOut(Schema):
    id: uuid.UUID
    invoice_no: str | None
    plan_name: str
    billing_cycle: str
    base_amount: Num
    gst_rate: float
    gst_amount: Num
    total: Num
    status: str
    created_at: datetime
    paid_at: datetime | None
    period_start: datetime | None
    period_end: datetime | None


class CheckoutResult(BaseModel):
    status: str  # paid | failed
    message: str
    payment: SubscriptionPaymentOut | None = None


class ChangePlanRequest(BaseModel):
    plan_code: str = Field(max_length=80)
    billing_cycle: Cycle = "yearly"
    custom_modules: list[str] | None = None
    custom_students: int | None = Field(None, ge=1, le=1_000_000)
    message: str | None = Field(None, max_length=2000)


class ChangePlanOut(BaseModel):
    changed: bool  # True: applied now (trial). False: sent to the Vidyanexa team as a request.
    message: str
    subscription: SubscriptionOut | None = None


class PlanUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    tagline: str | None = Field(None, max_length=200)
    price_monthly: int | None = Field(None, ge=0, le=10_000_000)
    price_yearly: int | None = Field(None, ge=0, le=100_000_000)
    max_students: int | None = Field(None, ge=1)
    max_staff: int | None = Field(None, ge=1)
    unlimited_students: bool | None = None
    unlimited_staff: bool | None = None
    storage_gb: int | None = Field(None, ge=1, le=100_000)
    modules: list[str] | None = None
    features: list[str] | None = Field(None, max_length=20)
    highlight: bool | None = None
    is_active: bool | None = None


class AssignPlanRequest(BaseModel):
    plan_code: str = Field(max_length=80)  # a preset code, or "custom"
    billing_cycle: Cycle = "yearly"
    status: Literal["trialing", "active", "past_due", "cancelled"] = "active"
    custom_modules: list[str] | None = None
    custom_students: int | None = Field(None, ge=1, le=1_000_000)
