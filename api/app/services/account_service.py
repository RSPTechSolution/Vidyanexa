"""One account per person across Vidyanexa, and families closing their accounts when they leave a school.

People sign in with their email alone, so an email can belong to only one active account at a time (any school, or the
platform). When a child moves school, the family asks the old school to close their accounts; once the school approves,
the students are marked as left and the logins deactivated, and the new school can add the same email.
"""
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import elevated
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.permissions import Role, has_permission
from app.models import AccountRequest, Student, StudentGuardian, User
from app.schemas.user import AccountRequestOut
from app.services import audit_service, email_service, email_templates, notification_service
from app.services.academics_service import field_error
from app.services.auth_service import revoke_user_sessions
from app.services.family_service import own_students

FAMILY = (Role.PARENT, Role.STUDENT)


async def ensure_email_free(db: AsyncSession, email: str, *, school_id: uuid.UUID | None, user_id: uuid.UUID | None = None,
                            field: str = "email") -> None:
    """Refuse an email that already has an active account (at this school, another school, or the platform)."""
    stmt = select(User.school_id).where(User.email == email.lower(), User.deleted_at.is_(None), User.is_active.is_(True))
    if user_id:
        stmt = stmt.where(User.id != user_id)
    async with elevated(db):  # other schools' users are outside this request's tenant
        owner = (await db.execute(stmt)).first()
    if owner is None:
        return
    if school_id and owner[0] == school_id:
        raise field_error(field, f"{email} already has an account at your school")
    raise field_error(field, f"{email} is already in use at another school. Ask the family to request account closure from "
                             "that school in the Vidyanexa app, or use a different email.")


# ---- closing accounts when a family leaves ---------------------------------------------------------------------

async def _out(db: AsyncSession, rows: list[AccountRequest]) -> list[AccountRequestOut]:
    student_ids = {sid for r in rows for sid in r.student_ids}
    students = {s.id: f"{s.first_name} {s.last_name}" for s in (await db.scalars(select(Student).where(Student.id.in_(student_ids)))).all()}
    users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_({r.requested_by for r in rows} - {None})))).all()}
    out = []
    for r in rows:
        who = users.get(r.requested_by)
        out.append(AccountRequestOut(id=r.id, status=r.status, reason=r.reason, created_at=r.created_at, decided_at=r.decided_at,
                                     decision_note=r.decision_note, requested_by_name=who.full_name if who else "Former user",
                                     requested_by_email=who.email if who else None,
                                     students=[students.get(sid, "Former student") for sid in r.student_ids]))
    return out


async def list_requests(db: AsyncSession, user: User, status: str | None = None) -> list[AccountRequestOut]:
    stmt = select(AccountRequest).where(AccountRequest.school_id == user.school_id)
    if user.role in FAMILY:
        stmt = stmt.where(AccountRequest.requested_by == user.id)
    elif not has_permission(user.role, "students.manage"):
        return []  # other staff don't handle these
    if status:
        stmt = stmt.where(AccountRequest.status == status)
    rows = (await db.scalars(stmt.order_by(AccountRequest.status != "pending", AccountRequest.created_at.desc()).limit(200))).all()
    return await _out(db, list(rows))


