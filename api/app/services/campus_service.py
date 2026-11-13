"""Library (catalogue, issue and return with fines), hostel (rooms and beds), inventory (stock) and assets."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.core.permissions import STAFF_ROLES
from app.models import (
    Asset, Book, BookCopy, BookIssue, Hostel, HostelAllocation, HostelRoom, School, SchoolClass, Section, StockItem, StockMove, Student, User,
)
from app.schemas.campus import (
    AssetIn, AssetOut, BookIn, BookOut, CopyOut, HostelIn, HostelOut, IssueOut, ItemIn, ItemOut, LibrarySettings, LibraryStats, MoveIn, MoveOut,
    Occupant, RoomIn, RoomOut,
)
from app.services import audit_service, notification_service
from app.services.academics_service import field_error
from app.services.family_service import own_students, school_today

ZERO = Decimal(0)


async def _labels(db: AsyncSession, student_ids) -> dict[uuid.UUID, str]:
    rows = (await db.execute(select(Student.id, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Student.class_id)
                             .join(Section, Section.id == Student.section_id).where(Student.id.in_(list(student_ids))))).all()
    return {sid: f"{c} – {s}" for sid, c, s in rows}


# ---- library ----------------------------------------------------------------------------------

async def library_settings(db: AsyncSession, school_id: uuid.UUID) -> LibrarySettings:
    school = await db.get(School, school_id)
    return LibrarySettings(**((school.settings or {}).get("library") or {}))


async def save_library_settings(db: AsyncSession, user: User, data: LibrarySettings) -> LibrarySettings:
    school = await db.get(School, user.school_id)
    school.settings = {**(school.settings or {}), "library": data.model_dump(mode="json")}
    return data


async def _books_out(db: AsyncSession, rows: list[Book], with_copies: bool = False) -> list[BookOut]:
    counts: dict[uuid.UUID, dict[str, int]] = {}
    for bid, status, n in (await db.execute(select(BookCopy.book_id, BookCopy.status, func.count()).where(BookCopy.book_id.in_([b.id for b in rows]))
                                            .group_by(BookCopy.book_id, BookCopy.status))).all():
        counts.setdefault(bid, {})[status] = n
    out = []
    for b in rows:
        c = counts.get(b.id, {})
        o = BookOut(id=b.id, title=b.title, author=b.author, isbn=b.isbn, publisher=b.publisher, category=b.category, rack=b.rack,
                    total=sum(n for s, n in c.items() if s != "withdrawn"), available=c.get("available", 0))
        if with_copies:
            copies = (await db.scalars(select(BookCopy).where(BookCopy.book_id == b.id).order_by(BookCopy.accession_no))).all()
            open_issues = {i.copy_id: i for i in (await db.scalars(select(BookIssue).where(BookIssue.copy_id.in_([x.id for x in copies]),
                                                                                         BookIssue.returned_on.is_(None)))).all()}
            names = await _borrower_names(db, list(open_issues.values()))
            o.copies = [CopyOut(id=x.id, accession_no=x.accession_no, status=x.status,
                                borrower=names.get(open_issues[x.id].id) if x.id in open_issues else None,
                                due_on=open_issues[x.id].due_on if x.id in open_issues else None) for x in copies]
        out.append(o)
    return out


async def search_books(db: AsyncSession, user: User, q: str | None, category: str | None) -> list[BookOut]:
    stmt = select(Book).where(Book.school_id == user.school_id)
    if q:
        like = f"%{q.strip()}%"
        sub = select(BookCopy.book_id).where(BookCopy.school_id == user.school_id, BookCopy.accession_no.ilike(like))
        stmt = stmt.where(or_(Book.title.ilike(like), Book.author.ilike(like), Book.isbn.ilike(like), Book.id.in_(sub)))
    if category:
        stmt = stmt.where(Book.category == category)
    rows = list((await db.scalars(stmt.order_by(Book.title).limit(200))).all())
    return await _books_out(db, rows)


async def _next_accession(db: AsyncSession, school_id: uuid.UUID) -> int:
    rows = (await db.scalars(select(BookCopy.accession_no).where(BookCopy.school_id == school_id, BookCopy.accession_no.op("~")(r"^\d+$")))).all()
    return max((int(x) for x in rows), default=0) + 1


async def save_book(db: AsyncSession, user: User, data: BookIn, bid: uuid.UUID | None = None) -> BookOut:
    fields = data.model_dump(exclude={"copies"})
    if bid:
        b = await db.scalar(select(Book).where(Book.id == bid, Book.school_id == user.school_id))
        if not b:
            raise NotFound("Book not found")
        for k, v in fields.items():
            setattr(b, k, v)
    else:
        b = Book(school_id=user.school_id, **fields)
        db.add(b)
        await db.flush()
    n = await _next_accession(db, user.school_id)
    for i in range(data.copies):
        db.add(BookCopy(school_id=user.school_id, book_id=b.id, accession_no=str(n + i).zfill(5)))
    await db.flush()
    return (await _books_out(db, [b], with_copies=True))[0]


async def book_detail(db: AsyncSession, user: User, bid: uuid.UUID) -> BookOut:
    b = await db.scalar(select(Book).where(Book.id == bid, Book.school_id == user.school_id))
    if not b:
        raise NotFound("Book not found")
    return (await _books_out(db, [b], with_copies=True))[0]


async def _borrower_names(db: AsyncSession, issues: list[BookIssue]) -> dict[uuid.UUID, str]:
    students = dict((await db.execute(select(Student.id, func.concat(Student.first_name, " ", Student.last_name))
                                      .where(Student.id.in_({i.student_id for i in issues if i.student_id})))).all())
    users = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_({i.user_id for i in issues if i.user_id})))).all())
    return {i.id: students.get(i.student_id) or users.get(i.user_id) or "" for i in issues}


def fine_for(days_late: int, rules: LibrarySettings) -> Decimal:
    """The fine for a book `days_late` days past its due date: the first grace days are free, each day after them costs
    the daily fine, up to the per-book cap (if the school set one)."""
    if days_late <= rules.grace_days:
        return ZERO
    fine = rules.fine_per_day * (days_late - rules.grace_days)
    return min(fine, rules.max_fine) if rules.max_fine > 0 else fine


def _fine(i: BookIssue, today: date, rules: LibrarySettings) -> tuple[int, Decimal]:
    """Days late and the fine: fixed when the book came back, still growing while it's out."""
    end = i.returned_on or today
    days = max((end - i.due_on).days, 0)
    return days, (i.fine if i.returned_on else fine_for(days, rules))


