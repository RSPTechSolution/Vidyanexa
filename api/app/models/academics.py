import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TenantMixin, TimestampMixin, uuid_pk


class SchoolClass(Base, TenantMixin, TimestampMixin):
    """A grade, e.g. "Class 5". Named SchoolClass because `class` is reserved."""
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("school_id", "name", name="uq_class_name"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Section(Base, TenantMixin, TimestampMixin):
    __tablename__ = "sections"
    __table_args__ = (
        UniqueConstraint("class_id", "name", name="uq_section_name"),
        # The class teacher is the section's in-charge (attendance, leave, gate passes): one section per teacher.
        Index("uq_section_class_teacher", "class_teacher_id", unique=True, postgresql_where=text("class_teacher_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(20))
    capacity: Mapped[int | None] = mapped_column(Integer)
    class_teacher_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class Student(Base, TenantMixin, TimestampMixin):
    """A student record. Exists with or without a login (user_id)."""
    __tablename__ = "students"
    __table_args__ = (
        UniqueConstraint("school_id", "admission_no", name="uq_student_admission_no"),
        Index("uq_student_user", "user_id", unique=True, postgresql_where=text("user_id IS NOT NULL")),
        Index("uq_student_roll", "section_id", "roll_no", unique=True,
              postgresql_where=text("roll_no IS NOT NULL AND status = 'active'")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    admission_no: Mapped[str] = mapped_column(String(50))
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    gender: Mapped[str] = mapped_column(String(10))  # male | female | other
    date_of_birth: Mapped[date] = mapped_column(Date)
    admission_date: Mapped[date] = mapped_column(Date)
    class_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("classes.id", ondelete="RESTRICT"), index=True)
    section_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sections.id", ondelete="RESTRICT"), index=True)
    roll_no: Mapped[int | None] = mapped_column(Integer)
    blood_group: Mapped[str | None] = mapped_column(String(5))
    address: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active | inactive | alumni
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    photo_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id", ondelete="SET NULL"))
    biometric_id: Mapped[str | None] = mapped_column(String(30))  # the number enrolled on fingerprint/face machines


class StudentGuardian(Base, TenantMixin, TimestampMixin):
    """Links a parent account to a student."""
    __tablename__ = "student_guardians"
    __table_args__ = (UniqueConstraint("student_id", "user_id", name="uq_student_guardian"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    student_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("students.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    relationship: Mapped[str] = mapped_column(String(20))  # father | mother | guardian
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
