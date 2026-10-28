"""Families asking their school to close their accounts (when a child moves school), and the school deciding."""
import uuid

from fastapi import APIRouter, Query

from app.core.deps import DB, CurrentUser, require_permission
from app.schemas.common import ApiResponse, ok
from app.schemas.user import AccountRequestDecision, AccountRequestIn, AccountRequestOut
from app.services import account_service as svc

router = APIRouter()


@router.get("", response_model=ApiResponse[list[AccountRequestOut]])
async def list_requests(db: DB, status: str | None = Query(None, max_length=20), current: CurrentUser = require_permission("school.view")):
    """A family's own requests; for the school office, everyone's."""
    return ok(await svc.list_requests(db, current.user, status))


@router.post("", response_model=ApiResponse[AccountRequestOut], status_code=201)
async def ask(body: AccountRequestIn, db: DB, current: CurrentUser = require_permission("school.view")):
    return ok(await svc.create_request(db, current.user, body.student_ids, body.reason))


@router.post("/{request_id}/decide", response_model=ApiResponse[AccountRequestOut])
async def decide(request_id: uuid.UUID, body: AccountRequestDecision, db: DB, current: CurrentUser = require_permission("students.manage")):
    return ok(await svc.decide(db, current.user, request_id, body.approve, body.note))


@router.post("/{request_id}/cancel", response_model=ApiResponse[AccountRequestOut])
async def cancel(request_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("school.view")):
    return ok(await svc.cancel(db, current.user, request_id))