async def _issues_out(db: AsyncSession, school_id: uuid.UUID, rows: list[BookIssue]) -> list[IssueOut]:
    if not rows:
        return []
    today = await school_today(db, school_id)
    rules = await library_settings(db, school_id)
    names = await _borrower_names(db, rows)
    labels = await _labels(db, {i.student_id for i in rows if i.student_id})
    copies = {c.id: c for c in (await db.scalars(select(BookCopy).where(BookCopy.id.in_([i.copy_id for i in rows])))).all()}
    titles = dict((await db.execute(select(Book.id, Book.title).where(Book.id.in_({c.book_id for c in copies.values()})))).all())
    out = []
    for i in rows:
        days, fine = _fine(i, today, rules)
        c = copies[i.copy_id]
        out.append(IssueOut(id=i.id, accession_no=c.accession_no, title=titles.get(c.book_id, ""), borrower=names[i.id],
                            borrower_kind="student" if i.student_id else "staff", class_section=labels.get(i.student_id), issued_on=i.issued_on,
                            due_on=i.due_on, returned_on=i.returned_on, overdue_days=days, fine=fine, fine_paid=i.fine_paid))
    return out


async def _borrower(db: AsyncSession, school_id: uuid.UUID, key: str) -> tuple[Student | None, User | None]:
    s = await db.scalar(select(Student).where(Student.school_id == school_id, Student.status == "active", func.lower(Student.admission_no) == key.lower()))
    if s:
        return s, None
    u = await db.scalar(select(User).where(User.school_id == school_id, User.is_active.is_(True), User.role.in_(STAFF_ROLES + ["driver"]),
                                           or_(func.lower(User.email) == key.lower(), func.lower(User.employee_id) == key.lower())))
    if u:
        return None, u
    raise field_error("borrower", "No active student (admission number) or staff member (email or employee ID) matches")


