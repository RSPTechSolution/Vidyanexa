"""Student records and their guardians (parent accounts)."""
import secrets
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, Forbidden, NotFound
from app.core.permissions import STAFF_ROLES, Role, has_permission
from app.core.security import hash_password
from app.models import School, SchoolClass, Section, Student, StudentGuardian, User
from app.schemas.academics import (
    GuardianLink, GuardianOut, StudentCreate, StudentDetail, StudentOption, StudentOut, StudentUpdate,
)
from app.schemas.common import PageMeta, PageParams
from app.services import audit_service, storage_service
from app.services import notify
from app.services.academics_service import field_error, get_class, get_section


def temp_password() -> str:
    letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
    return "".join(secrets.choice(letters) for _ in range(7)) + "".join(secrets.choice("23456789") for _ in range(3))


async def active_count(db: AsyncSession, school_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count()).select_from(Student).where(
        Student.school_id == school_id, Student.status == "active")) or 0


async def _check_plan(db: AsyncSession, school_id: uuid.UUID) -> None:
    school = await db.get(School, school_id)
    limit = school.plan.max_students
    if limit is not None and await active_count(db, school_id) >= limit:
        raise Forbidden(f"Your {school.plan.name} plan allows {limit} students. Upgrade to add more.",
                        code="PLAN_LIMIT_REACHED", details={"limit": "students", "max": limit})


async def _check_placement(db: AsyncSession, school_id: uuid.UUID, class_id: uuid.UUID, section_id: uuid.UUID,
                           *, roll_no: int | None, exclude: uuid.UUID | None = None) -> None:
    await get_class(db, school_id, class_id)
    section = await get_section(db, school_id, section_id)
    if section.class_id != class_id:
        raise field_error("section_id", "This section belongs to a different class")
    if section.capacity:
        stmt = select(func.count()).select_from(Student).where(Student.section_id == section_id, Student.status == "active")
        if exclude:
            stmt = stmt.where(Student.id != exclude)
        if (await db.scalar(stmt) or 0) >= section.capacity:
            raise field_error("section_id", f"Section {section.name} is full ({section.capacity} students)")
    if roll_no is not None:
        stmt = select(Student.id).where(Student.section_id == section_id, Student.roll_no == roll_no, Student.status == "active")
        if exclude:
            stmt = stmt.where(Student.id != exclude)
        if await db.scalar(stmt):
            raise field_error("roll_no", f"Roll number {roll_no} is already used in this section")


async def _check_admission_no(db: AsyncSession, school_id: uuid.UUID, admission_no: str, exclude: uuid.UUID | None = None) -> None:
    stmt = select(Student.id).where(Student.school_id == school_id, func.lower(Student.admission_no) == admission_no.lower())
    if exclude:
        stmt = stmt.where(Student.id != exclude)
    if await db.scalar(stmt):
        raise field_error("admission_no", f"Admission number {admission_no} is already used")


async def _email_free(db: AsyncSession, school_id: uuid.UUID, email: str, field: str) -> None:
    if await db.scalar(select(User.id).where(User.school_id == school_id, User.email == email.lower(), User.deleted_at.is_(None))):
        raise field_error(field, f"{email} already has an account")
    from app.services.account_service import ensure_email_free
    await ensure_email_free(db, email, school_id=school_id, field=field)  # or an active account at another school


async def link_guardian(db: AsyncSession, school_id: uuid.UUID, student: Student, link: GuardianLink,
                        *, field: str = "guardians") -> tuple[User, str | None]:
    """Attach an existing or new parent to a student. Returns (parent, generated password or None)."""
    generated = None
    if link.user_id:
        parent = await db.scalar(select(User).where(
            User.id == link.user_id, User.school_id == school_id, User.deleted_at.is_(None)))
        if not parent or parent.role != Role.PARENT:
            raise field_error(field, "Choose a parent account from your school")
    else:
        np = link.new_parent
        await _email_free(db, school_id, np.email, field)
        generated = None if np.password else temp_password()
        parent = User(school_id=school_id, email=np.email.lower(), full_name=np.full_name, phone=np.phone,
                      role=Role.PARENT, password_hash=hash_password(np.password or generated),
                      must_change_password=True)
        db.add(parent)
        await db.flush()
        await notify.account_created(db, parent, np.password or generated)
    if await db.scalar(select(StudentGuardian.id).where(
            StudentGuardian.student_id == student.id, StudentGuardian.user_id == parent.id)):
        raise field_error(field, f"{parent.full_name} is already linked to this student")
    has_primary = await db.scalar(select(StudentGuardian.id).where(
        StudentGuardian.student_id == student.id, StudentGuardian.is_primary.is_(True)))
    db.add(StudentGuardian(school_id=school_id, student_id=student.id, user_id=parent.id,
                           relationship=link.relationship, is_primary=link.is_primary or not has_primary))
    await db.flush()
    return parent, generated


