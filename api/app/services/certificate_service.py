"""Certificates (transfer, bonafide, character) and student ID cards."""
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFound
from app.core.permissions import has_permission
from app.models import (
    BookIssue, Certificate, FeeInvoice, Hostel, HostelAllocation, HostelRoom, Route, School, SchoolClass, Section, Student,
    StudentGuardian, StoredFile, TransportAssignment, User,
)
from app.schemas.academics_extra import CertificateIn, CertificateOut, Clearance, Due, IdCardsRequest
from app.services import audit_service, pdf_service, storage_service
from app.services.family_service import own_students, school_today

PREFIX = {"transfer": "TC", "bonafide": "BC", "character": "CC"}
TITLES = {"transfer": "Transfer Certificate", "bonafide": "Bonafide Certificate", "character": "Character Certificate"}


async def _student(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID) -> Student:
    s = await db.scalar(select(Student).where(Student.id == student_id, Student.school_id == school_id))
    if not s:
        raise NotFound("Student not found")
    return s


async def _class_section(db: AsyncSession, s: Student) -> str:
    row = (await db.execute(select(SchoolClass.name, Section.name).join(Section, Section.class_id == SchoolClass.id)
                            .where(Section.id == s.section_id))).first()
    return f"{row[0]} – {row[1]}" if row else ""


async def _out(db: AsyncSession, c: Certificate, s: Student | None = None) -> CertificateOut:
    s = s or await db.get(Student, c.student_id)
    by = await db.scalar(select(User.full_name).where(User.id == c.issued_by)) if c.issued_by else None
    return CertificateOut(id=c.id, student_id=s.id, student_name=f"{s.first_name} {s.last_name}", admission_no=s.admission_no,
                          class_section=await _class_section(db, s), kind=c.kind, serial_no=c.serial_no, issued_on=c.issued_on,
                          details=c.details or {}, issued_by=by, cancelled=c.cancelled_at is not None)


def _inr(v) -> str:
    return f"₹{v:,.0f}"


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


async def clearance(db: AsyncSession, user: User, student_id: uuid.UUID) -> Clearance:
    """What the student still owes or holds: unpaid fees, library books and fines, a hostel bed, a bus seat."""
    from app.services.campus_service import _fine, library_settings
    from app.services.fee_service import balance

    s = await _student(db, user.school_id, student_id)
    today = await school_today(db, user.school_id)
    dues: list[Due] = []

    invoices = (await db.scalars(select(FeeInvoice).where(FeeInvoice.student_id == s.id, FeeInvoice.status.in_(["unpaid", "partial"])))).all()
    unpaid = [i for i in invoices if balance(i) > 0]
    if unpaid:
        dues.append(Due(area="fees", label="Fees", detail=f"{_inr(sum(balance(i) for i in unpaid))} unpaid on {_plural(len(unpaid), 'invoice')}"))

    issues = (await db.scalars(select(BookIssue).where(BookIssue.student_id == s.id, BookIssue.fine_paid.is_(False)))).all()
    out = [i for i in issues if not i.returned_on]
    rules = await library_settings(db, user.school_id)
    fines = sum((_fine(i, today, rules)[1] for i in issues), 0)
    if out or fines > 0:
        parts = [f"{_plural(len(out), 'book')} not returned"] if out else []
        if fines > 0:
            parts.append(f"{_inr(fines)} fine unpaid")
        dues.append(Due(area="library", label="Library", detail=" · ".join(parts)))

    bed = (await db.execute(select(Hostel.name, HostelRoom.number).join(HostelRoom, HostelRoom.hostel_id == Hostel.id)
                            .join(HostelAllocation, HostelAllocation.room_id == HostelRoom.id)
                            .where(HostelAllocation.student_id == s.id, HostelAllocation.left_on.is_(None)))).first()
    if bed:
        dues.append(Due(area="hostel", label="Hostel", detail=f"Still has a bed: {bed[0]}, room {bed[1]}"))

    route = await db.scalar(select(Route.name).join(TransportAssignment, TransportAssignment.route_id == Route.id)
                            .where(TransportAssignment.student_id == s.id))
    if route:
        dues.append(Due(area="transport", label="Transport", detail=f"Still on the bus: {route}"))
    return Clearance(student_id=s.id, clear=not dues, dues=dues)


