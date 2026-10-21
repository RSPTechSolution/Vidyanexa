import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin, uuid_pk


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (
        # Email unique per school; separately unique among platform users (school_id IS NULL).
        Index("uq_users_school_email", "school_id", "email", unique=True,
              postgresql_where=text("school_id IS NOT NULL AND deleted_at IS NULL")),
        Index("uq_users_platform_email", "email", unique=True,
              postgresql_where=text("school_id IS NULL AND deleted_at IS NULL")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # NULL only for platform users (super_admin).
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(200))  # stored lower-case
    phone: Mapped[str | None] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(50))
    # Role-specific details (which are required depends on the role; see app.core.roles).
    employee_id: Mapped[str | None] = mapped_column(String(50))
    designation: Mapped[str | None] = mapped_column(String(100))
    license_no: Mapped[str | None] = mapped_column(String(50))
    photo_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id", ondelete="SET NULL", use_alter=True))
    biometric_id: Mapped[str | None] = mapped_column(String(30))  # staff number on the attendance machine
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the person proved they own the email (a code sent there) or the mobile number. A school that signs itself up
    # stays unusable until its first admin is verified; people added by a school are verified on first sign-in.
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Personal settings that follow the person across devices, such as their dashboard layout.
    preferences: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))


class UserSession(Base):
    """One row per signed-in device. Refresh tokens are stored hashed and rotated
    on every use; presenting an already-rotated token revokes the session."""
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    previous_token_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    school_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
