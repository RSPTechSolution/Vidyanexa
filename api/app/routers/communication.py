"""Notices and homework."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends

from app.core.deps import DB, CurrentUser, require_module, require_permission
from app.schemas.common import ApiResponse, Message, PageParams, ok
from app.schemas.communication import (
    AssignTarget, CheckSave, FamilyDone, HomeworkDetail, HomeworkIn, HomeworkOut, HomeworkUpdate, MyHomework, NoticeIn, NoticeOut,
)
from app.services import homework_service, notice_service

notices = APIRouter(dependencies=[require_module("communication")])
homework = APIRouter(dependencies=[require_module("academics")])


# ---- notices (everyone signed in to a school can read the ones meant for them) ------------------

@notices.get("", response_model=ApiResponse[list[NoticeOut]])
async def list_notices(db: DB, page: PageParams = Depends(), unread: bool = False, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    rows, meta = await notice_service.list_notices(db, current.user, page, unread_only=unread)
    return ok(rows, meta)


@notices.get("/unread-count", response_model=ApiResponse[dict])
async def unread_count(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok({"count": await notice_service.unread_count(db, current.user)})


@notices.get("/sections", response_model=ApiResponse[list[dict]])
async def postable(db: DB, current: CurrentUser = require_permission("notices.post")):
    """Classes this user can post a notice to."""
    current.require_school()
    return ok(await notice_service.postable_sections(db, current.user))


@notices.post("", response_model=ApiResponse[NoticeOut], status_code=201)
async def create(body: NoticeIn, db: DB, current: CurrentUser = require_permission("notices.post")):
    current.require_school()
    return ok(await notice_service.create(db, current.user, body))


@notices.put("/{notice_id}", response_model=ApiResponse[NoticeOut])
async def update(notice_id: uuid.UUID, body: NoticeIn, db: DB, current: CurrentUser = require_permission("notices.post")):
    current.require_school()
    return ok(await notice_service.update(db, current.user, notice_id, body))


@notices.delete("/{notice_id}", response_model=ApiResponse[Message])
async def delete(notice_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("notices.post")):
    current.require_school()
    await notice_service.delete(db, current.user, notice_id)
    return ok(Message(message="Notice removed"))


@notices.post("/{notice_id}/read", response_model=ApiResponse[Message])
async def read(notice_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    await notice_service.read(db, current.user, notice_id)
    return ok(Message(message="Marked as read"))


# ---- homework ---------------------------------------------------------------------------------

@homework.get("/my", response_model=ApiResponse[list[MyHomework]])
async def mine(db: DB, current: CurrentUser = require_permission("school.view")):
    """A parent's children's homework, or a student's own: three weeks back and everything upcoming."""
    current.require_school()
    return ok(await homework_service.my_homework(db, current.user))


@homework.post("/{homework_id}/done", response_model=ApiResponse[Message])
async def done(homework_id: uuid.UUID, body: FamilyDone, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    await homework_service.family_done(db, current.user, homework_id, body)
    return ok(Message(message="Marked as done" if body.done else "Marked as not done"))


@homework.get("/targets", response_model=ApiResponse[list[AssignTarget]])
async def targets(db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    return ok(await homework_service.targets(db, current.user))


@homework.get("", response_model=ApiResponse[list[HomeworkOut]])
async def list_homework(db: DB, page: PageParams = Depends(), section_id: uuid.UUID | None = None,
                        view: Literal["mine", "class"] | None = None,
                        current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    rows, meta = await homework_service.list_homework(db, current.user, page, section_id=section_id, view=view)
    return ok(rows, meta)


@homework.post("", response_model=ApiResponse[HomeworkOut], status_code=201)
async def create_homework(body: HomeworkIn, db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    return ok(await homework_service.create(db, current.user, body))


@homework.get("/{homework_id}", response_model=ApiResponse[HomeworkDetail])
async def homework_detail(homework_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    return ok(await homework_service.detail(db, current.user, homework_id))


@homework.patch("/{homework_id}", response_model=ApiResponse[HomeworkDetail])
async def update_homework(homework_id: uuid.UUID, body: HomeworkUpdate, db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    await homework_service.update(db, current.user, homework_id, body)
    return ok(await homework_service.detail(db, current.user, homework_id))


@homework.delete("/{homework_id}", response_model=ApiResponse[Message])
async def delete_homework(homework_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    await homework_service.delete(db, current.user, homework_id)
    return ok(Message(message="Homework removed"))


@homework.put("/{homework_id}/check", response_model=ApiResponse[HomeworkDetail])
async def check(homework_id: uuid.UUID, body: CheckSave, db: DB, current: CurrentUser = require_permission("homework.manage")):
    current.require_school()
    return ok(await homework_service.check(db, current.user, homework_id, body))