async def issue(db: AsyncSession, user: User, accession_no: str, borrower: str, days: int | None) -> IssueOut:
    copy = await db.scalar(select(BookCopy).where(BookCopy.school_id == user.school_id, BookCopy.accession_no == accession_no))
    if not copy:
        raise field_error("accession_no", "No copy has this accession number")
    if copy.status != "available":
        raise AppError(f"This copy is {copy.status}", code="COPY_UNAVAILABLE", status_code=409)
    s, u = await _borrower(db, user.school_id, borrower)
    rules = await library_settings(db, user.school_id)
    q = select(func.count()).select_from(BookIssue).where(BookIssue.returned_on.is_(None))
    current = await db.scalar(q.where(BookIssue.student_id == s.id) if s else q.where(BookIssue.user_id == u.id)) or 0
    limit = rules.max_books_student if s else rules.max_books_staff
    if current >= limit:
        raise AppError(f"Already has {current} book(s); the limit is {limit}", code="LIMIT_REACHED", status_code=409)
    today = await school_today(db, user.school_id)
    i = BookIssue(school_id=user.school_id, copy_id=copy.id, student_id=s.id if s else None, user_id=u.id if u else None, issued_on=today,
                  due_on=today + timedelta(days=days or rules.loan_days), issued_by=user.id)
    copy.status = "issued"
    db.add(i)
    await db.flush()
    return (await _issues_out(db, user.school_id, [i]))[0]


async def return_book(db: AsyncSession, user: User, accession_no: str, fine_paid: bool, condition: str) -> IssueOut:
    copy = await db.scalar(select(BookCopy).where(BookCopy.school_id == user.school_id, BookCopy.accession_no == accession_no))
    if not copy:
        raise field_error("accession_no", "No copy has this accession number")
    i = await db.scalar(select(BookIssue).where(BookIssue.copy_id == copy.id, BookIssue.returned_on.is_(None)))
    if not i:
        raise AppError("This copy isn't issued", code="NOT_ISSUED", status_code=409)
    today = await school_today(db, user.school_id)
    rules = await library_settings(db, user.school_id)
    _, fine = _fine(i, today, rules)
    i.returned_on, i.fine, i.fine_paid = today, fine, fine_paid or fine == 0
    copy.status = {"ok": "available", "damaged": "damaged", "lost": "lost"}[condition]
    await db.flush()
    return (await _issues_out(db, user.school_id, [i]))[0]


async def issues(db: AsyncSession, user: User, status: str) -> list[IssueOut]:
    q = select(BookIssue).where(BookIssue.school_id == user.school_id)
    today = await school_today(db, user.school_id)
    if status == "open":
        q = q.where(BookIssue.returned_on.is_(None))
    elif status == "overdue":
        q = q.where(BookIssue.returned_on.is_(None), BookIssue.due_on < today)
    elif status == "fines":
        q = q.where(BookIssue.fine > 0, BookIssue.fine_paid.is_(False))
    rows = list((await db.scalars(q.order_by(BookIssue.due_on).limit(500))).all())
    return await _issues_out(db, user.school_id, rows)


