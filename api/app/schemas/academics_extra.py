"""Syllabus, lesson plans, certificates, admission enquiries, promotion, substitutions."""
import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator, model_validator

Day = date  # for fields named "date", which would shadow the type
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]
Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


# ---- syllabus ---------------------------------------------------------------------------------

class TopicIn(BaseModel):
    class_id: uuid.UUID
    subject_id: uuid.UUID
    unit: Short | None = None
    title: Name
    planned_month: Month | None = None


class TopicUpdate(BaseModel):
    unit: Short | None = None
    title: Name | None = None
    planned_month: Month | None = None
    sort_order: int | None = Field(None, ge=0, le=10000)


class TopicsBulk(BaseModel):
    """One topic per line. "Unit name: Topic" puts the topic under that unit."""
    class_id: uuid.UUID
    subject_id: uuid.UUID
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20000)]

    def lines(self) -> list[tuple[str | None, str]]:
        out = []
        for raw in self.text.splitlines():
            line = re.sub(r"^\s*(\d+[.)]|[-*•])\s*", "", raw).strip()
            if not line:
                continue
            unit, sep, title = line.partition(":")
            out.append((unit.strip()[:100], title.strip()[:200]) if sep and title.strip() else (None, line[:200]))
        return out


class TopicOut(BaseModel):
    id: uuid.UUID
    unit: str | None
    title: str
    planned_month: str | None
    sort_order: int
    done_sections: list[uuid.UUID] = []
    completed_on: dict[str, date] = {}  # section_id -> date


class SyllabusView(BaseModel):
    class_id: uuid.UUID
    class_name: str
    subject_id: uuid.UUID
    subject_name: str
    sections: list[dict]  # [{id, name, editable}]
    can_edit_topics: bool
    topics: list[TopicOut]


class ProgressSet(BaseModel):
    topic_id: uuid.UUID
    section_id: uuid.UUID
    done: bool = True
    completed_on: date | None = None


class CoverageRow(BaseModel):
    section_id: uuid.UUID
    section_label: str
    class_id: uuid.UUID
    subject_id: uuid.UUID
    subject_name: str
    subject_color: str
    total: int
    done: int
    percent: float | None
    behind: int  # topics planned for a past month and still not done
    last_topic: str | None


class ChildSyllabus(BaseModel):
    student_id: uuid.UUID
    name: str
    class_section: str
    subjects: list[CoverageRow]


# ---- lesson plans -----------------------------------------------------------------------------

class LessonIn(BaseModel):
    section_id: uuid.UUID
    subject_id: uuid.UUID
    date: Day
    topic_id: uuid.UUID | None = None
    title: Name
    objectives: Text | None = None
    activities: Text | None = None
    resources: Text | None = None


class LessonUpdate(BaseModel):
    date: Day | None = None
    topic_id: uuid.UUID | None = None
    title: Name | None = None
    objectives: Text | None = None
    activities: Text | None = None
    resources: Text | None = None


class LessonOut(BaseModel):
    id: uuid.UUID
    section_id: uuid.UUID
    section_label: str
    subject_id: uuid.UUID
    subject_name: str
    subject_color: str
    topic_id: uuid.UUID | None
    topic_title: str | None
    date: Day
    title: str
    objectives: str | None
    activities: str | None
    resources: str | None
    status: str
    teacher: str | None
    can_edit: bool


# ---- certificates -----------------------------------------------------------------------------

Kind = Literal["transfer", "bonafide", "character"]


class CertificateIn(BaseModel):
    student_id: uuid.UUID
    kind: Kind
    # transfer
    leaving_date: date | None = None
    reason: Short | None = None
    last_class: Short | None = None
    promoted: Literal["yes", "no", "na"] | None = None
    fees_paid_upto: Short | None = None
    conduct: Short | None = None
    remarks: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    mark_left: bool = False  # set the student inactive (they leave with the TC)
    ignore_dues: bool = False  # issue even though the student still owes something (the dues stay on record)
    # bonafide
    purpose: Short | None = None

    @model_validator(mode="after")
    def _required(self):
        if self.kind == "transfer" and not self.leaving_date:
            raise ValueError("leaving_date: Enter the date the student leaves")
        if self.kind == "transfer" and not self.reason:
            raise ValueError("reason: Enter the reason for leaving")
        if self.kind == "bonafide" and not self.purpose:
            raise ValueError("purpose: Say what the certificate is for, e.g. a bank account or passport")
        return self

    def details(self) -> dict:
        keep = {"transfer": ("leaving_date", "reason", "last_class", "promoted", "fees_paid_upto", "conduct", "remarks"),
                "bonafide": ("purpose", "remarks"), "character": ("conduct", "remarks")}[self.kind]
        return {k: (v.isoformat() if isinstance(v, date) else v) for k in keep if (v := getattr(self, k)) not in (None, "")}


class Due(BaseModel):
    area: Literal["fees", "library", "hostel", "transport"]
    label: str  # "Fees"
    detail: str  # "₹3,000 unpaid on 1 invoice"


