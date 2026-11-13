"""SMS/WhatsApp settings and log, parent-teacher chat, parent-teacher meetings, surveys."""
import uuid

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser, require_module, require_permission, require_super_admin
from app.models import School
from app.schemas.common import ApiResponse, Message, ok
from app.schemas.messaging import (
    BookIn, ChatMessageOut, ChildSlots, Contact, ConversationIn, ConversationOut, MessageIn, MessageOut, MessagingSettings,
    MessagingStatus, PtmIn, PtmOut, ScheduleRow, SurveyAnswer, SurveyIn, SurveyOut, SurveyResults, TestMessage,
)
from app.services import messaging_service as svc
from app.services import sms_service

messaging = APIRouter()
chat = APIRouter(dependencies=[require_module("communication")])
ptm = APIRouter(dependencies=[require_module("communication")])
surveys = APIRouter(dependencies=[require_module("communication")])


# ---- SMS / WhatsApp ---------------------------------------------------------------------------

@messaging.get("/status", response_model=ApiResponse[MessagingStatus])
async def status(db: DB, current: CurrentUser = require_permission("emails.view")):
    school = await db.get(School, current.require_school())
    return ok(MessagingStatus(sms_provider=sms_service.provider("sms"), whatsapp_provider=sms_service.provider("whatsapp"),
                              events=sms_service.EVENTS, chosen=(school.settings or {}).get("messaging") or {},
                              today=await sms_service.counts_today(db, school.id)))


@messaging.put("/settings", response_model=ApiResponse[MessagingStatus])
async def save_settings(body: MessagingSettings, db: DB, current: CurrentUser = require_permission("emails.manage")):
    school = await db.get(School, current.require_school())
    school.settings = {**(school.settings or {}), "messaging": {k: v for k, v in body.events.items() if k in sms_service.EVENTS}}
    await db.flush()
    return await status(db, current)


@messaging.get("", response_model=ApiResponse[list[MessageOut]])
async def log(db: DB, current: CurrentUser = require_permission("emails.view")):
    rows = await sms_service.recent(db, current.require_school())
    return ok([MessageOut(id=r.id, channel=r.channel, to=r.to, body=r.body, kind=r.kind, status=r.status, error=r.error,
                          created_at=r.created_at) for r in rows])


@messaging.post("/test", response_model=ApiResponse[Message])
async def test(body: TestMessage, db: DB, current: CurrentUser = require_super_admin()):
    """Send a test SMS or WhatsApp (platform admin only: it checks the provider account, which schools don't manage)."""
    n = await sms_service.queue(db, school_id=None, event_name="test", phones=[body.phone], force=[body.channel],
                                body="Test message from Vidyanexa.")
    if not n:
        from app.services.academics_service import field_error
        raise field_error("phone", "Enter a valid mobile number")
    mode = "logged (no provider set up)" if sms_service.provider(body.channel) == "console" else "sent"
    return ok(Message(message=f"Test {body.channel} {mode}"))


# ---- chat -------------------------------------------------------------------------------------

@chat.get("/contacts", response_model=ApiResponse[list[Contact]])
async def contacts(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.contacts(db, current.user))


@chat.get("/conversations", response_model=ApiResponse[list[ConversationOut]])
async def conversations(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.conversations(db, current.user))


@chat.get("/unread-count", response_model=ApiResponse[dict])
async def unread(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok({"count": await svc.unread_total(db, current.user)})


@chat.post("/conversations", response_model=ApiResponse[ConversationOut], status_code=201)
async def start(body: ConversationIn, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.start(db, current.user, body.student_id, body.user_id, body.body))


@chat.get("/conversations/{cid}/messages", response_model=ApiResponse[list[ChatMessageOut]])
async def messages(cid: uuid.UUID, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.messages(db, current.user, cid))


@chat.post("/conversations/{cid}/messages", response_model=ApiResponse[ChatMessageOut], status_code=201)
async def send(cid: uuid.UUID, body: MessageIn, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.send(db, current.user, cid, body.body))


# ---- PTM --------------------------------------------------------------------------------------

@ptm.get("", response_model=ApiResponse[list[PtmOut]])
async def list_ptm(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.list_ptm(db, current.user))


@ptm.post("", response_model=ApiResponse[PtmOut], status_code=201)
async def create_ptm(body: PtmIn, db: DB, current: CurrentUser = require_permission("ptm.manage")):
    current.require_school()
    return ok(await svc.create_ptm(db, current.user, body))


@ptm.delete("/{eid}", response_model=ApiResponse[Message])
async def delete_ptm(eid: uuid.UUID, db: DB, current: CurrentUser = require_permission("ptm.manage")):
    current.require_school()
    await svc.delete_ptm(db, current.user, eid)
    return ok(Message(message="Meeting removed"))


@ptm.get("/{eid}/slots", response_model=ApiResponse[list[ChildSlots]])
async def slots(eid: uuid.UUID, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.child_slots(db, current.user, eid))


@ptm.post("/{eid}/book", response_model=ApiResponse[list[ChildSlots]])
async def book(eid: uuid.UUID, body: BookIn, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.book(db, current.user, eid, body.student_id, body.slot, body.note))


@ptm.delete("/{eid}/book/{student_id}", response_model=ApiResponse[list[ChildSlots]])
async def unbook(eid: uuid.UUID, student_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.cancel_booking(db, current.user, eid, student_id))


@ptm.get("/{eid}/schedule", response_model=ApiResponse[list[ScheduleRow]])
async def schedule(eid: uuid.UUID, db: DB, teacher_id: uuid.UUID | None = None, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.schedule(db, current.user, eid, teacher_id))


# ---- surveys ----------------------------------------------------------------------------------

@surveys.get("", response_model=ApiResponse[list[SurveyOut]])
async def list_surveys(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.list_surveys(db, current.user))


@surveys.post("", response_model=ApiResponse[SurveyOut], status_code=201)
async def create_survey(body: SurveyIn, db: DB, current: CurrentUser = require_permission("surveys.manage")):
    current.require_school()
    return ok(await svc.save_survey(db, current.user, body))


@surveys.put("/{sid}", response_model=ApiResponse[SurveyOut])
async def update_survey(sid: uuid.UUID, body: SurveyIn, db: DB, current: CurrentUser = require_permission("surveys.manage")):
    current.require_school()
    return ok(await svc.save_survey(db, current.user, body, sid))


@surveys.post("/{sid}/publish", response_model=ApiResponse[SurveyOut])
async def publish(sid: uuid.UUID, db: DB, on: bool = True, current: CurrentUser = require_permission("surveys.manage")):
    current.require_school()
    return ok(await svc.publish_survey(db, current.user, sid, on))


@surveys.delete("/{sid}", response_model=ApiResponse[Message])
async def delete_survey(sid: uuid.UUID, db: DB, current: CurrentUser = require_permission("surveys.manage")):
    current.require_school()
    await svc.delete_survey(db, current.user, sid)
    return ok(Message(message="Survey deleted"))


@surveys.post("/{sid}/respond", response_model=ApiResponse[SurveyOut])
async def respond(sid: uuid.UUID, body: SurveyAnswer, db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await svc.respond(db, current.user, sid, body.answers))


@surveys.get("/{sid}/results", response_model=ApiResponse[SurveyResults])
async def results(sid: uuid.UUID, db: DB, current: CurrentUser = require_permission("surveys.manage")):
    current.require_school()
    return ok(await svc.results(db, current.user, sid))
