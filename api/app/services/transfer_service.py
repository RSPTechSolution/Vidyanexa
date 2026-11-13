"""CSV import and export: students (with parents), parents, and staff.

Imports reuse the same services as the forms, so every rule (class capacity, unique admission
numbers and emails, plan limits, per-role required details) applies. They are all-or-nothing:
each row runs inside a savepoint to collect its errors, and nothing is kept if any row fails
or if the caller only asked for a check (``dry_run``).
"""
import csv
import io
import secrets
import string
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.permissions import STAFF_ROLES, Role
from app.models import SchoolClass, Section, Student, StudentGuardian, User
from app.schemas.academics import GuardianLink, NewParent, StudentCreate
from app.schemas.user import UserCreate
from app.services import notify, student_service, user_service
from app.services.notify import ROLE_LABELS

MAX_ROWS = 1000

STUDENT_COLUMNS = [
    "admission_no", "first_name", "last_name", "gender", "date_of_birth", "admission_date", "class", "section", "roll_no",
    "blood_group", "address", "father_name", "father_phone", "father_email", "mother_name", "mother_phone", "mother_email",
    "guardian_name", "guardian_phone", "guardian_email",
]
STUDENT_REQUIRED = ["admission_no", "first_name", "last_name", "gender", "date_of_birth", "class", "section"]
STAFF_COLUMNS = ["full_name", "email", "role", "phone", "employee_id", "designation", "license_no"]
STAFF_REQUIRED = ["full_name", "email", "role"]
PARENT_COLUMNS = ["full_name", "email", "phone", "children", "active"]

# For the mapping screen of an import: what each column means, in words.
FIELD_LABELS = {
    "admission_no": "Admission number", "first_name": "First name", "last_name": "Last name", "gender": "Gender",
    "date_of_birth": "Date of birth", "admission_date": "Admission date", "class": "Class", "section": "Section",
    "roll_no": "Roll number", "blood_group": "Blood group", "address": "Address",
    "father_name": "Father's name", "father_phone": "Father's phone", "father_email": "Father's email",
    "mother_name": "Mother's name", "mother_phone": "Mother's phone", "mother_email": "Mother's email",
    "guardian_name": "Guardian's name", "guardian_phone": "Guardian's phone", "guardian_email": "Guardian's email",
    "full_name": "Full name", "email": "Email", "role": "Role", "phone": "Phone", "employee_id": "Employee ID",
    "designation": "Designation", "license_no": "Driving licence number",
}
STUDENT_HINTS = {
    "gender": "male, female or other", "date_of_birth": "e.g. 2015-04-21 or 21/04/2015", "class": "As in Classes, e.g. Class 5",
    "section": "e.g. A", "father_email": "Creates or links the father's app login",
}
STAFF_HINTS = {"role": "teacher, accountant, receptionist, librarian, driver…", "license_no": "Drivers only"}


class RowError(BaseModel):
    row: int  # 1-based data row (row 2 in a spreadsheet, after the header)
    column: str | None
    message: str


class Credential(BaseModel):
    name: str
    email: str
    role: str
    password: str


class ImportResult(BaseModel):
    rows: int
    ok: bool
    dry_run: bool
    errors: list[RowError]
    created: int = 0  # students or staff accounts
    parents_created: int = 0
    parents_linked: int = 0
    credentials: list[Credential] = []  # only after a real import, to hand out once
    emails_sent: int = 0


# ---- CSV helpers ------------------------------------------------------------------------------

