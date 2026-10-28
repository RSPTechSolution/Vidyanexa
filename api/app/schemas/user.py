import uuid
from datetime import datetime

from typing import Annotated, Any

from typing import Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, RootModel, field_validator

from app.core.permissions import SCHOOL_ROLES
from app.schemas.auth import NewPassword
from app.schemas.common import Schema
from app.schemas.profile import BusDuty, HrSummary, StudentOverview, LibrarySummary, LiveClassRow, PtmRow, RequestRow, TripRow, VisitorRow

_ROLE_VALUES = {r.value for r in SCHOOL_ROLES}


def _role(v: str | None):
    if v is not None and v not in _ROLE_VALUES:
        raise ValueError(f"Role must be one of: {', '.join(sorted(_ROLE_VALUES))}")
    return v


SchoolRole = Annotated[str, AfterValidator(_role)]


class UserOut(Schema):
    id: uuid.UUID
    school_id: uuid.UUID | None
    email: str
    full_name: str
    phone: str | None
    role: str
    employee_id: str | None = None
    designation: str | None = None
    license_no: str | None = None
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    photo_file_id: uuid.UUID | None = None
    created_at: datetime


class ChildLink(BaseModel):
    student_id: uuid.UUID
    relationship: Literal["father", "mother", "guardian"]


def _blank_to_none(v):
    return v.strip() or None if isinstance(v, str) else v


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(None, max_length=20)
    role: SchoolRole
    password: NewPassword
    # Role-specific; see app.core.roles for what each role requires.
    employee_id: str | None = Field(None, max_length=50)
    designation: str | None = Field(None, max_length=100)
    license_no: str | None = Field(None, max_length=50)
    children: list[ChildLink] | None = Field(None, max_length=10)  # parents
    student_id: uuid.UUID | None = None  # students

    @field_validator("phone", "employee_id", "designation", "license_no", mode="before")
    @classmethod
    def _blank(cls, v):
        return _blank_to_none(v)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    phone: str | None = Field(None, max_length=20)
    role: SchoolRole | None = None
    is_active: bool | None = None
    employee_id: str | None = Field(None, max_length=50)
    designation: str | None = Field(None, max_length=100)
    license_no: str | None = Field(None, max_length=50)

    @field_validator("phone", "employee_id", "designation", "license_no", mode="before")
    @classmethod
    def _blank(cls, v):
        return _blank_to_none(v)


class LinkedChild(BaseModel):
    student_id: uuid.UUID
    name: str
    class_section: str
    relationship: str
    admission_no: str | None = None
    attendance_percent: float | None = None  # this month
    fee_due: float | None = None  # None when fees are off
    fee_overdue: bool = False


class SectionRef(BaseModel):
    section_id: uuid.UUID
    label: str
    students: int = 0


class ActivityItem(BaseModel):
    action: str
    entity_type: str | None
    entity_id: str | None
    meta: dict
    created_at: datetime


class UserDetail(UserOut):
    children: list[LinkedChild] = []  # parents
    student_id: uuid.UUID | None = None  # students
    student_name: str | None = None
    student: LinkedChild | None = None  # students: their own record, with attendance and fees
    class_teacher_of: list[SectionRef] = []  # staff
    teaching: list[str] = []  # staff: "Mathematics · Class 5 – A"
    activity: list[ActivityItem] = []  # recent sign-ins and changes, for those who may see the audit log
    # From the other modules, when the school uses them:
    library: LibrarySummary | None = None  # books on loan to a staff member
    hr: HrSummary | None = None  # staff: attendance, leave and pay (for HR and the person themself)
    buses: list[BusDuty] = []  # drivers
    trips: list[TripRow] = []
    live_classes: list[LiveClassRow] = []  # teachers
    lesson_plans_this_week: int = 0
    covers_ahead: int = 0
    visitors: list[VisitorRow] = []  # people who came to meet them
    warden_of: list[str] = []
    requests: list[RequestRow] = []  # parents: their children's leave requests and gate passes
    ptm: list[PtmRow] = []  # parents and teachers: upcoming parent-teacher meetings
    student_overview: StudentOverview | None = None  # students: library, bus, hostel, results, homework...


class AdminSetPassword(BaseModel):
    password: NewPassword


class AuditLogOut(Schema):
    id: uuid.UUID
    user_id: uuid.UUID | None
    user_name: str | None = None
    action: str
    entity_type: str | None
    entity_id: str | None
    meta: dict
    ip_address: str | None
    created_at: datetime


class PreferencesIn(RootModel[dict[str, Any]]):
    """Personal settings to save, by name (e.g. {"dashboard": {"order": [...], "hidden": [...]}})."""

    @field_validator("root")
    @classmethod
    def _small(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > 20 or any(len(k) > 40 for k in v):
            raise ValueError("Too many settings")
        return v


class AccountRequestIn(BaseModel):
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    reason: str = Field(min_length=3, max_length=500)


class AccountRequestDecision(BaseModel):
    approve: bool
    note: str | None = Field(None, max_length=300)


class AccountRequestOut(BaseModel):
    id: uuid.UUID
    status: str
    reason: str
    students: list[str]
    requested_by_name: str
    requested_by_email: str | None
    created_at: datetime
    decided_at: datetime | None
    decision_note: str | None
