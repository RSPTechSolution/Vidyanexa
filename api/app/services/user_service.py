import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, BadRequest, Conflict, NotFound
from app.core.permissions import Role
from app.core.security import hash_password
from app.core import roles
from app.models import (
    AttendanceRecord, AuditLog, FeeInvoice, School, SchoolClass, Section, Student, StudentGuardian, Subject, TimetableEntry, User,
)
from app.schemas.common import PageMeta, PageParams
from app.schemas.user import ActivityItem, LinkedChild, SectionRef, UserCreate, UserDetail, UserUpdate
from app.services.academics_service import field_error
from app.services import audit_service, billing_service, notify
from app.services.auth_service import revoke_user_sessions


async def list_users(db: AsyncSession, school_id: uuid.UUID, page: PageParams, *,
                     search: str | None = None, role: str | None = None,
                     is_active: bool | None = None) -> tuple[list[User], PageMeta]:
    stmt = select(User).where(User.school_id == school_id, User.deleted_at.is_(None))
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.where(or_(func.lower(User.full_name).like(like), User.email.like(like), User.phone.like(like)))
    if role:
        stmt = stmt.where(User.role == role)
    if is_active is not None:
        stmt = stmt.where(User.is_active.is_(is_active))
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await db.scalars(stmt.order_by(User.full_name).offset(page.offset).limit(page.page_size))
    return list(rows.all()), PageMeta(total=total or 0, page=page.page, page_size=page.page_size)


async def get_user(db: AsyncSession, school_id: uuid.UUID, user_id: uuid.UUID) -> User:
    user = await db.scalar(select(User).where(User.id == user_id, User.school_id == school_id, User.deleted_at.is_(None)))
    if not user:
        raise NotFound("User not found")
    return user


async def _child_summaries(db: AsyncSession, school_id: uuid.UUID, rows: list[tuple[Student, str, str, str]]) -> list[LinkedChild]:
    """Each child with this month's attendance and what's unpaid (only for modules the school uses)."""
    from app.core.deps import enabled_modules
    from app.services.family_service import school_today
    ids = [s.id for s, *_ in rows]
    modules = await enabled_modules(db, school_id) if ids else []
    today = await school_today(db, school_id) if ids else None
    marks: dict[uuid.UUID, dict[str, int]] = {i: {} for i in ids}
    if "attendance" in modules:
        for sid, status, n in (await db.execute(
                select(AttendanceRecord.student_id, AttendanceRecord.status, func.count())
                .where(AttendanceRecord.student_id.in_(ids), AttendanceRecord.date.between(today.replace(day=1), today))
                .group_by(AttendanceRecord.student_id, AttendanceRecord.status))).all():
            marks[sid][status] = n
    dues: dict[uuid.UUID, tuple[float, bool]] = {}
    if "fees" in modules:
        for sid, due, first in (await db.execute(
                select(FeeInvoice.student_id, func.sum(FeeInvoice.total - FeeInvoice.discount - FeeInvoice.paid), func.min(FeeInvoice.due_date))
                .where(FeeInvoice.student_id.in_(ids), FeeInvoice.status.in_(("unpaid", "partial"))).group_by(FeeInvoice.student_id))).all():
            dues[sid] = (float(due), first < today)

    def pct(c: dict[str, int]) -> float | None:
        days = sum(c.values()) - c.get("leave", 0)
        return round(100 * (c.get("present", 0) + c.get("late", 0) + 0.5 * c.get("half_day", 0)) / days, 1) if days else None

    return [LinkedChild(
        student_id=s.id, name=f"{s.first_name} {s.last_name}", class_section=f"{c} – {sec}", relationship=rel, admission_no=s.admission_no,
        attendance_percent=pct(marks[s.id]) if "attendance" in modules else None,
        fee_due=dues.get(s.id, (0.0, False))[0] if "fees" in modules else None, fee_overdue=dues.get(s.id, (0.0, False))[1],
    ) for s, rel, c, sec in rows]