def to_csv(header: list[str], rows: list[list]) -> str:
    """CSV with a BOM so Excel opens names in Hindi/Punjabi correctly."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else v for v in r])
    return "﻿" + buf.getvalue()


def _read(text: str, columns: list[str], required: list[str]) -> list[dict[str, str]]:
    text = text.lstrip("﻿")
    if not text.strip():
        raise AppError("The file is empty", code="IMPORT_EMPTY", status_code=422)
    reader = csv.DictReader(io.StringIO(text))
    header = [(h or "").strip().lower().replace(" ", "_") for h in reader.fieldnames or []]
    missing = [c for c in required if c not in header]
    if missing:
        raise AppError(f"Missing columns: {', '.join(missing)}. Download the template to see the expected columns.",
                       code="IMPORT_COLUMNS", status_code=422)
    rows = []
    for raw in reader:
        row = {h: (v or "").strip() for h, v in zip(header, raw.values(), strict=False) if h in columns}
        if any(row.values()):
            rows.append(row)
    if not rows:
        raise AppError("The file has a header but no data rows", code="IMPORT_EMPTY", status_code=422)
    if len(rows) > MAX_ROWS:
        raise AppError(f"Import at most {MAX_ROWS} rows at a time (this file has {len(rows)})", code="IMPORT_TOO_BIG", status_code=422)
    return rows


def _date(v: str) -> date | None:
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def _temp_password() -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        p = "".join(secrets.choice(alphabet) for _ in range(10))
        if any(c.isdigit() for c in p) and any(c.isupper() for c in p) and any(c.islower() for c in p):
            return p


def _errors_from(e: Exception, field_map: dict[str, str] | None = None) -> list[tuple[str | None, str]]:
    """Turn a validation or service error into (column, message) pairs."""
    field_map = field_map or {}
    if isinstance(e, ValidationError):
        out = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err["loc"])
            out.append((field_map.get(loc, loc.split(".")[0] if loc else None), err["msg"].removeprefix("Value error, ")))
        return out
    if isinstance(e, AppError):
        details = e.details if isinstance(e.details, list) else None
        if details:
            return [(field_map.get(d.get("field", ""), d.get("field")), d.get("message", e.message)) for d in details]
        return [(None, e.message)]
    raise e


# ---- export -----------------------------------------------------------------------------------

async def export_students(db: AsyncSession, school_id: uuid.UUID) -> str:
    rows = (await db.execute(
        select(Student, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Student.class_id)
        .join(Section, Section.id == Student.section_id).where(Student.school_id == school_id)
        .order_by(SchoolClass.sort_order, Section.name, Student.roll_no.nulls_last(), Student.first_name))).all()
    guardians: dict[uuid.UUID, dict[str, User]] = {}
    for sid, rel, user in (await db.execute(select(StudentGuardian.student_id, StudentGuardian.relationship, User)
                                            .join(User, User.id == StudentGuardian.user_id)
                                            .where(StudentGuardian.school_id == school_id))).all():
        guardians.setdefault(sid, {}).setdefault(rel, user)
    out = []
    for s, cname, sname in rows:
        g = guardians.get(s.id, {})
        parent = lambda rel: [g[rel].full_name, g[rel].phone, g[rel].email] if rel in g else ["", "", ""]  # noqa: E731
        out.append([s.admission_no, s.first_name, s.last_name, s.gender, s.date_of_birth.isoformat(), s.admission_date.isoformat(),
                    cname, sname, s.roll_no, s.blood_group, s.address, *parent("father"), *parent("mother"), *parent("guardian"), s.status])
    return to_csv(STUDENT_COLUMNS + ["status"], out)


async def export_parents(db: AsyncSession, school_id: uuid.UUID) -> str:
    rows = (await db.execute(
        select(User, Student, SchoolClass.name, Section.name, StudentGuardian.relationship)
        .join(StudentGuardian, StudentGuardian.user_id == User.id).join(Student, Student.id == StudentGuardian.student_id)
        .join(SchoolClass, SchoolClass.id == Student.class_id).join(Section, Section.id == Student.section_id)
        .where(User.school_id == school_id, User.role == Role.PARENT, User.deleted_at.is_(None))
        .order_by(User.full_name))).all()
    by_parent: dict[uuid.UUID, tuple[User, list[str]]] = {}
    for u, st, cname, sname, rel in rows:
        by_parent.setdefault(u.id, (u, []))[1].append(f"{st.first_name} {st.last_name} ({cname} – {sname}, {rel})")
    return to_csv(PARENT_COLUMNS, [[u.full_name, u.email, u.phone, "; ".join(kids), "yes" if u.is_active else "no"]
                                   for u, kids in by_parent.values()])


async def export_staff(db: AsyncSession, school_id: uuid.UUID) -> str:
    users = (await db.scalars(select(User).where(User.school_id == school_id, User.role.in_(STAFF_ROLES + [Role.DRIVER]),
                                                 User.deleted_at.is_(None)).order_by(User.role, User.full_name))).all()
    return to_csv(STAFF_COLUMNS + ["active", "last_sign_in"], [
        [u.full_name, u.email, u.role, u.phone, u.employee_id, u.designation, u.license_no, "yes" if u.is_active else "no",
         u.last_login_at.date().isoformat() if u.last_login_at else ""] for u in users])


def student_template() -> str:
    return to_csv(STUDENT_COLUMNS, [[
        "GV20260501", "Riya", "Sharma", "female", "2016-04-12", "2026-04-01", "Class 5", "A", "9", "B+",
        "House 12, Sector 21, Chandigarh", "Rakesh Sharma", "+91 98765 43210", "rakesh.sharma@example.in",
        "Pooja Sharma", "+91 98765 43211", "", "", "", ""]])


def staff_template() -> str:
    return to_csv(STAFF_COLUMNS, [
        ["Anil Kumar", "anil.kumar@example.in", "teacher", "+91 98765 00001", "T-101", "TGT Science", ""],
        ["Gurmeet Singh", "gurmeet@example.in", "driver", "+91 98765 00002", "D-010", "", "PB01 2019 0012345"],
    ])


# ---- import -----------------------------------------------------------------------------------

async def _finish(db: AsyncSession, school_id: uuid.UUID, result: ImportResult, accounts: list[tuple[User, str]],
                  send_emails: bool, outer) -> ImportResult:
    """Keep or discard the batch, and email new accounts if asked."""
    result.ok = not result.errors
    if result.errors or result.dry_run:
        await outer.rollback()  # a check keeps its counts (what would be created); a failed import created nothing
        if result.errors:
            result.created = result.parents_created = result.parents_linked = 0
        return result
    await outer.commit()
    db.info["suppress_emails"] = False
    result.credentials = [Credential(name=u.full_name, email=u.email, role=ROLE_LABELS.get(u.role, u.role), password=p) for u, p in accounts]
    if send_emails:
        for u, p in accounts:
            await notify.account_created(db, u, p)
            result.emails_sent += 1
    return result


async def import_students(db: AsyncSession, school_id: uuid.UUID, text: str, *, dry_run: bool, send_emails: bool,
                          actor_id: uuid.UUID) -> ImportResult:
    rows = _read(text, STUDENT_COLUMNS, STUDENT_REQUIRED)
    result = ImportResult(rows=len(rows), ok=False, dry_run=dry_run, errors=[])
    sections = {(c.lower(), s.lower()): (cid, sid) for sid, s, cid, c in (await db.execute(
        select(Section.id, Section.name, SchoolClass.id, SchoolClass.name).join(SchoolClass, SchoolClass.id == Section.class_id)
        .where(Section.school_id == school_id))).all()}
    today = date.today()
    accounts: list[tuple[User, str]] = []
    db.info["suppress_emails"] = True
    outer = await db.begin_nested()
    try:
        for n, r in enumerate(rows, start=1):
            errs: list[tuple[str | None, str]] = []
            dob = _date(r.get("date_of_birth", ""))
            if not dob:
                errs.append(("date_of_birth", "Use a date like 2016-04-12 or 12-04-2016"))
            adm = _date(r["admission_date"]) if r.get("admission_date") else today
            if not adm:
                errs.append(("admission_date", "Use a date like 2026-04-01 or 01-04-2026"))
            place = sections.get((r.get("class", "").lower(), r.get("section", "").lower()))
            if not place:
                errs.append(("section" if any(k[0] == r.get("class", "").lower() for k in sections) else "class",
                             f"No section {r.get('section') or '?'} in {r.get('class') or '?'}. Check the class and section names."))
            guardians = []
            for rel in ("father", "mother", "guardian"):
                name, phone, email = (r.get(f"{rel}_{k}", "") for k in ("name", "phone", "email"))
                if not (name or phone or email):
                    continue
                if not email:
                    errs.append((f"{rel}_email", f"Enter the {rel}'s email (it's their app login), or leave all three {rel} columns empty"))
                    continue
                existing = await db.scalar(select(User).where(User.school_id == school_id, User.email == email.lower(), User.deleted_at.is_(None)))
                if existing and existing.role != Role.PARENT:
                    errs.append((f"{rel}_email", f"{email} belongs to a {ROLE_LABELS.get(existing.role, existing.role)} account"))
                    continue
                try:
                    guardians.append(GuardianLink(user_id=existing.id, relationship=rel) if existing else
                                     GuardianLink(new_parent=NewParent(full_name=name, phone=phone, email=email), relationship=rel))
                except ValidationError as e:
                    errs += [(f"{rel}_{str(err['loc'][-1]).replace('full_name', 'name')}", err["msg"].removeprefix("Value error, ")) for err in e.errors()]
            if not errs:
                try:
                    data = StudentCreate(
                        first_name=r["first_name"], last_name=r["last_name"], gender=r["gender"].lower(), date_of_birth=dob,
                        admission_no=r["admission_no"], admission_date=adm, class_id=place[0], section_id=place[1],
                        roll_no=int(r["roll_no"]) if r.get("roll_no") else None, blood_group=r.get("blood_group") or None,
                        address=r.get("address") or None, guardians=guardians)
                except (ValidationError, ValueError) as e:
                    errs += _errors_from(e) if isinstance(e, ValidationError) else [("roll_no", "Roll number must be a whole number")]
            if not errs:
                sp = await db.begin_nested()
                try:
                    student, passwords = await student_service.create_student(db, school_id, data, actor_id=actor_id)
                    await sp.commit()
                    result.created += 1
                    result.parents_created += len(passwords)
                    result.parents_linked += sum(1 for g in guardians if g.user_id)
                    for email, pw in passwords.items():
                        u = await db.scalar(select(User).where(User.school_id == school_id, User.email == email))
                        accounts.append((u, pw))
                except (AppError, ValidationError) as e:
                    await sp.rollback()
                    errs += _errors_from(e, {"guardians.0": "father_email", "class_id": "class", "section_id": "section"})
            result.errors += [RowError(row=n, column=c, message=m) for c, m in errs]
        return await _finish(db, school_id, result, accounts, send_emails, outer)
    finally:
        db.info["suppress_emails"] = False


async def import_staff(db: AsyncSession, school_id: uuid.UUID, text: str, *, dry_run: bool, send_emails: bool,
                       actor_id: uuid.UUID) -> ImportResult:
    rows = _read(text, STAFF_COLUMNS, STAFF_REQUIRED)
    result = ImportResult(rows=len(rows), ok=False, dry_run=dry_run, errors=[])
    by_label = {v.lower(): k for k, v in ROLE_LABELS.items()}
    allowed = {str(r) for r in STAFF_ROLES + [Role.DRIVER]}
    accounts: list[tuple[User, str]] = []
    db.info["suppress_emails"] = True
    outer = await db.begin_nested()
    try:
        for n, r in enumerate(rows, start=1):
            errs: list[tuple[str | None, str]] = []
            role = r.get("role", "").strip().lower()
            role = by_label.get(role, role.replace(" ", "_"))
            if role not in allowed:
                errs.append(("role", "Use a staff role such as teacher, accountant, receptionist or driver. "
                                     "Parents and students are added through the student import."))
            if not errs:
                password = _temp_password()
                sp = await db.begin_nested()
                try:
                    data = UserCreate(email=r["email"], full_name=r["full_name"], role=role, password=password, phone=r.get("phone") or None,
                                      employee_id=r.get("employee_id") or None, designation=r.get("designation") or None,
                                      license_no=r.get("license_no") or None)
                    user = await user_service.create_user(db, school_id, data, actor_id=actor_id)
                    await sp.commit()
                    result.created += 1
                    accounts.append((user, password))
                except (AppError, ValidationError) as e:
                    await sp.rollback()
                    errs += _errors_from(e) if not (isinstance(e, AppError) and e.code == "EMAIL_TAKEN") else [("email", e.message)]
            result.errors += [RowError(row=n, column=c, message=m) for c, m in errs]
        return await _finish(db, school_id, result, accounts, send_emails, outer)
    finally:
        db.info["suppress_emails"] = False

