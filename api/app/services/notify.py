"""Which emails go out when something happens. Services call these; nothing here raises."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import FeeInvoice, FeePayment, School, SchoolClass, Section, Student, StudentGuardian, User
from app.services import email_service, email_templates as t

log = logging.getLogger("eduvia.notify")

ROLE_LABELS = {
    "school_admin": "School admin", "principal": "Principal", "teacher": "Teacher", "accountant": "Accountant",
    "receptionist": "Receptionist", "librarian": "Librarian", "hr_manager": "HR manager",
    "transport_manager": "Transport manager", "security_guard": "Security guard", "staff": "Staff",
    "driver": "Driver", "parent": "Parent", "student": "Student",
}


async def _school(db: AsyncSession, school_id) -> School | None:
    return await db.get(School, school_id) if school_id else None


async def _sms(db: AsyncSession, user: User, kind: str, body: str) -> None:
    """A text to the person's own mobile, for things they must know about their account (always sent, whatever the
    school's message settings: these aren't announcements). Logged only while SMS_PROVIDER is "console"."""
    if user.phone and user.school_id:
        from app.services import sms_service
        await sms_service.queue(db, school_id=user.school_id, event_name=kind, phones=[user.phone], force=["sms"], body=body)


async def account_created(db: AsyncSession, user: User, password: str) -> None:
    """Welcome email and SMS with the temporary password (people sign in with their email)."""
    school = await _school(db, user.school_id)
    if not school:
        return
    await email_service.queue(db, t.welcome(to=user.email, name=user.full_name, role_label=ROLE_LABELS.get(user.role, user.role),
                                            school_name=school.name, password=password),
                              school_id=school.id)
    await _sms(db, user, "account", f"{school.name}: your Vidyanexa account is ready. Sign in with {user.email} and temporary password "
                                    f"{password} at {settings.APP_URL}/login or in the Vidyanexa app.")


async def password_set(db: AsyncSession, user: User, password: str) -> None:
    school = await _school(db, user.school_id)
    if not school:
        return
    await email_service.queue(db, t.password_set_by_school(to=user.email, name=user.full_name, school_name=school.name,
                                                           password=password), school_id=school.id)
    await _sms(db, user, "account", f"{school.name}: the school set a new Vidyanexa password for you. "
                                    f"Temporary password {password}. Not expecting this? Contact the school office.")


async def password_changed(db: AsyncSession, user: User) -> None:
    """A security notice after the password changes (by the person, or through a reset link)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    school = await _school(db, user.school_id)
    when = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%d %b %Y at %I:%M %p IST")
    await email_service.queue(db, t.password_changed(to=user.email, name=user.full_name, school_name=school.name if school else None,
                                                     when=when), school_id=user.school_id)
    await _sms(db, user, "account", f"Your Vidyanexa password was changed on {when}. Not you? Reset it from the sign-in page now "
                                    "and tell your school office.")


async def signup_code(db: AsyncSession, user: User, school: School, code: str) -> None:
    """The code that confirms a new school's email (and mobile, when given) before the school can be used."""
    await email_service.queue(db, t.signup_code(to=user.email, name=user.full_name, school_name=school.name, code=code,
                                                minutes=settings.OTP_EXPIRE_MINUTES), school_id=school.id)
    await _sms(db, user, "signup", f"{code} is your Vidyanexa code to confirm {school.name}. It expires in "
                                   f"{settings.OTP_EXPIRE_MINUTES} minutes. Don't share it.")


async def school_ready(db: AsyncSession, user: User, school: School) -> None:
    from app.core import pricing
    await email_service.queue(db, t.school_ready(to=user.email, name=user.full_name, school_name=school.name,
                                                 trial_days=pricing.TRIAL_DAYS), school_id=school.id)


async def password_reset(db: AsyncSession, user: User, token: str) -> None:
    school = await _school(db, user.school_id)
    await email_service.queue(db, t.password_reset(to=user.email, name=user.full_name, school_name=school.name if school else None,
                                                   token=token, minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES),
                              school_id=user.school_id)


async def login_code(db: AsyncSession, user: User, code: str, *, by_sms: bool) -> None:
    school = await _school(db, user.school_id)
    await email_service.queue(db, t.login_code(to=user.email, name=user.full_name, school_name=school.name if school else None, code=code,
                                               minutes=settings.OTP_EXPIRE_MINUTES), school_id=user.school_id)
    if by_sms and user.phone and user.school_id:
        from app.services import sms_service
        await sms_service.queue(db, school_id=user.school_id, event_name="login", phones=[user.phone], force=["sms"],
                                body=f"{code} is your Vidyanexa sign-in code. It expires in {settings.OTP_EXPIRE_MINUTES} minutes. Don't share it.")


async def fee_paid(db: AsyncSession, payment: FeePayment, invoice: FeeInvoice) -> None:
    """Receipt to every parent of the student who has an email (and the student's own login)."""
    school = await _school(db, invoice.school_id)
    student = await db.get(Student, invoice.student_id)
    if not school or not student:
        return
    row = (await db.execute(select(SchoolClass.name, Section.name).join(Section, Section.class_id == SchoolClass.id)
                            .where(Section.id == student.section_id))).first()
    class_section = f"{row[0]} – {row[1]}" if row else ""
    recipients = (await db.execute(select(User.email, User.full_name).join(StudentGuardian, StudentGuardian.user_id == User.id)
                                   .where(StudentGuardian.student_id == student.id, User.is_active.is_(True)))).all()
    balance = max(invoice.total - invoice.discount - invoice.paid, 0)
    method = {"cash": "Cash", "upi": "UPI", "cheque": "Cheque", "card": "Card", "bank_transfer": "Bank transfer", "online": "Online"}.get(payment.method, payment.method)
    from app.services import notification_service, sms_service
    await sms_service.queue(db, school_id=school.id, event_name="fee_receipt", phones=await sms_service.family_phones(db, [student.id]),
                            body=f"{school.name}: received Rs. {payment.amount:,.2f} for {student.first_name}, receipt {payment.receipt_no}. Thank you.")
    await notification_service.notify(db, await notification_service.family_of(db, [student.id]), school_id=school.id, kind="fee_receipt",
                                      title=f"Fee received: ₹{payment.amount:,.2f}",
                                      body=f"{student.first_name} {student.last_name} · {invoice.term} · receipt {payment.receipt_no}",
                                      link="/my-fees", data={"payment_id": payment.id})
    for email, name in recipients:
        await email_service.queue(db, t.fee_receipt(
            to=email, name=name, school_name=school.name, student=f"{student.first_name} {student.last_name}", class_section=class_section,
            term=invoice.term, receipt_no=payment.receipt_no, amount=payment.amount, method=method, paid_at=payment.paid_at,
            balance=balance, payment_id=str(payment.id)), school_id=school.id)
