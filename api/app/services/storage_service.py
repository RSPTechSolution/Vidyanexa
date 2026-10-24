"""Uploaded files: kept in the file store (a bucket in production, see blob_store), described in the `files` table,
guarded by per-purpose rules, and counted against the school's plan storage.

Each purpose registers who may upload and who may read. Modules add their own purposes with
`register_purpose`, so the rules live next to the feature they protect.
"""
import io
import logging
import mimetypes
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError, Forbidden, NotFound
from app.core.permissions import STAFF_ROLES, has_permission
from app.models import School, StoredFile, User
from app.services import blob_store

log = logging.getLogger(__name__)
GB = 1024 ** 3

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
}
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

Check = Callable[[AsyncSession, User, uuid.UUID | None], Awaitable[bool]]


@dataclass
class Purpose:
    can_upload: Check
    can_read: Check
    images_only: bool = False
    single: bool = False  # e.g. a photo: uploading replaces the previous one
    # Called with the new file id after an upload, or None after a delete (e.g. to set student.photo_file_id).
    on_change: Callable[[AsyncSession, User, uuid.UUID | None, uuid.UUID | None], Awaitable[None]] | None = None


_PURPOSES: dict[str, Purpose] = {}


def register_purpose(name: str, purpose: Purpose) -> None:
    _PURPOSES[name] = purpose


# ---- plan storage ------------------------------------------------------------------------------

async def used_bytes(db: AsyncSession, school_id: uuid.UUID) -> int:
    """Everything the school has uploaded, in bytes."""
    return int(await db.scalar(select(func.coalesce(func.sum(StoredFile.size), 0)).where(StoredFile.school_id == school_id)) or 0)


def limit_bytes(school: School) -> int:
    return school.plan.storage_gb * GB


def fmt_size(n: int) -> str:
    for unit, size in (("GB", GB), ("MB", 1024 ** 2), ("KB", 1024)):
        if n >= size:
            return f"{n / size:.1f} {unit}".replace(".0 ", " ")
    return f"{n} bytes"


async def _check_space(db: AsyncSession, school: School, adding: int, freeing: int) -> tuple[int, int]:
    """Refuse an upload that would take the school past its plan's storage. Returns (used before, used after)."""
    used = await used_bytes(db, school.id)
    after = used - freeing + adding
    limit = limit_bytes(school)
    if after > limit and adding > freeing:
        raise AppError(
            f"Your school's storage is full ({fmt_size(used)} of {school.plan.storage_gb} GB on the {school.plan.name} plan). "
            "Remove files you no longer need, or upgrade your plan for more space.",
            code="STORAGE_FULL", status_code=413, details={"used": used, "limit": limit})
    return used, after


async def _warn_if_crossed(db: AsyncSession, school: School, before: int, after: int) -> None:
    """Tell the school's admins once, when their files first pass the warning level or fill the plan."""
    limit = limit_bytes(school)
    warn = limit * settings.STORAGE_WARN_PERCENT // 100
    if before < limit <= after:
        title = "Your school's storage is full"
        body = f"{fmt_size(after)} of {school.plan.storage_gb} GB is used. New uploads are paused until you free up space or upgrade."
    elif before < warn <= after:
        title = f"Your school has used {settings.STORAGE_WARN_PERCENT}% of its storage"
        body = f"{fmt_size(after)} of {school.plan.storage_gb} GB is used. Remove old files or upgrade before it fills up."
    else:
        return
    from app.services import notification_service
    admins = (await db.scalars(select(User.id).where(User.school_id == school.id, User.role == "school_admin",
                                                     User.is_active.is_(True), User.deleted_at.is_(None)))).all()
    await notification_service.notify(db, admins, school_id=school.id, kind="storage", title=title, body=body, link="/settings/billing")


# ---- pictures ----------------------------------------------------------------------------------

SHRINKABLE = {"image/jpeg", "image/png", "image/webp"}


