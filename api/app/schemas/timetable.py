import uuid
from datetime import time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Day = Annotated[int, Field(ge=1, le=6)]  # 1 = Monday .. 6 = Saturday
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
COLORS = ("blue", "green", "amber", "rose", "violet", "teal", "orange", "sky", "lime", "pink", "slate", "indigo")
Color = Literal["blue", "green", "amber", "rose", "violet", "teal", "orange", "sky", "lime", "pink", "slate", "indigo"]


# ---- subjects -------------------------------------------------------------------------------

class SubjectCreate(BaseModel):
    name: Name
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    color: Color = "blue"


class SubjectUpdate(BaseModel):
    name: Name | None = None
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    color: Color | None = None


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    code: str | None
    color: str
    teacher_count: int = 0
    periods_per_week: int = 0


# ---- bell schedule --------------------------------------------------------------------------

class PeriodIn(BaseModel):
    id: uuid.UUID | None = None  # keep the id to preserve the timetable in that slot
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    start_time: time
    end_time: time
    is_break: bool = False

    @model_validator(mode="after")
    def _order(self):
        if self.end_time <= self.start_time:
            raise ValueError("End time must be after the start time")
        return self


class PeriodsReplace(BaseModel):
    periods: list[PeriodIn] = Field(min_length=1, max_length=16)


class PeriodOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    start_time: time
    end_time: time
    sort_order: int
    is_break: bool


# ---- teachers -------------------------------------------------------------------------------

class Slot(BaseModel):
    day: Day
    period_id: uuid.UUID


class TeacherSubjectsSet(BaseModel):
    subject_ids: list[uuid.UUID] = Field(max_length=30)


class UnavailabilitySet(BaseModel):
    slots: list[Slot] = Field(max_length=100)


class TeacherOut(BaseModel):
    id: uuid.UUID
    full_name: str
    designation: str | None
    employee_id: str | None
    subject_ids: list[uuid.UUID]
    periods_per_week: int
    unavailable: list[Slot]


class AvailableTeacher(BaseModel):
    id: uuid.UUID
    full_name: str
    status: Literal["free", "busy", "unavailable", "current"]
    busy_with: str | None = None
    qualified: bool
    periods_per_week: int
    periods_that_day: int


# ---- timetable ------------------------------------------------------------------------------

class SlotSet(BaseModel):
    section_id: uuid.UUID
    day: Day
    period_id: uuid.UUID
    subject_id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    room: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None


class EntryOut(BaseModel):
    id: uuid.UUID
    day: int
    period_id: uuid.UUID
    section_id: uuid.UUID
    section_label: str
    subject_id: uuid.UUID
    subject_name: str
    subject_color: str
    teacher_id: uuid.UUID | None
    teacher_name: str | None
    room: str | None


class TimetableView(BaseModel):
    """One weekly grid: a section's, or a teacher's."""
    title: str
    subtitle: str | None = None
    kind: Literal["section", "teacher"]
    owner_id: uuid.UUID
    student_id: uuid.UUID | None = None  # a parent's view of one child's week: which child (for the app's child switcher)
    periods: list[PeriodOut]
    entries: list[EntryOut]


class CopyTimetable(BaseModel):
    source_section_id: uuid.UUID
    include_teachers: bool = False