async def _module_extras(db: AsyncSession, school_id: uuid.UUID, user: User, out: UserDetail, *, with_hr: bool) -> None:
    """What this person has to do with the other modules, for the modules the school uses."""
    from app.core.deps import enabled_modules
    from app.services import profile_service as prof
    modules = await enabled_modules(db, school_id)
    staff = user.role not in (Role.PARENT, Role.STUDENT)
    if staff:
        sizes = await prof.section_sizes(db, [s.section_id for s in out.class_teacher_of])
        for s in out.class_teacher_of:
            s.students = sizes.get(s.section_id, 0)
        if "library" in modules:
            lib = await prof.library_summary(db, user_id=user.id)
            out.library = lib if lib.current or lib.returned_total else None
        if "hr" in modules and with_hr:
            out.hr = await prof.hr_summary(db, school_id, user.id)
        if "transport" in modules and user.role == Role.DRIVER:
            out.buses, out.trips = await prof.driver_duties(db, user.id)
        if "academics" in modules and user.role in (Role.TEACHER, Role.PRINCIPAL):
            extra = await prof.teacher_extras(db, school_id, user.id)
            out.live_classes, out.lesson_plans_this_week, out.covers_ahead = extra["live_classes"], extra["lesson_plans_this_week"], extra["covers_ahead"]
        if "security" in modules:
            out.visitors = await prof.visitors_hosted(db, user.id)
        if "hostel" in modules:
            out.warden_of = await prof.warden_of(db, user.id)
        if "communication" in modules and user.role == Role.TEACHER:
            out.ptm = await prof.ptm_rows(db, teacher_id=user.id)
    if user.role == Role.STUDENT and out.student_id:
        out.student_overview = await prof.student_overview(db, school_id, out.student_id)
    if user.role == Role.PARENT and out.children:
        ids = [c.student_id for c in out.children]
        names = {c.student_id: c.name for c in out.children}
        out.requests = await prof.student_requests(db, ids, names, modules=modules)
        if "communication" in modules:
            out.ptm = await prof.ptm_rows(db, student_ids=ids, names=names)


async def user_detail(db: AsyncSession, school_id: uuid.UUID, user_id: uuid.UUID, *, with_activity: bool = False,
                      with_hr: bool = False) -> UserDetail:
    """A user and what they're connected to: a parent's children, a student's own record, the classes a teacher
    runs and teaches, and (for those allowed to see the audit log) their recent activity."""
    user = await get_user(db, school_id, user_id)
    out = UserDetail.model_validate(user)
    students = (select(Student, SchoolClass.name, Section.name)
                .join(SchoolClass, SchoolClass.id == Student.class_id).join(Section, Section.id == Student.section_id))
    if user.role == Role.PARENT:
        rows = (await db.execute(
            students.add_columns(StudentGuardian.relationship).join(StudentGuardian, StudentGuardian.student_id == Student.id)
            .where(StudentGuardian.user_id == user.id).order_by(Student.first_name))).all()
        out.children = await _child_summaries(db, school_id, [(s, rel, c, sec) for s, c, sec, rel in rows])
    if user.role == Role.STUDENT:
        row = (await db.execute(students.where(Student.user_id == user.id))).first()
        if row:
            st, c, sec = row
            out.student_id, out.student_name = st.id, f"{st.first_name} {st.last_name}"
            out.student = (await _child_summaries(db, school_id, [(st, "self", c, sec)]))[0]
    if user.role not in (Role.PARENT, Role.STUDENT):
        out.class_teacher_of = [SectionRef(section_id=sid, label=f"{c} – {n}") for sid, c, n in (await db.execute(
            select(Section.id, SchoolClass.name, Section.name).join(SchoolClass, SchoolClass.id == Section.class_id)
            .where(Section.school_id == school_id, Section.class_teacher_id == user.id)
            .order_by(SchoolClass.sort_order, Section.name))).all()]
        out.teaching = [f"{subj} · {c} – {n}" for subj, c, n in (await db.execute(
            select(Subject.name, SchoolClass.name, Section.name).distinct()
            .select_from(TimetableEntry).join(Subject, Subject.id == TimetableEntry.subject_id)
            .join(Section, Section.id == TimetableEntry.section_id).join(SchoolClass, SchoolClass.id == Section.class_id)
            .where(TimetableEntry.school_id == school_id, TimetableEntry.teacher_id == user.id)
            .order_by(Subject.name, SchoolClass.name, Section.name))).all()]
    await _module_extras(db, school_id, user, out, with_hr=with_hr)
    if with_activity:
        out.activity = [ActivityItem(action=a.action, entity_type=a.entity_type, entity_id=a.entity_id, meta=a.meta or {}, created_at=a.created_at)
                        for a in (await db.scalars(select(AuditLog).where(AuditLog.school_id == school_id, AuditLog.user_id == user.id)
                                                   .order_by(AuditLog.created_at.desc()).limit(10))).all()]
    return out