async def create_student(db: AsyncSession, school_id: uuid.UUID, data: StudentCreate,
                         *, actor_id: uuid.UUID) -> tuple[Student, dict[str, str]]:
    await _check_plan(db, school_id)
    await _check_admission_no(db, school_id, data.admission_no)
    await _check_placement(db, school_id, data.class_id, data.section_id, roll_no=data.roll_no)
    student = Student(school_id=school_id, **data.model_dump(exclude={"guardians", "login"}))
    db.add(student)
    await db.flush()

    passwords: dict[str, str] = {}
    for i, link in enumerate(data.guardians):
        parent, pw = await link_guardian(db, school_id, student, link, field=f"guardians.{i}")
        if pw:
            passwords[parent.email] = pw

    if data.login:
        await _email_free(db, school_id, data.login.email, "login.email")
        user = User(school_id=school_id, email=data.login.email.lower(), full_name=f"{student.first_name} {student.last_name}",
                    role=Role.STUDENT, password_hash=hash_password(data.login.password), must_change_password=True)
        db.add(user)
        await db.flush()
        student.user_id = user.id
        await notify.account_created(db, user, data.login.password)

    await audit_service.record(db, "student.create", school_id=school_id, user_id=actor_id, entity_type="student",
                               entity_id=student.id, meta={"admission_no": student.admission_no})
    await db.flush()
    return student, passwords


async def _get(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID) -> Student:
    s = await db.scalar(select(Student).where(Student.id == student_id, Student.school_id == school_id))
    if not s:
        raise NotFound("Student not found")
    return s


async def detail(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID) -> StudentDetail:
    s = await _get(db, school_id, student_id)
    c = await db.get(SchoolClass, s.class_id)
    sec = await db.get(Section, s.section_id)
    rows = (await db.execute(
        select(StudentGuardian, User).join(User, User.id == StudentGuardian.user_id)
        .where(StudentGuardian.student_id == s.id).order_by(StudentGuardian.is_primary.desc(), User.full_name)
    )).all()
    out = StudentDetail.model_validate(s)
    out.class_name, out.section_name = c.name, sec.name
    out.guardians = [GuardianOut(user_id=u.id, full_name=u.full_name, phone=u.phone, email=u.email,
                                 relationship=g.relationship, is_primary=g.is_primary) for g, u in rows]
    out.guardian_count = len(out.guardians)
    if s.user_id:
        out.login_email = await db.scalar(select(User.email).where(User.id == s.user_id))
    return out


async def list_students(db: AsyncSession, school_id: uuid.UUID, page: PageParams, *, search: str | None,
                        class_id: uuid.UUID | None, section_id: uuid.UUID | None, status: str | None,
                        ) -> tuple[list[StudentOut], PageMeta]:
    guardians = (select(StudentGuardian.student_id, func.count().label("n"))
                 .group_by(StudentGuardian.student_id).subquery())
    stmt = (select(Student, SchoolClass.name, Section.name, func.coalesce(guardians.c.n, 0))
            .join(SchoolClass, SchoolClass.id == Student.class_id)
            .join(Section, Section.id == Student.section_id)
            .outerjoin(guardians, guardians.c.student_id == Student.id)
            .where(Student.school_id == school_id))
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(
            func.lower(Student.first_name + " " + Student.last_name).like(like),
            func.lower(Student.admission_no).like(like),
        ))
    if class_id:
        stmt = stmt.where(Student.class_id == class_id)
    if section_id:
        stmt = stmt.where(Student.section_id == section_id)
    if status:
        stmt = stmt.where(Student.status == status)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = (await db.execute(
        stmt.order_by(SchoolClass.sort_order, Section.name, Student.roll_no.nulls_last(), Student.first_name)
        .offset(page.offset).limit(page.page_size)
    )).all()
    items = []
    for s, cname, sname, n in rows:
        out = StudentOut.model_validate(s)
        out.class_name, out.section_name, out.guardian_count = cname, sname, n
        items.append(out)
    return items, PageMeta(total=total, page=page.page, page_size=page.page_size)


