"""The school's storage page: how much of the plan's space is used and by what, every uploaded file, and removing them.

Deleting goes through storage_service.delete_file, and each file's purpose is told it's gone (so a removed student photo
also disappears from the student's profile)."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import BadRequest
from app.models import AccountEntry, ComplianceDoc, Homework, School, StoredFile, Student, User, Visitor, Worker
from app.schemas.common import PageMeta
from app.services import audit_service, storage_service

# What each kind of file is called on the page, and its group in the bar (like Drive's photos / documents / other).
PURPOSES = {
    "student_photo": ("Student photos", "photos"),
    "user_photo": ("Staff and parent photos", "photos"),
    "visitor_photo": ("Visitor photos", "photos"),
    "worker_photo": ("Worker photos", "photos"),
    "school_logo": ("School logo", "photos"),
    "student_document": ("Student documents", "documents"),
    "compliance_doc": ("Compliance documents", "documents"),
    "voucher": ("Account vouchers", "documents"),
    "homework": ("Homework attachments", "homework"),
}
SORTS = {"largest": StoredFile.size.desc(), "smallest": StoredFile.size.asc(), "newest": StoredFile.created_at.desc(),
         "oldest": StoredFile.created_at.asc(), "name": StoredFile.filename.asc()}


def _label(purpose: str) -> str:
    return PURPOSES.get(purpose, (purpose.replace("_", " ").capitalize(), "other"))[0]


async def summary(db: AsyncSession, school_id: uuid.UUID) -> dict:
    school = await db.get(School, school_id)
    rows = (await db.execute(select(StoredFile.purpose, func.count(), func.coalesce(func.sum(StoredFile.size), 0))
                             .where(StoredFile.school_id == school_id).group_by(StoredFile.purpose))).all()
    used = sum(int(b) for _, _, b in rows)
    limit = storage_service.limit_bytes(school)
    kinds = sorted(({"purpose": p, "label": _label(p), "group": PURPOSES.get(p, ("", "other"))[1], "files": n, "bytes": int(b)}
                    for p, n, b in rows), key=lambda k: -k["bytes"])
    groups: dict[str, dict] = {}
    for k in kinds:
        g = groups.setdefault(k["group"], {"group": k["group"], "files": 0, "bytes": 0})
        g["files"] += k["files"]
        g["bytes"] += k["bytes"]
    return {"used": used, "limit": limit, "free": max(limit - used, 0), "files": sum(k["files"] for k in kinds),
            "plan_name": school.plan.name, "storage_gb": school.plan.storage_gb,
            "groups": sorted(groups.values(), key=lambda g: -g["bytes"]), "kinds": kinds}


async def _owners(db: AsyncSession, files: list[StoredFile]) -> dict[uuid.UUID, str]:
    """Who or what each file belongs to: the student, the person, the homework, and so on. One query per kind."""
    by: dict[str, set] = {}
    for f in files:
        if f.owner_id:
            by.setdefault(f.purpose, set()).add(f.owner_id)
    out: dict[uuid.UUID, str] = {}

    async def put(ids, stmt):
        if ids:
            out.update({i: str(n) for i, n in (await db.execute(stmt)).all()})

    students = by.get("student_photo", set()) | by.get("student_document", set())
    await put(students, select(Student.id, func.concat(Student.first_name, " ", Student.last_name)).where(Student.id.in_(students)))
    await put(by.get("user_photo"), select(User.id, User.full_name).where(User.id.in_(by.get("user_photo", set()))))
    await put(by.get("homework"), select(Homework.id, Homework.title).where(Homework.id.in_(by.get("homework", set()))))
    await put(by.get("compliance_doc"), select(ComplianceDoc.id, ComplianceDoc.title).where(ComplianceDoc.id.in_(by.get("compliance_doc", set()))))
    await put(by.get("voucher"), select(AccountEntry.id, func.concat("Voucher ", AccountEntry.voucher_no)).where(AccountEntry.id.in_(by.get("voucher", set()))))
    await put(by.get("visitor_photo"), select(Visitor.id, Visitor.name).where(Visitor.id.in_(by.get("visitor_photo", set()))))
    await put(by.get("worker_photo"), select(Worker.id, Worker.name).where(Worker.id.in_(by.get("worker_photo", set()))))
    return out


async def list_files(db: AsyncSession, school_id: uuid.UUID, page, *, purpose: str | None, group: str | None, search: str | None,
                     sort: str) -> tuple[list[dict], PageMeta]:
    q = select(StoredFile).where(StoredFile.school_id == school_id)
    if purpose:
        q = q.where(StoredFile.purpose == purpose)
    if group:
        q = q.where(StoredFile.purpose.in_([p for p, (_, g) in PURPOSES.items() if g == group]))
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(StoredFile.filename.ilike(like), StoredFile.label.ilike(like)))
    total = await db.scalar(select(func.count()).select_from(q.subquery())) or 0
    files = list((await db.scalars(q.order_by(SORTS.get(sort, SORTS["largest"]), StoredFile.id).offset(page.offset).limit(page.page_size))).all())
    owners = await _owners(db, files)
    uploaders = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_({f.uploaded_by for f in files if f.uploaded_by})))).all()) \
        if files else {}
    rows = [{"id": f.id, "filename": f.filename, "content_type": f.content_type, "size": f.size, "label": f.label,
             "purpose": f.purpose, "purpose_label": _label(f.purpose), "group": PURPOSES.get(f.purpose, ("", "other"))[1],
             "owner": owners.get(f.owner_id) if f.owner_id else None, "uploaded_by": uploaders.get(f.uploaded_by),
             "created_at": f.created_at} for f in files]
    return rows, PageMeta(total=total, page=page.page, page_size=page.page_size)


async def delete_files(db: AsyncSession, user: User, ids: list[uuid.UUID]) -> dict:
    """Remove files and free their space. Each file's feature is told (a deleted photo leaves the profile)."""
    if not ids:
        raise BadRequest("Choose at least one file", code="NO_FILES")
    files = list((await db.scalars(select(StoredFile).where(StoredFile.school_id == user.school_id, StoredFile.id.in_(ids)))).all())
    freed = 0
    for f in files:
        rules = storage_service._PURPOSES.get(f.purpose)
        owner_id, size, name, purpose = f.owner_id, f.size, f.filename, f.purpose
        await storage_service.delete_file(db, f)
        await db.flush()
        if rules and rules.on_change:
            await rules.on_change(db, user, owner_id, None)
        freed += size
        await audit_service.record(db, "storage.delete", school_id=user.school_id, user_id=user.id, entity_type="file",
                                   meta={"filename": name, "purpose": purpose, "size": size})
    return {"deleted": len(files), "freed": freed}