async def _email_taken(db: AsyncSession, school_id: uuid.UUID, email: str) -> bool:
    return bool(await db.scalar(select(User.id).where(
        User.school_id == school_id, User.email == email, User.deleted_at.is_(None))))


async def create_user(db: AsyncSession, school_id: uuid.UUID, data: UserCreate, *, actor_id: uuid.UUID) -> User:
    email = data.email.lower()
    if await _email_taken(db, school_id, email):
        raise Conflict("A user with this email already exists", code="EMAIL_TAKEN")
    from app.services.account_service import ensure_email_free
    await ensure_email_free(db, email, school_id=school_id)  # people sign in by email alone: one active account each
    await billing_service.check_capacity(db, await db.get(School, school_id), data.role)

    # Role-specific requirements (e.g. parents need a child, drivers a licence).
    values = data.model_dump()
    missing = roles.missing_fields(data.role, values)
    if missing:
        raise AppError("Some required details are missing", code="VALIDATION_ERROR", status_code=422, details=[
            {"field": f, "message": f"{roles.FIELD_LABELS[f]} is required for this role"} for f in missing])
    allowed = set(roles.ROLE_RULES[data.role]["required"]) | set(roles.ROLE_RULES[data.role]["optional"])
    extra = {f: values[f] for f in ("phone", "employee_id", "designation", "license_no") if f in allowed}

    student = None
    if data.role == Role.STUDENT:
        student = await db.scalar(select(Student).where(Student.id == data.student_id, Student.school_id == school_id))
        if not student or student.status != "active":
            raise field_error("student_id", "Choose an active student record")
        if student.user_id:
            raise field_error("student_id", "This student already has a login")
    children = []
    if data.role == Role.PARENT:
        seen = set()
        for i, c in enumerate(data.children or []):
            if c.student_id in seen:
                raise field_error(f"children.{i}", "This child is listed twice")
            seen.add(c.student_id)
            st = await db.scalar(select(Student).where(Student.id == c.student_id, Student.school_id == school_id))
            if not st:
                raise field_error(f"children.{i}", "Choose a student from your school")
            children.append((st, c.relationship))

    user = User(school_id=school_id, email=email, full_name=data.full_name, role=data.role,
                password_hash=hash_password(data.password), must_change_password=True, **extra)
    db.add(user)
    await db.flush()
    if student:
        student.user_id = user.id
    for st, relationship in children:
        has_primary = await db.scalar(select(StudentGuardian.id).where(
            StudentGuardian.student_id == st.id, StudentGuardian.is_primary.is_(True)))
        db.add(StudentGuardian(school_id=school_id, student_id=st.id, user_id=user.id,
                               relationship=relationship, is_primary=not has_primary))
    await db.flush()
    await audit_service.record(db, "user.create", school_id=school_id, user_id=actor_id,
                               entity_type="user", entity_id=user.id, meta={"role": data.role})
    await notify.account_created(db, user, data.password)
    return user


async def _active_admin_count(db: AsyncSession, school_id: uuid.UUID) -> int:
    return await db.scalar(select(func.count()).where(
        User.school_id == school_id, User.role == Role.SCHOOL_ADMIN,
        User.is_active.is_(True), User.deleted_at.is_(None))) or 0