def shrink_image(data: bytes, content_type: str, max_px: int | None = None, fmt: str = "WEBP") -> tuple[bytes, str]:
    """A phone photo (often 3-5 MB) becomes a WebP of a few hundred KB: turned upright, made to fit `max_px`, and stripped
    of hidden details such as where it was taken. Kept as it was if that isn't smaller or it can't be read."""
    if content_type not in SHRINKABLE:
        return data, content_type
    from PIL import Image, ImageOps

    max_px = max_px or settings.IMAGE_MAX_PX
    try:
        with Image.open(io.BytesIO(data)) as src:
            if getattr(src, "is_animated", False):
                return data, content_type
            im = ImageOps.exif_transpose(src)
            im.thumbnail((max_px, max_px))
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA" if "A" in im.getbands() or im.info.get("transparency") is not None else "RGB")
            out = io.BytesIO()
            if fmt == "PNG":
                im.save(out, "PNG", optimize=True)
            else:
                im.save(out, "WEBP", quality=82, method=4)
    except Exception:  # not really an image, or one Pillow can't read: keep the original
        log.info("image not shrunk", exc_info=True)
        return data, content_type
    small = out.getvalue()
    kind = "image/png" if fmt == "PNG" else "image/webp"
    must_convert = fmt == "PNG" and content_type != kind  # a logo must end up PNG, even if that's a little bigger
    return (small, kind) if must_convert or len(small) < len(data) else (data, content_type)