async def mark_fine_paid(db: AsyncSession, user: User, issue_id: uuid.UUID) -> IssueOut:
    i = await db.scalar(select(BookIssue).where(BookIssue.id == issue_id, BookIssue.school_id == user.school_id))
    if not i:
        raise NotFound("Issue not found")
    i.fine_paid = True
    await db.flush()
    return (await _issues_out(db, user.school_id, [i]))[0]


async def stats(db: AsyncSession, user: User) -> LibraryStats:
    today = await school_today(db, user.school_id)
    sid = user.school_id
    titles = await db.scalar(select(func.count()).select_from(Book).where(Book.school_id == sid)) or 0
    copies = await db.scalar(select(func.count()).select_from(BookCopy).where(BookCopy.school_id == sid, BookCopy.status != "withdrawn")) or 0
    open_ = list((await db.scalars(select(BookIssue).where(BookIssue.school_id == sid, BookIssue.returned_on.is_(None)))).all())
    rules = await library_settings(db, sid)
    unpaid = await db.scalar(select(func.coalesce(func.sum(BookIssue.fine), 0)).where(BookIssue.school_id == sid, BookIssue.fine_paid.is_(False))) or ZERO
    running = sum((_fine(i, today, rules)[1] for i in open_), ZERO)
    return LibraryStats(titles=titles, copies=copies, issued=len(open_), overdue=sum(1 for i in open_ if i.due_on < today), fines_due=unpaid + running)


async def remind_overdue(db: AsyncSession, user: User) -> int:
    today = await school_today(db, user.school_id)
    rows = list((await db.scalars(select(BookIssue).where(BookIssue.school_id == user.school_id, BookIssue.returned_on.is_(None),
                                                          BookIssue.due_on < today))).all())
    out = await _issues_out(db, user.school_id, rows)
    for i, o in zip(rows, out):
        to = await notification_service.family_of(db, [i.student_id]) if i.student_id else [i.user_id]
        await notification_service.notify(db, to, school_id=user.school_id, kind="library", title=f"Library book overdue: {o.title}",
                                          body=f"Due {o.due_on:%d %b} · {o.overdue_days} day(s) late" + (f" · fine Rs {o.fine:.0f}" if o.fine else ""),
                                          link="/my-library")
    return len(rows)


async def my_books(db: AsyncSession, user: User) -> list[IssueOut]:
    if user.role in ("parent", "student"):
        kids = [k.id for k in await own_students(db, user)]
        q = select(BookIssue).where(BookIssue.student_id.in_(kids or [uuid.uuid4()]))
    else:
        q = select(BookIssue).where(BookIssue.user_id == user.id)
    rows = list((await db.scalars(q.order_by(BookIssue.returned_on.is_(None).desc(), BookIssue.issued_on.desc()).limit(50))).all())
    return await _issues_out(db, user.school_id, rows)


# ---- hostel -----------------------------------------------------------------------------------

async def _hostels_out(db: AsyncSession, rows: list[Hostel], with_rooms: bool = False) -> list[HostelOut]:
    out = []
    for h in rows:
        rooms = list((await db.scalars(select(HostelRoom).where(HostelRoom.hostel_id == h.id).order_by(HostelRoom.floor, HostelRoom.number))).all())
        allocs = list((await db.scalars(select(HostelAllocation).where(HostelAllocation.room_id.in_([r.id for r in rooms]),
                                                                       HostelAllocation.left_on.is_(None)))).all())
        warden = await db.get(User, h.warden_id) if h.warden_id else None
        o = HostelOut(id=h.id, name=h.name, kind=h.kind, warden_id=h.warden_id, warden_name=warden.full_name if warden else None,
                      monthly_fee=h.monthly_fee, address=h.address, rooms=len(rooms), beds=sum(r.capacity for r in rooms), occupied=len(allocs))
        if with_rooms:
            students = {s.id: s for s in (await db.scalars(select(Student).where(Student.id.in_([a.student_id for a in allocs])))).all()}
            labels = await _labels(db, students)
            o.room_list = [RoomOut(id=r.id, number=r.number, floor=r.floor, capacity=r.capacity, occupants=[
                Occupant(allocation_id=a.id, student_id=a.student_id, name=f"{students[a.student_id].first_name} {students[a.student_id].last_name}",
                         class_section=labels.get(a.student_id, ""), from_date=a.from_date) for a in allocs if a.room_id == r.id]) for r in rooms]
        out.append(o)
    return out


