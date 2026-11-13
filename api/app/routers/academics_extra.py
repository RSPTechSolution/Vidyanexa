"""Syllabus and lesson plans, certificates and ID cards, admission enquiries, promotion, substitutions."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, CurrentUser, require_module, require_permission
from app.schemas.academics_extra import (
    AbsentIn, CertificateIn, CertificateOut, ChildSyllabus, Clearance, CoverageRow, EnquiryIn, EnquiryNote, EnquiryOut, EnquirySummary,
    EnquiryUpdate, IdCardsRequest, LessonIn, LessonOut, LessonUpdate, ProgressSet, PromotionPreview, PromotionRequest,
    PromotionResult, SubstituteSet, SubstitutionDay, SubstitutionOut, SyllabusView, TopicIn, TopicsBulk, TopicUpdate,
)
from app.schemas.common import ApiResponse, Message, PageParams, ok
from app.schemas.timetable import AvailableTeacher
from app.services import (
    certificate_service, enquiry_service, pdf_service, promotion_service, substitution_service, syllabus_service,
)

syllabus = APIRouter(dependencies=[require_module("academics")])
lessons = APIRouter(dependencies=[require_module("academics")])
certificates = APIRouter(dependencies=[require_module("students")])
admissions = APIRouter(dependencies=[require_module("students")])
promotion = APIRouter(dependencies=[require_module("students")])
substitutions = APIRouter(dependencies=[require_module("academics")])


# ---- syllabus ---------------------------------------------------------------------------------

@syllabus.get("/coverage", response_model=ApiResponse[list[CoverageRow]])
async def coverage(db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.coverage(db, current.user))


@syllabus.get("/my", response_model=ApiResponse[list[ChildSyllabus]])
async def my_syllabus(db: DB, current: CurrentUser = require_permission("school.view")):
    """A parent's children, or a student's own class: how far each subject has got."""
    current.require_school()
    return ok(await syllabus_service.family_coverage(db, current.user))


@syllabus.get("/classes/{class_id}/subjects", response_model=ApiResponse[list[dict]])
async def class_subjects(class_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.subjects_for_class(db, current.user, class_id))


@syllabus.get("/classes/{class_id}/subjects/{subject_id}", response_model=ApiResponse[SyllabusView])
async def view(class_id: uuid.UUID, subject_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.view(db, current.user, class_id, subject_id))


@syllabus.post("/topics", response_model=ApiResponse[Message], status_code=201)
async def add_topic(body: TopicIn, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    await syllabus_service.add_topic(db, current.user, body)
    return ok(Message(message="Topic added"))


@syllabus.post("/topics/bulk", response_model=ApiResponse[dict], status_code=201)
async def add_topics(body: TopicsBulk, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok({"added": await syllabus_service.add_bulk(db, current.user, body)})


@syllabus.patch("/topics/{topic_id}", response_model=ApiResponse[Message])
async def update_topic(topic_id: uuid.UUID, body: TopicUpdate, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    await syllabus_service.update_topic(db, current.user, topic_id, body)
    return ok(Message(message="Topic saved"))


@syllabus.delete("/topics/{topic_id}", response_model=ApiResponse[Message])
async def delete_topic(topic_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    await syllabus_service.delete_topic(db, current.user, topic_id)
    return ok(Message(message="Topic removed"))


@syllabus.put("/progress", response_model=ApiResponse[Message])
async def progress(body: ProgressSet, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    await syllabus_service.set_progress(db, current.user, body)
    return ok(Message(message="Marked as done" if body.done else "Marked as not done"))


# ---- lesson plans -----------------------------------------------------------------------------

@lessons.get("", response_model=ApiResponse[list[LessonOut]])
async def list_lessons(db: DB, start: date = Query(alias="from"), end: date = Query(alias="to"), section_id: uuid.UUID | None = None,
                       teacher_id: uuid.UUID | None = None, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.list_lessons(db, current.user, start, end, section_id, teacher_id))


@lessons.post("", response_model=ApiResponse[LessonOut], status_code=201)
async def create_lesson(body: LessonIn, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.create_lesson(db, current.user, body))


@lessons.patch("/{lesson_id}", response_model=ApiResponse[LessonOut])
async def update_lesson(lesson_id: uuid.UUID, body: LessonUpdate, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.update_lesson(db, current.user, lesson_id, body))


@lessons.post("/{lesson_id}/taught", response_model=ApiResponse[LessonOut])
async def taught(lesson_id: uuid.UUID, db: DB, done: bool = True, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    return ok(await syllabus_service.mark_taught(db, current.user, lesson_id, done))


@lessons.delete("/{lesson_id}", response_model=ApiResponse[Message])
async def delete_lesson(lesson_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("syllabus.manage")):
    current.require_school()
    await syllabus_service.delete_lesson(db, current.user, lesson_id)
    return ok(Message(message="Lesson plan removed"))


# ---- certificates & ID cards --------------------------------------------------------------------

@certificates.get("", response_model=ApiResponse[list[CertificateOut]])
async def list_certificates(db: DB, student_id: uuid.UUID | None = None, kind: str | None = None,
                            current: CurrentUser = require_permission("certificates.manage")):
    current.require_school()
    return ok(await certificate_service.list_certificates(db, current.user, student_id, kind))


@certificates.post("", response_model=ApiResponse[CertificateOut], status_code=201)
async def issue(body: CertificateIn, db: DB, current: CurrentUser = require_permission("certificates.manage")):
    current.require_school()
    return ok(await certificate_service.issue(db, current.user, body))


@certificates.get("/clearance/{student_id}", response_model=ApiResponse[Clearance])
async def clearance(student_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("certificates.manage")):
    """What the student still owes or holds (fees, library, hostel, bus), checked before issuing any certificate."""
    current.require_school()
    return ok(await certificate_service.clearance(db, current.user, student_id))


@certificates.post("/{cert_id}/mark-left", response_model=ApiResponse[CertificateOut])
async def mark_left(cert_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("certificates.manage")):
    """After a transfer certificate: the student leaves (inactive; hostel bed and bus seat given up)."""
    current.require_school()
    return ok(await certificate_service.mark_left_after(db, current.user, cert_id))


@certificates.post("/id-cards")
async def id_cards(body: IdCardsRequest, db: DB, current: CurrentUser = require_permission("certificates.manage")):
    current.require_school()
    return pdf_service.pdf_response(await certificate_service.id_cards_pdf(db, current.user, body), "id-cards.pdf", True)


@certificates.get("/{cert_id}/pdf")
async def certificate_pdf(cert_id: uuid.UUID, db: DB, download: bool = False, current: CurrentUser = require_permission("school.view")):
    """The office any time; the student's family for certificates still valid."""
    current.require_school()
    data, name = await certificate_service.certificate_pdf(db, current.user, cert_id)
    return pdf_service.pdf_response(data, name, download)