async def options(db: AsyncSession, school_id: uuid.UUID, search: str | None, *, without_login: bool) -> list[StudentOption]:
    stmt = (select(Student, SchoolClass.name, Section.name)
            .join(SchoolClass, SchoolClass.id == Student.class_id).join(Section, Section.id == Student.section_id)
            .where(Student.school_id == school_id, Student.status == "active"))
    if without_login:
        stmt = stmt.where(Student.user_id.is_(None))
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(func.lower(Student.first_name + " " + Student.last_name).like(like),
                              func.lower(Student.admission_no).like(like)))
    rows = (await db.execute(stmt.order_by(Student.first_name).limit(20))).all()
    return [StudentOption(id=s.id, name=f"{s.first_name} {s.last_name}", admission_no=s.admission_no,
                          class_section=f"{c} – {sec}", has_login=s.user_id is not None) for s, c, sec in rows]


async def update_student(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID, data: StudentUpdate,
                         *, actor_id: uuid.UUID) -> Student:
    s = await _get(db, school_id, student_id)
    changes = data.model_dump(exclude_unset=True)
    if "admission_no" in changes:
        await _check_admission_no(db, school_id, changes["admission_no"], exclude=s.id)
    reactivating = changes.get("status") == "active" and s.status != "active"
    if reactivating:
        await _check_plan(db, school_id)
    if {"class_id", "section_id", "roll_no"} & changes.keys() or reactivating:
        await _check_placement(db, school_id, changes.get("class_id", s.class_id), changes.get("section_id", s.section_id),
                               roll_no=changes.get("roll_no", s.roll_no), exclude=s.id)
    dob, adm = changes.get("date_of_birth", s.date_of_birth), changes.get("admission_date", s.admission_date)
    if adm < dob:
        raise field_error("admission_date", "Admission date can't be before the date of birth")
    for k, v in changes.items():
        setattr(s, k, v)
    if s.user_id and changes.get("status") in ("inactive", "alumni"):
        login = await db.get(User, s.user_id)
        if login:
            login.is_active = False  # leaving students lose app access
    await audit_service.record(db, "student.update", school_id=school_id, user_id=actor_id, entity_type="student",
                               entity_id=s.id, meta={"fields": sorted(changes)})
    await db.flush()
    return s


async def add_guardian(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID, link: GuardianLink,
                       *, actor_id: uuid.UUID) -> str | None:
    s = await _get(db, school_id, student_id)
    parent, pw = await link_guardian(db, school_id, s, link, field="guardian")
    await audit_service.record(db, "student.guardian_add", school_id=school_id, user_id=actor_id, entity_type="student",
                               entity_id=s.id, meta={"parent": parent.full_name})
    return pw


async def remove_guardian(db: AsyncSession, school_id: uuid.UUID, student_id: uuid.UUID, user_id: uuid.UUID,
                          *, actor_id: uuid.UUID) -> None:
    s = await _get(db, school_id, student_id)
    g = await db.scalar(select(StudentGuardian).where(StudentGuardian.student_id == s.id, StudentGuardian.user_id == user_id))
    if not g:
        raise NotFound("This parent isn't linked to the student")
    # A parent account must keep at least one child.
    others = await db.scalar(select(func.count()).select_from(StudentGuardian).where(
        StudentGuardian.user_id == user_id, StudentGuardian.student_id != s.id))
    if not others:
        raise Conflict("This is the parent's only linked child. Link another child first, or deactivate the parent's account.",
                       code="LAST_CHILD")
    await db.delete(g)
    await audit_service.record(db, "student.guardian_remove", school_id=school_id, user_id=actor_id,
                               entity_type="student", entity_id=s.id)


# ---- photos and documents: the office uploads; staff who can see students and the family can read --

async def _may_upload(db: AsyncSession, user: User, owner_id: uuid.UUID | None) -> bool:
    return bool(owner_id) and has_permission(user.role, "students.manage") and bool(
        await db.scalar(select(Student.id).where(Student.id == owner_id, Student.school_id == user.school_id)))


async def _may_read(db: AsyncSession, user: User, owner_id: uuid.UUID | None) -> bool:
    from app.services.family_service import visible_student
    try:
        await visible_student(db, user, owner_id, "students.view")
        return True
    except NotFound:
        return False


async def _may_read_photo(db: AsyncSession, user: User, owner_id: uuid.UUID | None) -> bool:
    # Teachers take attendance with photos in view, so every staff member may see them, as may the family.
    return user.role in STAFF_ROLES or await _may_read(db, user, owner_id)


async def _set_photo(db: AsyncSession, user: User, owner_id: uuid.UUID | None, file_id: uuid.UUID | None) -> None:
    s = await _get(db, user.school_id, owner_id)
    s.photo_file_id = file_id


storage_service.register_purpose("student_photo", storage_service.Purpose(
    can_upload=_may_upload, can_read=_may_read_photo, images_only=True, single=True, on_change=_set_photo))
storage_service.register_purpose("student_document", storage_service.Purpose(can_upload=_may_upload, can_read=_may_read))