async def update_user(db: AsyncSession, school_id: uuid.UUID, user_id: uuid.UUID, data: UserUpdate,
                      *, actor_id: uuid.UUID) -> User:
    user = await get_user(db, school_id, user_id)
    changes = data.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] != user.role and (
            changes["role"] in roles.LINKED_ROLES or user.role in roles.LINKED_ROLES):
        raise BadRequest("Parent and student accounts are linked to student records, so their role can't be changed. "
                         "Create a new account instead.", code="ROLE_CHANGE_NOT_ALLOWED")
    new_role = changes.get("role", user.role)
    after = {f: changes.get(f, getattr(user, f)) for f in ("phone", "employee_id", "designation", "license_no")}
    # Links (children/student) already exist for these accounts; only check the plain fields.
    missing = [f for f in roles.missing_fields(new_role, {**after, "children": True, "student_id": True})]
    if missing:
        raise AppError("Some required details are missing", code="VALIDATION_ERROR", status_code=422, details=[
            {"field": f, "message": f"{roles.FIELD_LABELS[f]} is required for this role"} for f in missing])
    if user.id == actor_id and ("role" in changes or changes.get("is_active") is False):
        raise BadRequest("You cannot change your own role or deactivate yourself", code="SELF_MODIFICATION")
    losing_admin = user.role == Role.SCHOOL_ADMIN and (
        changes.get("role", Role.SCHOOL_ADMIN) != Role.SCHOOL_ADMIN or changes.get("is_active") is False)
    if losing_admin and await _active_admin_count(db, school_id) <= 1:
        raise BadRequest("A school must keep at least one active admin", code="LAST_ADMIN")
    # Taking up a new seat (reactivation or moving into a limited role) must fit the plan.
    new_role = changes.get("role", user.role)
    reactivating = changes.get("is_active") is True and not user.is_active
    if reactivating:
        from app.services.account_service import ensure_email_free
        await ensure_email_free(db, user.email, school_id=school_id, user_id=user.id, field="is_active")
    if reactivating or (user.is_active and new_role != user.role):
        await billing_service.check_capacity(db, await db.get(School, school_id), new_role)
    for field, value in changes.items():
        setattr(user, field, value)
    if changes.get("is_active") is False or "role" in changes:
        await revoke_user_sessions(db, user.id)  # new role/permissions take effect on next login
    await audit_service.record(db, "user.update", school_id=school_id, user_id=actor_id,
                               entity_type="user", entity_id=user.id, meta={"fields": sorted(changes)})
    await db.flush()
    return user


async def delete_user(db: AsyncSession, school_id: uuid.UUID, user_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    user = await get_user(db, school_id, user_id)
    if user.id == actor_id:
        raise BadRequest("You cannot delete your own account", code="SELF_MODIFICATION")
    if user.role == Role.SCHOOL_ADMIN and user.is_active and await _active_admin_count(db, school_id) <= 1:
        raise BadRequest("A school must keep at least one active admin", code="LAST_ADMIN")
    user.deleted_at = datetime.now(UTC)
    user.is_active = False
    await revoke_user_sessions(db, user.id)
    await audit_service.record(db, "user.delete", school_id=school_id, user_id=actor_id,
                               entity_type="user", entity_id=user.id)


async def admin_set_password(db: AsyncSession, school_id: uuid.UUID, user_id: uuid.UUID, password: str,
                             *, actor_id: uuid.UUID) -> None:
    user = await get_user(db, school_id, user_id)
    user.password_hash = hash_password(password)
    user.must_change_password = True
    await revoke_user_sessions(db, user.id)
    await audit_service.record(db, "user.password_set", school_id=school_id, user_id=actor_id,
                               entity_type="user", entity_id=user.id)
    await notify.password_set(db, user, password)


async def list_audit(db: AsyncSession, school_id: uuid.UUID, page: PageParams, *,
                     action: str | None = None) -> tuple[list[dict], PageMeta]:
    base = select(AuditLog).where(AuditLog.school_id == school_id)
    if action:
        base = base.where(AuditLog.action.like(f"{action}%"))
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    stmt = (base.add_columns(User.full_name).outerjoin(User, User.id == AuditLog.user_id)
            .order_by(AuditLog.created_at.desc()).offset(page.offset).limit(page.page_size))
    rows = (await db.execute(stmt)).all()
    items = [{**{c.key: getattr(log, c.key) for c in AuditLog.__table__.columns}, "user_name": name} for log, name in rows]
    return items, PageMeta(total=total or 0, page=page.page, page_size=page.page_size)
