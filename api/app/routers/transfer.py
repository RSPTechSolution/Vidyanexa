"""CSV import and export for students (with parents), parents and staff."""
from datetime import date

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.core.deps import DB, CurrentUser, require_module, require_permission
from app.schemas.common import ApiResponse, ok
from app.services import transfer_service as svc

router = APIRouter()


class ImportRequest(BaseModel):
    csv: str = Field(min_length=1, max_length=2_000_000)  # the file's text; about 1,000 rows at most
    dry_run: bool = True  # check only; nothing is saved
    send_emails: bool = False  # email each new account its login details


def _csv(text: str, name: str) -> Response:
    return Response(text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}-{date.today().isoformat()}.csv"'})


class ImportField(BaseModel):
    key: str  # the column name the import reads
    label: str
    required: bool
    hint: str | None = None


def _fields(columns: list[str], required: list[str], hints: dict[str, str]) -> list[ImportField]:
    return [ImportField(key=c, label=svc.FIELD_LABELS.get(c, c.replace("_", " ").capitalize()), required=c in required, hint=hints.get(c))
            for c in columns]


@router.get("/students/fields", response_model=ApiResponse[list[ImportField]], dependencies=[require_module("students")])
async def students_fields(current: CurrentUser = require_permission("students.manage")):
    """What a student import can fill in: the mapping screen matches the columns of any CSV to these."""
    return ok(_fields(svc.STUDENT_COLUMNS, svc.STUDENT_REQUIRED, svc.STUDENT_HINTS))


@router.get("/staff/fields", response_model=ApiResponse[list[ImportField]])
async def staff_fields(current: CurrentUser = require_permission("users.manage")):
    return ok(_fields(svc.STAFF_COLUMNS, svc.STAFF_REQUIRED, svc.STAFF_HINTS))


@router.get("/students/template", dependencies=[require_module("students")])
async def students_template(current: CurrentUser = require_permission("students.manage")):
    return _csv(svc.student_template(), "students-template")


@router.get("/students/export", dependencies=[require_module("students")])
async def students_export(db: DB, current: CurrentUser = require_permission("students.view")):
    return _csv(await svc.export_students(db, current.require_school()), "students")


@router.post("/students/import", response_model=ApiResponse[svc.ImportResult], dependencies=[require_module("students")])
async def students_import(body: ImportRequest, db: DB, current: CurrentUser = require_permission("students.manage")):
    return ok(await svc.import_students(db, current.require_school(), body.csv, dry_run=body.dry_run,
                                        send_emails=body.send_emails, actor_id=current.id))


@router.get("/parents/export", dependencies=[require_module("students")])
async def parents_export(db: DB, current: CurrentUser = require_permission("students.view")):
    return _csv(await svc.export_parents(db, current.require_school()), "parents")


@router.get("/staff/template")
async def staff_template(current: CurrentUser = require_permission("users.manage")):
    return _csv(svc.staff_template(), "staff-template")


@router.get("/staff/export")
async def staff_export(db: DB, current: CurrentUser = require_permission("users.view")):
    return _csv(await svc.export_staff(db, current.require_school()), "staff")


@router.post("/staff/import", response_model=ApiResponse[svc.ImportResult])
async def staff_import(body: ImportRequest, db: DB, current: CurrentUser = require_permission("users.manage")):
    return ok(await svc.import_staff(db, current.require_school(), body.csv, dry_run=body.dry_run,
                                     send_emails=body.send_emails, actor_id=current.id))