async def list_hostels(db: AsyncSession, user: User) -> list[HostelOut]:
    return await _hostels_out(db, list((await db.scalars(select(Hostel).where(Hostel.school_id == user.school_id).order_by(Hostel.name))).all()))


async def _hostel(db: AsyncSession, user: User, hid: uuid.UUID) -> Hostel:
    h = await db.scalar(select(Hostel).where(Hostel.id == hid, Hostel.school_id == user.school_id))
    if not h:
        raise NotFound("Hostel not found")
    return h


async def hostel_detail(db: AsyncSession, user: User, hid: uuid.UUID) -> HostelOut:
    return (await _hostels_out(db, [await _hostel(db, user, hid)], True))[0]


async def save_hostel(db: AsyncSession, user: User, data: HostelIn, hid: uuid.UUID | None = None) -> HostelOut:
    if data.warden_id and not await db.scalar(select(User.id).where(User.id == data.warden_id, User.school_id == user.school_id,
                                                                    User.role.in_(STAFF_ROLES))):
        raise field_error("warden_id", "Choose a staff member")
    if hid:
        h = await _hostel(db, user, hid)
        for k, v in data.model_dump().items():
            setattr(h, k, v)
    else:
        h = Hostel(school_id=user.school_id, **data.model_dump())
        db.add(h)
    await db.flush()
    return (await _hostels_out(db, [h], True))[0]


async def add_room(db: AsyncSession, user: User, hid: uuid.UUID, data: RoomIn) -> HostelOut:
    h = await _hostel(db, user, hid)
    if await db.scalar(select(HostelRoom.id).where(HostelRoom.hostel_id == h.id, HostelRoom.number == data.number)):
        raise field_error("number", "This room number already exists")
    db.add(HostelRoom(school_id=user.school_id, hostel_id=h.id, **data.model_dump()))
    await db.flush()
    return (await _hostels_out(db, [h], True))[0]


async def allocate(db: AsyncSession, user: User, student_id: uuid.UUID, room_id: uuid.UUID, from_date: date | None, note: str | None) -> HostelOut:
    room = await db.scalar(select(HostelRoom).where(HostelRoom.id == room_id, HostelRoom.school_id == user.school_id))
    if not room:
        raise NotFound("Room not found")
    s = await db.scalar(select(Student).where(Student.id == student_id, Student.school_id == user.school_id, Student.status == "active"))
    if not s:
        raise NotFound("Student not found")
    h = await db.get(Hostel, room.hostel_id)
    if (h.kind == "boys" and s.gender == "female") or (h.kind == "girls" and s.gender == "male"):
        raise field_error("student_id", f"{h.name} is a {h.kind}' hostel")
    taken = await db.scalar(select(func.count()).select_from(HostelAllocation).where(HostelAllocation.room_id == room.id, HostelAllocation.left_on.is_(None))) or 0
    if taken >= room.capacity:
        raise AppError(f"Room {room.number} is full", code="ROOM_FULL", status_code=409)
    today = await school_today(db, user.school_id)
    current = await db.scalar(select(HostelAllocation).where(HostelAllocation.student_id == s.id, HostelAllocation.left_on.is_(None)))
    if current:
        current.left_on = today  # moving rooms
    db.add(HostelAllocation(school_id=user.school_id, room_id=room.id, student_id=s.id, from_date=from_date or today, note=note))
    await db.flush()
    return (await _hostels_out(db, [h], True))[0]