async def mark_left(db: AsyncSession, user: User, s: Student) -> None:
    """The student leaves: inactive (the seat is free, the family's app no longer shows them), the hostel bed and bus
    seat given up."""
    today = await school_today(db, user.school_id)
    s.status = "inactive"
    for a in (await db.scalars(select(HostelAllocation).where(HostelAllocation.student_id == s.id, HostelAllocation.left_on.is_(None)))).all():
        a.left_on = today
    for t in (await db.scalars(select(TransportAssignment).where(TransportAssignment.student_id == s.id))).all():
        await db.delete(t)
    await db.flush()
    await audit_service.record(db, "student.left", school_id=user.school_id, user_id=user.id, entity_type="student", entity_id=s.id,
                               meta={"name": f"{s.first_name} {s.last_name}"})


async def mark_left_after(db: AsyncSession, user: User, cert_id: uuid.UUID) -> CertificateOut:
    """Asked after a transfer certificate is issued: mark its student as left."""
    c = await _get(db, user, cert_id)
    if c.kind != "transfer" or c.cancelled_at:
        raise AppError("Only a valid transfer certificate marks a student as left", code="NOT_A_TC", status_code=409)
    s = await db.get(Student, c.student_id)
    if s.status == "active":
        await mark_left(db, user, s)
    return await _out(db, c, s)


async def issue(db: AsyncSession, user: User, data: CertificateIn) -> CertificateOut:
    s = await _student(db, user.school_id, data.student_id)
    today = await school_today(db, user.school_id)
    if data.kind == "transfer":
        existing = await db.scalar(select(Certificate.serial_no).where(
            Certificate.student_id == s.id, Certificate.kind == "transfer", Certificate.cancelled_at.is_(None)))
        if existing:
            raise AppError(f"A transfer certificate ({existing}) was already issued. Cancel it first to issue a new one.",
                           code="TC_EXISTS", status_code=409)
    # Every certificate checks what the student still owes first; the office can go ahead knowingly.
    check = await clearance(db, user, s.id)
    if not check.clear and not data.ignore_dues:
        raise AppError("This student still has dues: " + "; ".join(f"{d.label}: {d.detail}" for d in check.dues),
                       code="DUES_PENDING", status_code=409, details={"dues": [d.model_dump() for d in check.dues]})
    year = today.year if today.month >= 4 else today.year - 1
    prefix = f"{PREFIX[data.kind]}/{year}-{str(year + 1)[2:]}/"
    n = await db.scalar(select(func.count()).select_from(Certificate).where(
        Certificate.school_id == user.school_id, Certificate.serial_no.like(f"{prefix}%"))) or 0
    c = Certificate(school_id=user.school_id, student_id=s.id, kind=data.kind, serial_no=f"{prefix}{n + 1:04d}", issued_on=today,
                    details=data.details(), issued_by=user.id)
    db.add(c)
    await db.flush()
    await audit_service.record(db, "certificate.issue", school_id=user.school_id, user_id=user.id, entity_type="student", entity_id=s.id,
                               meta={"kind": data.kind, "serial_no": c.serial_no, "left": data.mark_left,
                                     "dues_ignored": [d.label for d in check.dues]})
    if data.kind == "transfer" and data.mark_left and s.status == "active":
        await mark_left(db, user, s)
    return await _out(db, c, s)


async def list_certificates(db: AsyncSession, user: User, student_id: uuid.UUID | None, kind: str | None) -> list[CertificateOut]:
    q = select(Certificate).where(Certificate.school_id == user.school_id)
    if student_id:
        q = q.where(Certificate.student_id == student_id)
    if kind:
        q = q.where(Certificate.kind == kind)
    rows = (await db.scalars(q.order_by(Certificate.created_at.desc()).limit(200))).all()
    return [await _out(db, c) for c in rows]


