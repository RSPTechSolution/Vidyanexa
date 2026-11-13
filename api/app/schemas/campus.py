"""Library, hostel, inventory and assets."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, PlainSerializer, StringConstraints

Num = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]
S = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Req = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


# ---- library ----------------------------------------------------------------------------------

class BookIn(BaseModel):
    title: Req
    author: S | None = None
    isbn: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    publisher: S | None = None
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    rack: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None
    copies: int = Field(0, ge=0, le=500)  # new copies to add, numbered automatically


class CopyOut(BaseModel):
    id: uuid.UUID
    accession_no: str
    status: str
    borrower: str | None = None
    due_on: date | None = None


class BookOut(BaseModel):
    id: uuid.UUID
    title: str
    author: str | None
    isbn: str | None
    publisher: str | None
    category: str | None
    rack: str | None
    total: int
    available: int
    copies: list[CopyOut] = []


class IssueIn(BaseModel):
    accession_no: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    borrower: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]  # admission no or staff email/employee id
    days: int | None = Field(None, ge=1, le=120)


class ReturnIn(BaseModel):
    accession_no: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    fine_paid: bool = False
    condition: Literal["ok", "damaged", "lost"] = "ok"


class IssueOut(BaseModel):
    id: uuid.UUID
    accession_no: str
    title: str
    borrower: str
    borrower_kind: str  # student | staff
    class_section: str | None
    issued_on: date
    due_on: date
    returned_on: date | None
    overdue_days: int
    fine: Num
    fine_paid: bool


class LibrarySettings(BaseModel):
    """Each school's own library rules (Library → Settings)."""
    loan_days: int = Field(14, ge=1, le=120)
    fine_per_day: Annotated[Decimal, Field(ge=0, le=100, decimal_places=2), PlainSerializer(float, return_type=float)] = Decimal(2)
    grace_days: int = Field(0, ge=0, le=30)  # the first late days are free; only days after them are fined
    max_fine: Annotated[Decimal, Field(ge=0, le=10000, decimal_places=2), PlainSerializer(float, return_type=float)] = Decimal(0)  # per book; 0 = no cap
    max_books_student: int = Field(2, ge=1, le=20)
    max_books_staff: int = Field(5, ge=1, le=50)


class LibraryStats(BaseModel):
    titles: int
    copies: int
    issued: int
    overdue: int
    fines_due: Num


# ---- hostel -----------------------------------------------------------------------------------

class HostelIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
    kind: Literal["boys", "girls", "mixed"]
    warden_id: uuid.UUID | None = None
    monthly_fee: Annotated[Decimal, Field(ge=0, le=1_000_000, decimal_places=2)] = Decimal(0)
    address: S | None = None


class RoomIn(BaseModel):
    number: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
    floor: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    capacity: int = Field(2, ge=1, le=40)


class Occupant(BaseModel):
    allocation_id: uuid.UUID
    student_id: uuid.UUID
    name: str
    class_section: str
    from_date: date


class RoomOut(BaseModel):
    id: uuid.UUID
    number: str
    floor: str | None
    capacity: int
    occupants: list[Occupant]


class HostelOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    warden_id: uuid.UUID | None
    warden_name: str | None
    monthly_fee: Num
    address: str | None
    rooms: int
    beds: int
    occupied: int
    room_list: list[RoomOut] = []


class AllocateIn(BaseModel):
    student_id: uuid.UUID
    room_id: uuid.UUID
    from_date: date | None = None
    note: S | None = None


# ---- inventory and assets ---------------------------------------------------------------------

class ItemIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    unit: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)] = "pcs"
    reorder_level: Annotated[Decimal, Field(ge=0, le=1_000_000)] = Decimal(0)
    location: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None


class ItemOut(BaseModel):
    id: uuid.UUID
    name: str
    category: str | None
    unit: str
    quantity: Num
    reorder_level: Num
    location: str | None
    low: bool
    last_move_at: datetime | None


class MoveIn(BaseModel):
    kind: Literal["in", "out", "adjust"]
    quantity: Annotated[Decimal, Field(gt=0, le=1_000_000, decimal_places=2)]
    unit_cost: Annotated[Decimal, Field(ge=0, le=10_000_000, decimal_places=2)] | None = None
    party: S | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    # For "adjust", `quantity` is the counted stock (the new balance).


class MoveOut(BaseModel):
    id: uuid.UUID
    kind: str
    quantity: Num
    unit_cost: Num | None
    party: str | None
    note: str | None
    balance_after: Num
    by: str | None
    at: datetime


class AssetIn(BaseModel):
    tag: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, min_length=2, max_length=30)] | None = None  # generated if empty
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=150)]
    category: Annotated[str, StringConstraints(strip_whitespace=True, max_length=80)] | None = None
    location: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    purchased_on: date | None = None
    cost: Annotated[Decimal, Field(ge=0, le=100_000_000, decimal_places=2)] | None = None
    vendor: S | None = None
    warranty_until: date | None = None
    condition: Literal["good", "needs_repair", "broken", "disposed"] = "good"
    assigned_to: uuid.UUID | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class AssetOut(BaseModel):
    id: uuid.UUID
    tag: str
    name: str
    category: str | None
    location: str | None
    purchased_on: date | None
    cost: Num | None
    vendor: str | None
    warranty_until: date | None
    warranty_ok: bool | None
    condition: str
    assigned_to: uuid.UUID | None
    assigned_name: str | None
    notes: str | None
