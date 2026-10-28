"""Classes and sections."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, Conflict, NotFound
from app.core.permissions import Role
from app.models import SchoolClass, Section, Student, User
from app.schemas.academics import ClassCreate, ClassOut, ClassUpdate, SectionCreate, SectionOut, SectionUpdate
from app.services import audit_service


def field_error(field: str, message: str) -> AppError:
    """A 422 in the same shape as request validation errors, so forms can show it on the field."""
    return AppError("Invalid request", code="VALIDATION_ERROR", status_code=422,
                    details=[{"field": field, "message": message}])


async def list_classes(db: AsyncSession, school_id: uuid.UUID) -> list[ClassOut]:
    classes = (await db.scalars(select(SchoolClass).where(SchoolClass.school_id == school_id)
                                .order_by(SchoolClass.sort_order, SchoolClass.name))).all()
    rows = (await db.execute(
        select(Section, User.full_name).outerjoin(User, User.id == Section.class_teacher_id)
        .where(Section.school_id == school_id).order_by(Section.name)
    )).all()
    counts = dict((await db.execute(
        select(Student.section_id, func.count()).where(Student.school_id == school_id, Student.status == "active")
        .group_by(Student.section_id)
    )).all())
    by_class: dict[uuid.UUID, list[SectionOut]] = {}
    for section, teacher in rows:
        out = SectionOut.model_validate(section)
        out.class_teacher_name = teacher
        out.student_count = counts.get(section.id, 0)
        by_class.setdefault(section.class_id, []).append(out)
    result = []
    for c in classes:
        out = ClassOut.model_validate(c)
        out.sections = by_class.get(c.id, [])
        out.student_count = sum(s.student_count for s in out.sections)
        result.append(out)
    return result


async def get_class(db: AsyncSession, school_id: uuid.UUID, class_id: uuid.UUID) -> SchoolClass:
    c = await db.scalar(select(SchoolClass).where(SchoolClass.id == class_id, SchoolClass.school_id == school_id))
    if not c:
        raise NotFound("Class not found")
    return c


async def get_section(db: AsyncSession, school_id: uuid.UUID, section_id: uuid.UUID) -> Section:
    s = await db.scalar(select(Section).where(Section.id == section_id, Section.school_id == school_id))
    if not s:
        raise NotFound("Section not found")
    return s


async def _name_taken(db: AsyncSession, school_id: uuid.UUID, name: str, exclude: uuid.UUID | None = None) -> bool:
    stmt = select(SchoolClass.id).where(SchoolClass.school_id == school_id, func.lower(SchoolClass.name) == name.lower())
    if exclude:
        stmt = stmt.where(SchoolClass.id != exclude)
    return bool(await db.scalar(stmt))


async def _check_teacher(db: AsyncSession, school_id: uuid.UUID, teacher_id: uuid.UUID | None,
                         section_id: uuid.UUID | None = None) -> None:
    if teacher_id is None:
        return
    teacher = await db.scalar(select(User).where(
        User.id == teacher_id, User.school_id == school_id, User.deleted_at.is_(None), User.is_active.is_(True)))
    if not teacher or teacher.role not in (Role.TEACHER, Role.PRINCIPAL, Role.SCHOOL_ADMIN):
        raise field_error("class_teacher_id", "Choose an active teacher from your school")
    # The class teacher is the section's in-charge, so each teacher has one class.
    stmt = select(SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Section.class_id).where(Section.class_teacher_id == teacher_id)
    if section_id:
        stmt = stmt.where(Section.id != section_id)
    other = (await db.execute(stmt)).first()
    if other:
        raise field_error("class_teacher_id", f"{teacher.full_name} is already the class teacher of {other[0]} – {other[1]}. "
                                              "A teacher can be in charge of one class; change that class first.")


async def create_class(db: AsyncSession, school_id: uuid.UUID, data: ClassCreate, *, actor_id: uuid.UUID) -> SchoolClass:
    if await _name_taken(db, school_id, data.name):
        raise field_error("name", f"{data.name} already exists")
    order = data.sort_order
    if order is None:
        order = (await db.scalar(select(func.max(SchoolClass.sort_order)).where(SchoolClass.school_id == school_id)) or 0) + 1
    c = SchoolClass(school_id=school_id, name=data.name, sort_order=order)
    db.add(c)
    await db.flush()
    for name in data.sections:
        db.add(Section(school_id=school_id, class_id=c.id, name=name))
    await audit_service.record(db, "class.create", school_id=school_id, user_id=actor_id, entity_type="class",
                               entity_id=c.id, meta={"name": c.name, "sections": data.sections})
    await db.flush()
    return c


async def create_classes(db: AsyncSession, school_id: uuid.UUID, names: list[str], sections: list[str],
                         *, actor_id: uuid.UUID) -> int:
    """Quick setup: create several classes at once, skipping names that already exist."""
    created = 0
    for name in names:
        name = " ".join(name.split())
        if name and not await _name_taken(db, school_id, name):
            await create_class(db, school_id, ClassCreate(name=name, sections=sections), actor_id=actor_id)
            created += 1
    return created


async def update_class(db: AsyncSession, school_id: uuid.UUID, class_id: uuid.UUID, data: ClassUpdate,
                       *, actor_id: uuid.UUID) -> SchoolClass:
    c = await get_class(db, school_id, class_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and await _name_taken(db, school_id, changes["name"], exclude=c.id):
        raise field_error("name", f"{changes['name']} already exists")
    for k, v in changes.items():
        setattr(c, k, v)
    await audit_service.record(db, "class.update", school_id=school_id, user_id=actor_id, entity_type="class", entity_id=c.id)
    await db.flush()
    return c


async def _students_in(db: AsyncSession, *, active: bool | None = None, **where) -> int:
    stmt = select(func.count()).select_from(Student)
    for k, v in where.items():
        stmt = stmt.where(getattr(Student, k) == v)
    if active is True:
        stmt = stmt.where(Student.status == "active")
    elif active is False:
        stmt = stmt.where(Student.status != "active")
    return await db.scalar(stmt) or 0


async def class_teacher_sections(db: AsyncSession, user: User) -> set[uuid.UUID]:
    """Sections this user is the class teacher (incharge) of. The incharge runs the class: daily attendance,
    class notices, fee reminders, leave requests, gate passes and parent-teacher meetings."""
    return set((await db.scalars(select(Section.id).where(Section.class_teacher_id == user.id, Section.school_id == user.school_id))).all())


def _in_use(what: str, current: int, past: int, move: str, code: str) -> Conflict:
    if current:
        return Conflict(f"{what} has {current} current student{'s' if current != 1 else ''}. {move}", code=code)
    return Conflict(f"{what} has records of {past} former student{'s' if past != 1 else ''} (left or passed out), which must be kept. "
                    "It can't be deleted.", code="HAS_HISTORY")


async def delete_class(db: AsyncSession, school_id: uuid.UUID, class_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    c = await get_class(db, school_id, class_id)
    current, past = await _students_in(db, class_id=c.id, active=True), await _students_in(db, class_id=c.id, active=False)
    if current or past:
        raise _in_use(c.name, current, past, "Move them to another class first (Students → edit, or Promotion).", "CLASS_IN_USE")
    await db.delete(c)
    await audit_service.record(db, "class.delete", school_id=school_id, user_id=actor_id, entity_type="class",
                               entity_id=c.id, meta={"name": c.name})


async def add_section(db: AsyncSession, school_id: uuid.UUID, class_id: uuid.UUID, data: SectionCreate,
                      *, actor_id: uuid.UUID) -> Section:
    c = await get_class(db, school_id, class_id)
    if await db.scalar(select(Section.id).where(Section.class_id == c.id, Section.name == data.name)):
        raise field_error("name", f"Section {data.name} already exists in {c.name}")
    await _check_teacher(db, school_id, data.class_teacher_id)
    s = Section(school_id=school_id, class_id=c.id, **data.model_dump())
    db.add(s)
    await audit_service.record(db, "section.create", school_id=school_id, user_id=actor_id, entity_type="section",
                               meta={"class": c.name, "section": data.name})
    await db.flush()
    return s


async def update_section(db: AsyncSession, school_id: uuid.UUID, section_id: uuid.UUID, data: SectionUpdate,
                         *, actor_id: uuid.UUID) -> Section:
    s = await get_section(db, school_id, section_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] != s.name and await db.scalar(
            select(Section.id).where(Section.class_id == s.class_id, Section.name == changes["name"])):
        raise field_error("name", f"Section {changes['name']} already exists in this class")
    if "class_teacher_id" in changes and changes["class_teacher_id"] != s.class_teacher_id:
        await _check_teacher(db, school_id, changes["class_teacher_id"], s.id)
    if changes.get("capacity") is not None:
        current = await _students_in(db, section_id=s.id, status="active")
        if changes["capacity"] < current:
            raise field_error("capacity", f"This section already has {current} students")
    for k, v in changes.items():
        setattr(s, k, v)
    await audit_service.record(db, "section.update", school_id=school_id, user_id=actor_id, entity_type="section", entity_id=s.id)
    await db.flush()
    return s


async def delete_section(db: AsyncSession, school_id: uuid.UUID, section_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    s = await get_section(db, school_id, section_id)
    current, past = await _students_in(db, section_id=s.id, active=True), await _students_in(db, section_id=s.id, active=False)
    if current or past:
        raise _in_use(f"Section {s.name}", current, past, "Move them to another section first.", "SECTION_IN_USE")
    if await db.scalar(select(func.count()).select_from(Section).where(Section.class_id == s.class_id)) <= 1:
        raise Conflict("A class needs at least one section. Delete the class instead.", code="LAST_SECTION")
    await db.delete(s)
    await audit_service.record(db, "section.delete", school_id=school_id, user_id=actor_id, entity_type="section", entity_id=s.id)
