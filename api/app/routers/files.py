"""Uploads and downloads. Who may upload or read depends on the file's purpose (see storage_service)."""
import uuid
from urllib.parse import quote

from fastapi import APIRouter, File, Form, Response, UploadFile
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.core.config import settings
from app.core.database import elevated
from app.core.deps import DB, Auth
from app.core.errors import NotFound
from app.models import StoredFile
from app.schemas.common import ApiResponse, FileOut, Message, ok
from app.services import storage_service

router = APIRouter()


def _send(f: StoredFile, data: bytes, download: bool) -> Response:
    inline = not download and (f.content_type.startswith("image/") or f.content_type == "application/pdf")
    disposition = f"{'inline' if inline else 'attachment'}; filename*=UTF-8''{quote(f.filename)}"
    return Response(data, media_type=f.content_type, headers={
        "Content-Disposition": disposition, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


@router.post("", response_model=ApiResponse[FileOut], status_code=201)
async def upload(current: Auth, db: DB, file: UploadFile = File(...), purpose: str = Form(...),
                 owner_id: uuid.UUID | None = Form(None), label: str | None = Form(None, max_length=120)):
    current.require_school()
    data = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    f = await storage_service.save(db, current.user, purpose=purpose, owner_id=owner_id, filename=file.filename or "file",
                                   content_type=file.content_type, data=data, label=(label or "").strip() or None)
    return ok(FileOut.model_validate(f))


@router.get("", response_model=ApiResponse[list[FileOut]])
async def list_files(purpose: str, owner_id: uuid.UUID, current: Auth, db: DB):
    current.require_school()
    return ok([FileOut.model_validate(f) for f in await storage_service.list_for(db, current.user, purpose, owner_id)])


@router.get("/public/{file_id}")
async def public_file(file_id: uuid.UUID, db: DB):
    """Files that are public by nature, such as a school's logo."""
    async with elevated(db):
        f = await db.scalar(select(StoredFile).where(StoredFile.id == file_id, StoredFile.purpose.in_(storage_service.PUBLIC_PURPOSES)))
    if not f:
        raise NotFound("File not found")
    if url := storage_service.media_url(f, minutes=24 * 60):  # public by nature: a long-lived link
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "public, max-age=3600"})
    resp = _send(f, await storage_service.read_bytes(f), False)
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


@router.get("/{file_id}")
async def download(file_id: uuid.UUID, current: Auth, db: DB, download: bool = False):
    f = await storage_service.get_readable(db, current.user, file_id)
    # Allowed to see it: from the media domain when it's set up (faster, and off this server), else sent from here.
    if url := storage_service.media_url(f, download=download):
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": "private, max-age=300"})
    return _send(f, await storage_service.read_bytes(f), download)


@router.delete("/{file_id}", response_model=ApiResponse[Message])
async def delete(file_id: uuid.UUID, current: Auth, db: DB):
    f = await storage_service.get_readable(db, current.user, file_id)
    await storage_service.remove(db, current.user, f)
    return ok(Message(message="File removed"))
