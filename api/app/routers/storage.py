"""The school's storage page (school admins): space used and left, every file, and removing them."""
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.deps import DB, CurrentUser, require_permission
from app.schemas.common import ApiResponse, PageParams, ok
from app.services import storage_admin_service as svc

router = APIRouter()


class StorageKind(BaseModel):
    purpose: str
    label: str
    group: str  # photos | documents | homework | other
    files: int
    bytes: int


class StorageGroup(BaseModel):
    group: str
    files: int
    bytes: int


class StorageSummary(BaseModel):
    used: int
    limit: int
    free: int
    files: int
    plan_name: str
    storage_gb: int
    groups: list[StorageGroup]
    kinds: list[StorageKind]


class StoredFileRow(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size: int
    label: str | None
    purpose: str
    purpose_label: str
    group: str
    owner: str | None  # the student, person, homework... it belongs to
    uploaded_by: str | None
    created_at: datetime


class DeleteFiles(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


class DeleteResult(BaseModel):
    deleted: int
    freed: int


@router.get("", response_model=ApiResponse[StorageSummary])
async def summary(db: DB, current: CurrentUser = require_permission("school.manage")):
    return ok(StorageSummary(**await svc.summary(db, current.require_school())))


@router.get("/files", response_model=ApiResponse[list[StoredFileRow]])
async def files(db: DB, page: PageParams = Depends(), purpose: str | None = Query(None, max_length=40),
                group: Literal["photos", "documents", "homework", "other"] | None = None,
                search: str | None = Query(None, max_length=100),
                sort: Literal["largest", "smallest", "newest", "oldest", "name"] = "largest",
                current: CurrentUser = require_permission("school.manage")):
    rows, meta = await svc.list_files(db, current.require_school(), page, purpose=purpose, group=group, search=search, sort=sort)
    return ok([StoredFileRow(**r) for r in rows], meta)


@router.post("/delete", response_model=ApiResponse[DeleteResult])
async def delete(body: DeleteFiles, db: DB, current: CurrentUser = require_permission("school.manage")):
    current.require_school()
    return ok(DeleteResult(**await svc.delete_files(db, current.user, body.ids)))