async def vacate(db: AsyncSession, user: User, allocation_id: uuid.UUID) -> None:
    a = await db.scalar(select(HostelAllocation).where(HostelAllocation.id == allocation_id, HostelAllocation.school_id == user.school_id))
    if not a or a.left_on:
        raise NotFound("Allocation not found")
    a.left_on = await school_today(db, user.school_id)


async def my_hostel(db: AsyncSession, user: User) -> list[dict]:
    out = []
    for kid in await own_students(db, user):
        row = (await db.execute(select(HostelAllocation, HostelRoom, Hostel).join(HostelRoom, HostelRoom.id == HostelAllocation.room_id)
                                .join(Hostel, Hostel.id == HostelRoom.hostel_id)
                                .where(HostelAllocation.student_id == kid.id, HostelAllocation.left_on.is_(None)))).first()
        if row:
            a, r, h = row
            warden = await db.get(User, h.warden_id) if h.warden_id else None
            out.append({"student_id": str(kid.id), "name": f"{kid.first_name} {kid.last_name}", "hostel": h.name, "room": r.number, "floor": r.floor,
                        "since": a.from_date.isoformat(), "warden": warden.full_name if warden else None, "warden_phone": warden.phone if warden else None})
    return out


# ---- inventory --------------------------------------------------------------------------------

async def _items_out(db: AsyncSession, rows: list[StockItem]) -> list[ItemOut]:
    last = dict((await db.execute(select(StockMove.item_id, func.max(StockMove.at)).where(StockMove.item_id.in_([i.id for i in rows]))
                                  .group_by(StockMove.item_id))).all())
    return [ItemOut(id=i.id, name=i.name, category=i.category, unit=i.unit, quantity=i.quantity, reorder_level=i.reorder_level, location=i.location,
                    low=i.reorder_level > 0 and i.quantity <= i.reorder_level, last_move_at=last.get(i.id)) for i in rows]


async def list_items(db: AsyncSession, user: User, low_only: bool) -> list[ItemOut]:
    rows = list((await db.scalars(select(StockItem).where(StockItem.school_id == user.school_id).order_by(StockItem.category, StockItem.name))).all())
    out = await _items_out(db, rows)
    return [i for i in out if i.low] if low_only else out


async def save_item(db: AsyncSession, user: User, data: ItemIn, iid: uuid.UUID | None = None) -> ItemOut:
    if await db.scalar(select(StockItem.id).where(StockItem.school_id == user.school_id, func.lower(StockItem.name) == data.name.lower(), StockItem.id != iid)):
        raise field_error("name", "An item with this name already exists")
    if iid:
        it = await db.scalar(select(StockItem).where(StockItem.id == iid, StockItem.school_id == user.school_id))
        if not it:
            raise NotFound("Item not found")
        for k, v in data.model_dump().items():
            setattr(it, k, v)
    else:
        it = StockItem(school_id=user.school_id, **data.model_dump())
        db.add(it)
    await db.flush()
    return (await _items_out(db, [it]))[0]


async def move(db: AsyncSession, user: User, iid: uuid.UUID, data: MoveIn) -> ItemOut:
    it = await db.scalar(select(StockItem).where(StockItem.id == iid, StockItem.school_id == user.school_id).with_for_update())
    if not it:
        raise NotFound("Item not found")
    if data.kind == "adjust":
        delta = data.quantity - it.quantity
    elif data.kind == "in":
        delta = data.quantity
    else:
        delta = -data.quantity
        if it.quantity + delta < 0:
            raise AppError(f"Only {it.quantity:g} {it.unit} in stock", code="NOT_ENOUGH_STOCK", status_code=409)
    was_low = it.reorder_level > 0 and it.quantity <= it.reorder_level
    it.quantity += delta
    db.add(StockMove(school_id=user.school_id, item_id=it.id, kind=data.kind, quantity=delta, unit_cost=data.unit_cost, party=data.party,
                     note=data.note, balance_after=it.quantity, by=user.id, at=datetime.now(UTC)))
    await db.flush()
    if not was_low and it.reorder_level > 0 and it.quantity <= it.reorder_level:
        managers = (await db.scalars(select(User.id).where(User.school_id == user.school_id, User.is_active.is_(True),
                                                           User.role.in_(["school_admin", "accountant"])))).all()
        await notification_service.notify(db, managers, school_id=user.school_id, kind="stock", title=f"Low stock: {it.name}",
                                          body=f"{it.quantity:g} {it.unit} left (reorder at {it.reorder_level:g})", link="/inventory")
    return (await _items_out(db, [it]))[0]


