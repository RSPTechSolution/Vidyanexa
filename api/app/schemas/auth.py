import uuid
from datetime import datetime

from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.schemas.common import Schema


def _password_rules(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode()) > 72:
        raise ValueError("Password must be at most 72 bytes")
    if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
        raise ValueError("Password must contain letters and numbers")
    return v


NewPassword = Annotated[str, AfterValidator(_password_rules)]


class CodeRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=200)  # email, or mobile number
    school_slug: str | None = Field(None, max_length=100)

    @field_validator("school_slug")
    @classmethod
    def _blank_to_none(cls, v):
        return v.strip().lower() or None if v else None


class CodeLogin(CodeRequest):
    code: str = Field(pattern=r"^\s*\d{6}\s*$")


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)  # matched, not validated: must equal a stored address
    password: str = Field(min_length=1, max_length=200)
    school_slug: str | None = Field(None, max_length=100)

    @field_validator("school_slug")
    @classmethod
    def _blank_to_none(cls, v):
        return v.strip().lower() or None if v else None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class PlanSummary(Schema):
    code: str
    name: str
    is_custom: bool


class SchoolBrief(Schema):
    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None
    timezone: str
    currency: str
    plan: PlanSummary
    subscription_status: str
    trial_ends_at: datetime | None
    brand_color: str | None = None  # from school settings; one of BRAND_COLORS


class MeOut(Schema):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: str
    school_id: uuid.UUID | None
    must_change_password: bool
    last_login_at: datetime | None
    photo_file_id: uuid.UUID | None = None
    school: SchoolBrief | None = None
    modules: list[str] = []
    permissions: list[str] = []


class LoginResponse(BaseModel):
    tokens: TokenPair
    user: MeOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class PasswordResetRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    school_slug: str | None = None


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: NewPassword