async def create_request(db: AsyncSession, user: User, student_ids: list[uuid.UUID], reason: str) -> AccountRequestOut:
    if user.role not in FAMILY:
        raise Forbidden("Staff accounts are closed by the school admin", code="PERMISSION_DENIED")
    own = {s.id: s for s in await own_students(db, user) if s.status == "active"}
    chosen = list(dict.fromkeys(student_ids)) if user.role == Role.PARENT else list(own)
    if not chosen or any(sid not in own for sid in chosen):
        raise field_error("student_ids", "Choose which of your children are leaving")
    if await db.scalar(select(AccountRequest.id).where(AccountRequest.requested_by == user.id, AccountRequest.status == "pending")):
        raise BadRequest("You already have a request waiting for the school", code="REQUEST_PENDING")
    r = AccountRequest(school_id=user.school_id, requested_by=user.id, student_ids=chosen, reason=reason.strip(), status="pending")
    db.add(r)
    await db.flush()
    admins = (await db.scalars(select(User.id).where(User.school_id == user.school_id, User.is_active.is_(True), User.deleted_at.is_(None),
                                                     User.role.in_([Role.SCHOOL_ADMIN, Role.PRINCIPAL])))).all()
    names = ", ".join(f"{own[sid].first_name} {own[sid].last_name}" for sid in chosen)
    await notification_service.notify(db, list(admins), school_id=user.school_id, kind="account", title="Account closure requested",
                                      body=f"{user.full_name} asked to close the accounts for {names}: {reason.strip()[:100]}",
                                      link="/account-requests")
    await audit_service.record(db, "account_request.create", school_id=user.school_id, user_id=user.id, entity_type="account_request", entity_id=r.id)
    return (await _out(db, [r]))[0]


async def _request(db: AsyncSession, user: User, rid: uuid.UUID) -> AccountRequest:
    r = await db.scalar(select(AccountRequest).where(AccountRequest.id == rid, AccountRequest.school_id == user.school_id))
    if not r:
        raise NotFound("Request not found")
    return r


async def cancel(db: AsyncSession, user: User, rid: uuid.UUID) -> AccountRequestOut:
    r = await _request(db, user, rid)
    if r.requested_by != user.id or r.status != "pending":
        raise BadRequest("Only a waiting request of yours can be withdrawn", code="NOT_PENDING")
    r.status = "cancelled"
    await db.flush()
    return (await _out(db, [r]))[0]


async def decide(db: AsyncSession, user: User, rid: uuid.UUID, approve: bool, note: str | None) -> AccountRequestOut:
    """Approving marks the students as left and deactivates their logins, and each parent's login once none of their
    children are still at the school. Their records stay (for certificates and history); only the logins close."""
    if not has_permission(user.role, "students.manage"):
        raise Forbidden("Missing permission: students.manage", code="PERMISSION_DENIED")
    r = await _request(db, user, rid)
    if r.status != "pending":
        raise BadRequest("This request has already been decided", code="NOT_PENDING")
    r.status, r.decided_by, r.decided_at, r.decision_note = ("approved" if approve else "rejected"), user.id, datetime.now(UTC), (note or None)
    requester = await db.get(User, r.requested_by) if r.requested_by else None
    closed: list[User] = []
    if approve:
        students = (await db.scalars(select(Student).where(Student.id.in_(r.student_ids), Student.school_id == r.school_id))).all()
        logins = {s.user_id for s in students if s.user_id}
        for s in students:
            s.status = "inactive"
        guardians = set((await db.scalars(select(StudentGuardian.user_id).where(StudentGuardian.student_id.in_(r.student_ids)))).all())
        for g in guardians:
            still_here = await db.scalar(select(Student.id).join(StudentGuardian, StudentGuardian.student_id == Student.id)
                                         .where(StudentGuardian.user_id == g, Student.status == "active"))
            if not still_here:
                logins.add(g)
        for u in (await db.scalars(select(User).where(User.id.in_(logins), User.is_active.is_(True)))).all():
            u.is_active = False
            await revoke_user_sessions(db, u.id)
            closed.append(u)
    await db.flush()
    if requester:
        from app.services.notify import _school
        school = await _school(db, r.school_id)
        await email_service.queue(db, email_templates.account_closure(
            to=requester.email, name=requester.full_name, school_name=school.name if school else "Your school", approved=approve,
            note=note, closed=[u.email for u in closed]), school_id=r.school_id)
        if not approve:
            await notification_service.notify(db, [requester.id], school_id=r.school_id, kind="account", title="Account closure declined",
                                              body=note or "Contact the school office for details.", link="/leaving")
    await audit_service.record(db, f"account_request.{r.status}", school_id=r.school_id, user_id=user.id, entity_type="account_request",
                               entity_id=r.id, meta={"closed": [str(u.id) for u in closed]})
    return (await _out(db, [r]))[0]