async def _get(db: AsyncSession, user: User, cert_id: uuid.UUID) -> Certificate:
    c = await db.scalar(select(Certificate).where(Certificate.id == cert_id, Certificate.school_id == user.school_id))
    if not c:
        raise NotFound("Certificate not found")
    if not has_permission(user.role, "certificates.manage"):  # families may open their own child's certificates
        if c.student_id not in {k.id for k in await own_students(db, user)} or c.cancelled_at:
            raise NotFound("Certificate not found")
    return c


async def cancel(db: AsyncSession, user: User, cert_id: uuid.UUID) -> None:
    c = await _get(db, user, cert_id)
    if c.cancelled_at:
        return
    c.cancelled_at = datetime.now(UTC)
    await audit_service.record(db, "certificate.cancel", school_id=user.school_id, user_id=user.id, entity_type="student",
                               entity_id=c.student_id, meta={"serial_no": c.serial_no})


async def _parents(db: AsyncSession, student_id: uuid.UUID) -> dict[str, str]:
    rows = (await db.execute(select(StudentGuardian.relationship, User.full_name, User.phone).join(User, User.id == StudentGuardian.user_id)
                             .where(StudentGuardian.student_id == student_id).order_by(StudentGuardian.is_primary.desc()))).all()
    out: dict[str, str] = {}
    for rel, name, phone in rows:
        out.setdefault(rel, name)
        if phone:
            out.setdefault("phone", phone)
    return out


async def certificate_pdf(db: AsyncSession, user: User, cert_id: uuid.UUID) -> tuple[bytes, str]:
    c = await _get(db, user, cert_id)
    s = await db.get(Student, c.student_id)
    school = await db.get(School, user.school_id)
    data = pdf_service.CertificateData(
        title=TITLES[c.kind], kind=c.kind, serial_no=c.serial_no, issued_on=c.issued_on, school_name=school.name,
        school_address=", ".join(x for x in (school.address, school.city, school.state) if x) or None, school_phone=school.phone,
        student_name=f"{s.first_name} {s.last_name}", gender=s.gender, date_of_birth=s.date_of_birth, admission_no=s.admission_no,
        admission_date=s.admission_date, class_section=await _class_section(db, s), parents=await _parents(db, s.id),
        details=c.details or {}, cancelled=c.cancelled_at is not None)
    return pdf_service.certificate(data), f"{c.serial_no.replace('/', '-')}.pdf"


async def id_cards_pdf(db: AsyncSession, user: User, data: IdCardsRequest) -> bytes:
    q = select(Student).where(Student.school_id == user.school_id, Student.status == "active")
    if data.student_ids:
        q = q.where(Student.id.in_(data.student_ids))
    else:
        q = q.where(Student.section_id == data.section_id)
    students = (await db.scalars(q.order_by(Student.roll_no.nulls_last(), Student.first_name))).all()
    if not students:
        raise NotFound("No active students to print")
    school = await db.get(School, user.school_id)
    today = await school_today(db, user.school_id)
    valid = data.valid_until or today.replace(year=today.year + 1 if today.month >= 4 else today.year, month=3, day=31)
    photos = {f.owner_id: f for f in (await db.scalars(select(StoredFile).where(
        StoredFile.purpose == "student_photo", StoredFile.owner_id.in_([s.id for s in students])))).all()}
    cards = []
    for s in students:
        photo = None
        if s.id in photos:
            try:
                photo = await storage_service.read_bytes(photos[s.id])
            except NotFound:
                photo = None
        parents = await _parents(db, s.id)
        cards.append(pdf_service.IdCard(name=f"{s.first_name} {s.last_name}", class_section=await _class_section(db, s),
                                        admission_no=s.admission_no, date_of_birth=s.date_of_birth, blood_group=s.blood_group,
                                        parent=parents.get("father") or parents.get("mother") or parents.get("guardian"),
                                        phone=parents.get("phone"), address=s.address, photo=photo))
    await audit_service.record(db, "students.id_cards", school_id=user.school_id, user_id=user.id, entity_type="section",
                               entity_id=data.section_id, meta={"count": len(cards)})
    return pdf_service.id_cards(school.name, school.phone, valid, cards)