async def moves(db: AsyncSession, user: User, iid: uuid.UUID) -> list[MoveOut]:
    rows = (await db.execute(select(StockMove, User.full_name).outerjoin(User, User.id == StockMove.by)
                             .where(StockMove.item_id == iid, StockMove.school_id == user.school_id).order_by(StockMove.at.desc()).limit(200))).all()
    return [MoveOut(id=m.id, kind=m.kind, quantity=m.quantity, unit_cost=m.unit_cost, party=m.party, note=m.note, balance_after=m.balance_after,
                    by=name, at=m.at) for m, name in rows]


# ---- assets -----------------------------------------------------------------------------------

async def _assets_out(db: AsyncSession, school_id: uuid.UUID, rows: list[Asset]) -> list[AssetOut]:
    today = await school_today(db, school_id)
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_({a.assigned_to for a in rows if a.assigned_to})))).all())
    return [AssetOut(id=a.id, tag=a.tag, name=a.name, category=a.category, location=a.location, purchased_on=a.purchased_on, cost=a.cost,
                     vendor=a.vendor, warranty_until=a.warranty_until, warranty_ok=a.warranty_until >= today if a.warranty_until else None,
                     condition=a.condition, assigned_to=a.assigned_to, assigned_name=names.get(a.assigned_to), notes=a.notes) for a in rows]


async def list_assets(db: AsyncSession, user: User, q: str | None, condition: str | None) -> list[AssetOut]:
    stmt = select(Asset).where(Asset.school_id == user.school_id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Asset.name.ilike(like), Asset.tag.ilike(like), Asset.location.ilike(like), Asset.category.ilike(like)))
    if condition:
        stmt = stmt.where(Asset.condition == condition)
    return await _assets_out(db, user.school_id, list((await db.scalars(stmt.order_by(Asset.tag).limit(500))).all()))


async def save_asset(db: AsyncSession, user: User, data: AssetIn, aid: uuid.UUID | None = None) -> AssetOut:
    if data.assigned_to and not await db.scalar(select(User.id).where(User.id == data.assigned_to, User.school_id == user.school_id)):
        raise field_error("assigned_to", "Choose someone from your school")
    tag = data.tag
    if not tag:
        n = await db.scalar(select(func.count()).select_from(Asset).where(Asset.school_id == user.school_id)) or 0
        tag = f"AST-{n + 1:05d}"
    if await db.scalar(select(Asset.id).where(Asset.school_id == user.school_id, Asset.tag == tag, Asset.id != aid)):
        raise field_error("tag", "This tag is already used")
    body = {**data.model_dump(), "tag": tag}
    if aid:
        a = await db.scalar(select(Asset).where(Asset.id == aid, Asset.school_id == user.school_id))
        if not a:
            raise NotFound("Asset not found")
        for k, v in body.items():
            setattr(a, k, v)
    else:
        a = Asset(school_id=user.school_id, **body)
        db.add(a)
    await db.flush()
    await audit_service.record(db, "asset.save", school_id=user.school_id, user_id=user.id, entity_type="asset", entity_id=a.id,
                               meta={"tag": a.tag, "condition": a.condition})
    return (await _assets_out(db, user.school_id, [a]))[0]