async def save(db: AsyncSession, user: User, *, purpose: str, owner_id: uuid.UUID | None, filename: str,
               content_type: str | None, data: bytes, label: str | None = None) -> StoredFile:
    rules = _PURPOSES.get(purpose)
    if not rules:
        raise AppError("Unknown upload type", code="BAD_PURPOSE", status_code=422)
    if not await rules.can_upload(db, user, owner_id):
        raise Forbidden("You can't upload this file", code="UPLOAD_FORBIDDEN")
    content_type = (content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream").split(";")[0].lower()
    if content_type not in (IMAGE_TYPES if rules.images_only else ALLOWED_TYPES):
        raise AppError("Choose an image (JPG, PNG or WebP)" if rules.images_only else
                       "That file type isn't allowed. Use an image, PDF, Word, Excel, PowerPoint or text file.",
                       code="FILE_TYPE", status_code=422)
    if not data:
        raise AppError("The file is empty", code="FILE_EMPTY", status_code=422)
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise AppError(f"Files can be at most {settings.MAX_UPLOAD_MB} MB", code="FILE_TOO_BIG", status_code=413)

    # The school logo appears in every email, and Outlook can't show WebP: logos stay PNG (and small).
    logo = purpose == "school_logo"
    data, new_type = shrink_image(data, content_type, 512 if logo else None, "PNG" if logo else "WEBP")
    if new_type != content_type:
        content_type = new_type
        filename = str(Path(filename).with_suffix(".png" if new_type == "image/png" else ".webp"))

    replaced = list((await db.scalars(select(StoredFile).where(StoredFile.purpose == purpose, StoredFile.owner_id == owner_id))).all()) \
        if rules.single and owner_id else []
    school = await db.get(School, user.school_id) if user.school_id else None
    if school:
        before, after = await _check_space(db, school, len(data), sum(f.size for f in replaced))
    ext = Path(filename).suffix.lower()[:10] or (mimetypes.guess_extension(content_type) or "")
    key = f"{user.school_id or 'platform'}/{purpose}/{uuid.uuid4().hex}{ext}"
    await blob_store.files().put(key, data, content_type)
    for old in replaced:  # only once the new one is safely stored
        await delete_file(db, old)
    f = StoredFile(school_id=user.school_id, purpose=purpose, owner_id=owner_id, filename=Path(filename).name[:255] or "file",
                   content_type=content_type, size=len(data), storage_key=key, label=label, uploaded_by=user.id)
    db.add(f)
    await db.flush()
    if school:
        await _warn_if_crossed(db, school, before, after)
    if rules.on_change:
        await rules.on_change(db, user, owner_id, f.id)
    return f


async def get_readable(db: AsyncSession, user: User, file_id: uuid.UUID) -> StoredFile:
    f = await db.scalar(select(StoredFile).where(StoredFile.id == file_id))
    if not f or (f.school_id and f.school_id != user.school_id):
        raise NotFound("File not found")
    rules = _PURPOSES.get(f.purpose)
    if f.uploaded_by != user.id and not (rules and await rules.can_read(db, user, f.owner_id)):
        raise NotFound("File not found")
    return f


def media_url(f: StoredFile, *, download: bool = False, minutes: int | None = None) -> str | None:
    """A signed link to the file on the media domain, or None when files aren't served from there. The link carries when
    it expires and how to show the file (inline or as a download, under its own name); the Worker checks the signature
    over all of it, so none of it can be changed. Expiry is rounded up to a whole window so the link (and the browser's
    and the edge's cached copy) stays the same for a while."""
    if not (settings.MEDIA_BASE_URL and settings.MEDIA_SIGNING_SECRET and settings.STORAGE_BACKEND == "s3"):
        return None
    import hashlib
    import hmac
    import time
    from urllib.parse import quote, urlencode

    window = (minutes or settings.MEDIA_LINK_MINUTES) * 60
    exp = (int(time.time()) // window + 2) * window
    d = "1" if download else "0"
    message = "\n".join([f.storage_key, str(exp), d, f.filename]).encode()
    sig = hmac.new(settings.MEDIA_SIGNING_SECRET.encode(), message, hashlib.sha256).hexdigest()
    query = urlencode({"exp": exp, "d": d, "n": f.filename, "sig": sig}, quote_via=quote)
    return f"{settings.MEDIA_BASE_URL.rstrip('/')}/{quote(f.storage_key)}?{query}"


async def read_bytes(f: StoredFile) -> bytes:
    return await blob_store.files().get(f.storage_key)


async def delete_file(db: AsyncSession, f: StoredFile) -> None:
    try:
        await blob_store.files().delete(f.storage_key)
    except NotFound:
        pass
    except Exception:  # the row goes either way; a stray object only costs a little space
        log.warning("Could not delete %s from storage", f.storage_key, exc_info=True)
    await db.delete(f)


async def remove(db: AsyncSession, user: User, f: StoredFile) -> None:
    """Delete a file the user asked to remove (checks rights, then tells the owner it is gone)."""
    if not await can_delete(db, user, f):
        raise Forbidden("You can't remove this file", code="DELETE_FORBIDDEN")
    rules = _PURPOSES.get(f.purpose)
    owner_id = f.owner_id
    await delete_file(db, f)
    await db.flush()
    if rules and rules.on_change:
        await rules.on_change(db, user, owner_id, None)


async def can_delete(db: AsyncSession, user: User, f: StoredFile) -> bool:
    rules = _PURPOSES.get(f.purpose)
    return f.uploaded_by == user.id or bool(rules and await rules.can_upload(db, user, f.owner_id))


async def list_for(db: AsyncSession, user: User, purpose: str, owner_id: uuid.UUID) -> list[StoredFile]:
    rules = _PURPOSES.get(purpose)
    if not rules or not await rules.can_read(db, user, owner_id):
        raise NotFound("Not found")
    return list((await db.scalars(select(StoredFile).where(StoredFile.school_id == user.school_id, StoredFile.purpose == purpose,
                                                           StoredFile.owner_id == owner_id).order_by(StoredFile.created_at))).all())


# ---- built-in purposes ------------------------------------------------------------------------

async def _is_staff(db, user, owner_id) -> bool:
    return user.role in STAFF_ROLES


async def _anyone(db, user, owner_id) -> bool:
    return True


async def _self_or_users_manager(db, user, owner_id) -> bool:
    return owner_id == user.id or has_permission(user.role, "users.manage")


async def _school_manager(db, user, owner_id) -> bool:
    return has_permission(user.role, "school.manage")


async def _set_user_photo(db, user, owner_id, file_id) -> None:
    from sqlalchemy import update
    await db.execute(update(User).where(User.id == owner_id, User.school_id == user.school_id).values(photo_file_id=file_id))


async def _set_school_logo(db, user, owner_id, file_id) -> None:
    from app.models import School
    school = await db.get(School, user.school_id)
    if school:
        school.logo_url = f"{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/files/public/{file_id}" if file_id else None


register_purpose("user_photo", Purpose(can_upload=_self_or_users_manager, can_read=_anyone, images_only=True, single=True,
                                       on_change=_set_user_photo))
register_purpose("school_logo", Purpose(can_upload=_school_manager, can_read=_anyone, images_only=True, single=True,
                                        on_change=_set_school_logo))
PUBLIC_PURPOSES = {"school_logo"}  # served without signing in (the public website shows the logo)