@certificates.post("/{cert_id}/cancel", response_model=ApiResponse[Message])
async def cancel(cert_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("certificates.manage")):
    current.require_school()
    await certificate_service.cancel(db, current.user, cert_id)
    return ok(Message(message="Certificate cancelled"))


# ---- admission enquiries ------------------------------------------------------------------------

@admissions.get("/summary", response_model=ApiResponse[EnquirySummary])
async def summary(db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    return ok(await enquiry_service.summary(db, current.user))


@admissions.get("", response_model=ApiResponse[list[EnquiryOut]])
async def list_enquiries(db: DB, page: PageParams = Depends(), status: str | None = None, search: str | None = None, due: bool = False,
                         current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    rows, meta = await enquiry_service.list_enquiries(db, current.user, page, status=status, search=search, due=due)
    return ok(rows, meta)


@admissions.post("", response_model=ApiResponse[EnquiryOut], status_code=201)
async def create_enquiry(body: EnquiryIn, db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    return ok(await enquiry_service.create(db, current.user, body))


@admissions.get("/{enquiry_id}", response_model=ApiResponse[EnquiryOut])
async def get_enquiry(enquiry_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    return ok(await enquiry_service.get(db, current.user, enquiry_id))


@admissions.patch("/{enquiry_id}", response_model=ApiResponse[EnquiryOut])
async def update_enquiry(enquiry_id: uuid.UUID, body: EnquiryUpdate, db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    return ok(await enquiry_service.update(db, current.user, enquiry_id, body))


@admissions.post("/{enquiry_id}/notes", response_model=ApiResponse[EnquiryOut])
async def add_note(enquiry_id: uuid.UUID, body: EnquiryNote, db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    return ok(await enquiry_service.add_note(db, current.user, enquiry_id, body.text))


@admissions.delete("/{enquiry_id}", response_model=ApiResponse[Message])
async def delete_enquiry(enquiry_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("admissions.manage")):
    current.require_school()
    await enquiry_service.delete(db, current.user, enquiry_id)
    return ok(Message(message="Enquiry removed"))


# ---- promotion --------------------------------------------------------------------------------

@promotion.get("/{section_id}", response_model=ApiResponse[PromotionPreview])
async def promotion_preview(section_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("students.promote")):
    current.require_school()
    return ok(await promotion_service.preview(db, current.user, section_id))


@promotion.post("", response_model=ApiResponse[PromotionResult])
async def promote(body: PromotionRequest, db: DB, current: CurrentUser = require_permission("students.promote")):
    current.require_school()
    return ok(await promotion_service.promote(db, current.user, body))


# ---- substitutions ----------------------------------------------------------------------------

@substitutions.get("/mine", response_model=ApiResponse[list[SubstitutionOut]])
async def my_covers(db: DB, current: CurrentUser = require_permission("school.view")):
    current.require_school()
    return ok(await substitution_service.mine(db, current.user))


@substitutions.get("", response_model=ApiResponse[SubstitutionDay])
async def substitution_day(db: DB, on: date = Query(alias="date"), current: CurrentUser = require_permission("substitutions.manage")):
    current.require_school()
    return ok(await substitution_service.day(db, current.user, on))


@substitutions.post("/absent", response_model=ApiResponse[SubstitutionDay])
async def absent(body: AbsentIn, db: DB, current: CurrentUser = require_permission("substitutions.manage")):
    current.require_school()
    return ok(await substitution_service.mark_absent(db, current.user, body.date, body.teacher_id))


@substitutions.post("/present", response_model=ApiResponse[SubstitutionDay])
async def present(body: AbsentIn, db: DB, current: CurrentUser = require_permission("substitutions.manage")):
    current.require_school()
    return ok(await substitution_service.clear_absent(db, current.user, body.date, body.teacher_id))


@substitutions.get("/{sub_id}/candidates", response_model=ApiResponse[list[AvailableTeacher]])
async def sub_candidates(sub_id: uuid.UUID, db: DB, current: CurrentUser = require_permission("substitutions.manage")):
    current.require_school()
    return ok(await substitution_service.candidates(db, current.user, sub_id))


@substitutions.put("/{sub_id}", response_model=ApiResponse[SubstitutionOut])
async def assign(sub_id: uuid.UUID, body: SubstituteSet, db: DB, current: CurrentUser = require_permission("substitutions.manage")):
    current.require_school()
    return ok(await substitution_service.assign(db, current.user, sub_id, body))