class Clearance(BaseModel):
    """Everything a student still owes or holds, checked before any certificate is issued."""
    student_id: uuid.UUID
    clear: bool
    dues: list[Due]


class CertificateOut(BaseModel):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    admission_no: str
    class_section: str
    kind: str
    serial_no: str
    issued_on: date
    details: dict
    issued_by: str | None
    cancelled: bool


class IdCardsRequest(BaseModel):
    section_id: uuid.UUID | None = None
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    valid_until: date | None = None

    @model_validator(mode="after")
    def _one(self):
        if not self.section_id and not self.student_ids:
            raise ValueError("Choose a class section or some students")
        return self


# ---- admission enquiries ------------------------------------------------------------------------

Phone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=6, max_length=20, pattern=r"^[+\d][\d\s\-()]{5,19}$")]
Status = Literal["new", "contacted", "visit", "applied", "admitted", "lost"]
Source = Literal["walk_in", "phone", "website", "referral", "other"]


class EnquiryIn(BaseModel):
    student_name: Name
    date_of_birth: date | None = None
    gender: Literal["male", "female", "other"] | None = None
    class_id: uuid.UUID | None = None
    parent_name: Name
    phone: Phone
    email: EmailStr | None = None
    previous_school: Short | None = None
    source: Source = "walk_in"
    follow_up_on: date | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None

    @field_validator("email", mode="before")
    @classmethod
    def _blank(cls, v):
        return v or None


class PublicEnquiry(BaseModel):
    student_name: Name
    class_name: Short | None = None
    parent_name: Name
    phone: Phone
    email: EmailStr | None = None
    message: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None
    website: str | None = Field(None, max_length=200)  # honeypot: people leave it empty, bots fill it

    @field_validator("email", mode="before")
    @classmethod
    def _blank(cls, v):
        return v or None


class EnquiryUpdate(BaseModel):
    student_name: Name | None = None
    date_of_birth: date | None = None
    gender: Literal["male", "female", "other"] | None = None
    class_id: uuid.UUID | None = None
    parent_name: Name | None = None
    phone: Phone | None = None
    email: EmailStr | None = None
    previous_school: Short | None = None
    source: Source | None = None
    status: Status | None = None
    follow_up_on: date | None = None
    assigned_to: uuid.UUID | None = None
    student_id: uuid.UUID | None = None


class EnquiryNote(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class EnquiryOut(BaseModel):
    id: uuid.UUID
    student_name: str
    date_of_birth: date | None
    gender: str | None
    class_id: uuid.UUID | None
    class_name: str | None
    parent_name: str
    phone: str
    email: str | None
    previous_school: str | None
    source: str
    status: str
    follow_up_on: date | None
    assigned_to: uuid.UUID | None
    assigned_name: str | None
    notes: list[dict]
    student_id: uuid.UUID | None
    created_at: datetime
    overdue: bool


class EnquirySummary(BaseModel):
    by_status: dict[str, int]
    due_today: int
    overdue: int
    this_month: int
    admitted_this_month: int
    conversion: float | None  # admitted / (admitted + lost), all time


# ---- promotion --------------------------------------------------------------------------------

Action = Literal["promote", "repeat", "leave", "graduate"]


class PromotionStudent(BaseModel):
    student_id: uuid.UUID
    name: str
    admission_no: str
    roll_no: int | None
    exam: str | None
    percent: float | None
    passed: bool | None
    suggested: Action


class PromotionPreview(BaseModel):
    section_id: uuid.UUID
    section_label: str
    next_class_id: uuid.UUID | None
    next_class_name: str | None
    next_sections: list[dict]  # [{id, name, students, capacity}]
    default_section_id: uuid.UUID | None
    students: list[PromotionStudent]


class PromotionItem(BaseModel):
    student_id: uuid.UUID
    action: Action
    to_section_id: uuid.UUID | None = None


class PromotionRequest(BaseModel):
    section_id: uuid.UUID
    items: list[PromotionItem] = Field(min_length=1, max_length=300)
    reset_roll_numbers: bool = True


class PromotionResult(BaseModel):
    promoted: int
    repeated: int
    left: int
    graduated: int


# ---- substitutions ----------------------------------------------------------------------------

class AbsentIn(BaseModel):
    date: Day
    teacher_id: uuid.UUID


class SubstituteSet(BaseModel):
    substitute_id: uuid.UUID | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None


class SubstitutionOut(BaseModel):
    id: uuid.UUID
    date: Day
    period_id: uuid.UUID
    period_name: str
    start_time: str
    end_time: str
    section_id: uuid.UUID
    section_label: str
    subject_name: str
    subject_color: str
    absent_teacher_id: uuid.UUID | None
    absent_teacher: str | None
    substitute_id: uuid.UUID | None
    substitute: str | None
    note: str | None


class SubstitutionDay(BaseModel):
    date: Day
    absent_teachers: list[dict]  # [{id, full_name, periods, covered}]
    periods: list[SubstitutionOut]
