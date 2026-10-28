"""The emails Vidyanexa sends. Each returns an Email with matching HTML and plain-text bodies.

HTML uses inline styles and tables only, which is what email clients reliably render.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from html import escape

from app.core.config import settings
from app.services.email_service import Email

NAVY = "#15233F"
GOLD = "#B8893C"
IVORY = "#F7F2E8"


FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
SERIF = "Georgia,'Times New Roman',serif"


@dataclass
class Brand:
    """How a school's emails look: its name, logo, colour and contact details at the top (design "Colour band")."""
    name: str
    color: str = NAVY
    logo_url: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None

    @property
    def initials(self) -> str:
        words = [w for w in re.split(r"\s+", self.name) if w and w[0].isalnum() and w.lower() not in {"of", "the", "and", "&"}]
        return "".join(w[0] for w in words[:2]).upper() or "S"


def brand_for(school) -> Brand:
    """The branding for a School row (Settings > School: logo, colour, address, phone, email)."""
    place = ", ".join(x for x in (school.address, school.city, school.state) if x)
    return Brand(name=school.name, color=(school.settings or {}).get("brand_color") or NAVY, logo_url=school.logo_url,
                 address=place or None, phone=school.phone, email=school.email)


def _header(brand: Brand | None) -> str:
    if not brand:  # platform emails (no school): Vidyanexa's own letterhead
        crest = f"{settings.APP_URL.rstrip('/')}/brand/crest-reverse.png"
        return (f'<tr><td style="background:{NAVY};padding:18px 28px;color:{IVORY};border-bottom:3px solid {GOLD}">'
                f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:14px;vertical-align:middle">'
                f'<img src="{crest}" width="34" height="38" alt="" style="display:block;border:0"></td>'
                f'<td style="vertical-align:middle"><div style="font:600 19px {SERIF};letter-spacing:3px">VIDYANEXA</div>'
                f'<div style="font:12px {FONT};color:#D9C9A6;margin-top:3px">School management</div></td></tr></table></td></tr>')
    c = escape(brand.color)
    if brand.logo_url:
        mark = f'<img src="{escape(brand.logo_url)}" width="38" height="38" alt="{escape(brand.name)}" style="display:block;border:0;width:38px;height:38px;object-fit:contain">'
    else:  # no logo: the school's initials in its colour
        mark = (f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:38px;height:38px;border-radius:9px;background:{c};'
                f'color:#ffffff;font:700 15px {SERIF};text-align:center;vertical-align:middle">{escape(brand.initials)}</td></tr></table>')
    band = (f'<tr><td style="background:{c};padding:22px 28px">'
            f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
            f'<td style="padding-right:14px;vertical-align:middle"><div style="background:#ffffff;border-radius:12px;padding:7px">{mark}</div></td>'
            f'<td style="vertical-align:middle"><div style="font:600 19px/1.25 {SERIF};color:#ffffff">{escape(brand.name)}</div>'
            + (f'<div style="font:12px/1.45 {FONT};color:rgba(255,255,255,0.85);margin-top:3px">{escape(brand.address)}</div>' if brand.address else "")
            + '</td></tr></table></td></tr>')
    contact = " · ".join(escape(x) for x in (brand.phone, brand.email) if x)
    if contact:
        band += (f'<tr><td style="padding:10px 28px;background:#f8fafc;border-bottom:1px solid #eef0f3;font:12px {FONT};color:#6b7280">'
                 f'{contact}</td></tr>')
    return band


def _footer(brand: Brand | None) -> str:
    crest = f"{settings.APP_URL.rstrip('/')}/brand/email-crest.png"
    who = (f"You're receiving this because you have an account at {escape(brand.name)}. If you weren't expecting it, you can ignore it."
           if brand else "This email was sent by Vidyanexa. If you weren't expecting it, you can ignore it.")
    return (f'<tr><td style="padding:16px 28px 18px;border-top:1px solid #eef0f3;font:12px/1.55 {FONT};color:#6b7280">{who}<br>'
            f'<span style="display:inline-block;margin-top:8px;color:#8a909c">'
            f'<img src="{crest}" width="14" height="16" alt="" style="display:inline-block;border:0;vertical-align:-3px">&nbsp; Sent using '
            f'<a href="https://www.vidyanexa.com" style="color:{NAVY};font-weight:600;text-decoration:none">Vidyanexa</a> · school management software'
            f'</span></td></tr>')


def _layout(*, title: str, brand: Brand | None, intro: list[str], rows: list[tuple[str, str]] | None = None,
            button: tuple[str, str] | None = None, outro: list[str] | None = None) -> str:
    accent = brand.color if brand else NAVY
    p = lambda t: f'<p style="margin:0 0 14px;font:15px/1.55 {FONT};color:#1f2937">{t}</p>'  # noqa: E731
    small = lambda t: f'<p style="margin:0 0 12px;font:13px/1.55 {FONT};color:#6b7280">{t}</p>'  # noqa: E731
    table = ""
    if rows:
        cells = "".join(
            f'<tr><td style="padding:9px 12px;color:#6b7280;font:13px {FONT};border-bottom:1px solid #eef0f3;width:42%">{escape(k)}</td>'
            f'<td style="padding:9px 12px;font:600 14px {FONT};color:#111827;border-bottom:1px solid #eef0f3">{escape(v)}</td></tr>'
            for k, v in rows)
        table = (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;'
                 f'border-radius:10px;margin:4px 0 18px">{cells}</table>')
    btn = ""
    if button:
        label, url = button
        btn = (f'<p style="margin:6px 0 22px"><a href="{escape(url)}" style="display:inline-block;background:{escape(accent)};color:#ffffff;'
               f'text-decoration:none;font:600 15px {FONT};padding:12px 22px;border-radius:10px">{escape(label)}</a></p>')
    return f"""<!doctype html><html><body style="margin:0;background:#eef0f4;font-family:{FONT}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
{_header(brand)}
<tr><td style="padding:24px 28px 8px">
<h1 style="margin:0 0 14px;font:600 21px/1.3 {SERIF};color:#111827">{escape(title)}</h1>
{"".join(p(x) for x in intro)}{table}{btn}{"".join(small(x) for x in (outro or []))}
</td></tr>
{_footer(brand)}
</table></td></tr></table></body></html>"""


def _text(title: str, intro: list[str], rows: list[tuple[str, str]] | None = None, button: tuple[str, str] | None = None,
          outro: list[str] | None = None, brand: Brand | None = None) -> str:
    parts: list[str] = []
    if brand:
        parts += [brand.name, *[x for x in (brand.address, " · ".join(y for y in (brand.phone, brand.email) if y)) if x], "", "—", ""]
    parts += [title, "", *intro]
    if rows:
        parts += ["", *[f"{k}: {v}" for k, v in rows]]
    if button:
        parts += ["", f"{button[0]}: {button[1]}"]
    if outro:
        parts += ["", *outro]
    parts += ["", "—", (f"You're receiving this because you have an account at {brand.name}." if brand else "Sent by Vidyanexa."),
              "Sent using Vidyanexa · https://www.vidyanexa.com"]
    return "\n".join(parts)


def first_name(name: str) -> str:
    """The name to greet someone by: "Dr. Rajesh Kumar" -> "Rajesh" (titles such as Dr., Mr., Mrs. and Prof. skipped)."""
    words = name.split()
    named = next((w for w in words if not re.fullmatch(r"(?i)(dr|mr|mrs|ms|miss|prof|sir|smt|shri|sri)\.?", w)), None)
    return named or (words[0] if words else "")


def _plain(s: str) -> str:
    """The plain-text version of a line that may contain tags such as <b> or <b style=...>."""
    return re.sub(r"</?[a-z][^>]*>", "", s)


def _build(*, to: str, to_name: str | None, subject: str, kind: str, title: str, school: str | None, intro: list[str],
           rows: list[tuple[str, str]] | None = None, button: tuple[str, str] | None = None, outro: list[str] | None = None) -> Email:
    """The email, in Vidyanexa's own design until it's queued for a school (email_service.queue then applies the school's
    branding with apply_brand). `school` is only the name, for messages that are never tied to a school record."""
    content = {"title": title, "intro": intro, "rows": list(rows or []), "button": button, "outro": outro or []}
    msg = Email(to=to, to_name=to_name, subject=subject, html="", text="", kind=kind, content=content)
    _render(msg, Brand(name=school) if school else None)
    return msg


def _render(msg: Email, brand: Brand | None) -> None:
    c = msg.content
    msg.html = _layout(title=c["title"], brand=brand, intro=c["intro"], rows=c["rows"], button=c["button"], outro=c["outro"])
    msg.text = _text(c["title"], [_plain(x) for x in c["intro"]], c["rows"], c["button"], [_plain(x) for x in c["outro"]], brand)


def apply_brand(msg: Email, school) -> None:
    """Dress an email in its school's branding: the colour band with logo and details on top, the school as the sender's
    name ("<School> via Vidyanexa"), and replies going to the school office."""
    if not msg.content:
        return
    brand = brand_for(school)
    _render(msg, brand)
    msg.from_name = f"{school.name} via Vidyanexa"[:120]
    msg.reply_to = school.email or None


def welcome(*, to: str, name: str, role_label: str, school_name: str, password: str) -> Email:
    first = escape(first_name(name))
    return _build(
        to=to, to_name=name, kind="welcome", school=school_name,
        subject=f"Your {school_name} account on Vidyanexa",
        title=f"Welcome, {first_name(name)}",
        intro=[f"Hello {first}, an account has been created for you at <b>{escape(school_name)}</b> as <b>{escape(role_label)}</b>.",
               "Use these details to sign in on the website or in the Vidyanexa app:"],
        rows=[("Email", to), ("Temporary password", password)],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["You'll be asked to choose your own password the first time you sign in. Please don't share these details."])


def password_set_by_school(*, to: str, name: str, school_name: str, password: str) -> Email:
    return _build(
        to=to, to_name=name, kind="password_set", school=school_name, subject="Your Vidyanexa password was reset",
        title="Your password was reset",
        intro=[f"Hello {escape(first_name(name))}, the school office has set a new temporary password for your account."],
        rows=[("Email", to), ("Temporary password", password)],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["You'll choose your own password when you sign in. If you didn't ask for this, contact the school office."])


def account_closure(*, to: str, name: str, school_name: str, approved: bool, note: str | None, closed: list[str]) -> Email:
    if approved:
        return _build(
            to=to, to_name=name, kind="account_closure", school=school_name, subject=f"Your accounts at {school_name} are closed",
            title="Accounts closed",
            intro=[f"Hello {escape(first_name(name))}, {escape(school_name)} has closed the accounts you asked about. "
                   "Their records stay with the school (for certificates and history), but these logins no longer work:"],
            rows=[("Email", e) for e in closed] + ([("Note from the school", note)] if note else []),
            outro=["Your new school can now add you with the same email. All the best for the move!"])
    return _build(
        to=to, to_name=name, kind="account_closure", school=school_name, subject=f"Your account closure request at {school_name}",
        title="Request declined",
        intro=[f"Hello {escape(first_name(name))}, {escape(school_name)} didn't approve your request to close your accounts."],
        rows=[("Note from the school", note)] if note else None,
        outro=["Please contact the school office for details."])


def password_reset(*, to: str, name: str, school_name: str | None, token: str, minutes: int) -> Email:
    link = f"{settings.APP_URL}/reset-password?token={token}"
    return _build(
        to=to, to_name=name, kind="password_reset", school=school_name, subject="Reset your Vidyanexa password",
        title="Reset your password",
        intro=[f"Hello {escape(first_name(name))}, we received a request to reset your password.",
               f"The link works once and expires in {minutes} minutes."],
        button=("Choose a new password", link),
        outro=["If you didn't ask for this, you can ignore this email; your password won't change."])


def login_code(*, to: str, name: str, school_name: str | None, code: str, minutes: int) -> Email:
    return _build(
        to=to, to_name=name, kind="login_code", school=school_name, subject=f"{code} is your Vidyanexa sign-in code",
        title="Your sign-in code",
        intro=[f"Hello {escape(first_name(name))}, use this code to sign in:", f"<b style='font-size:28px;letter-spacing:6px'>{code}</b>",
               f"It works once and expires in {minutes} minutes."],
        outro=["If you didn't try to sign in, you can ignore this email. Never share this code with anyone, including school staff."])


def signup_code(*, to: str, name: str, school_name: str, code: str, minutes: int) -> Email:
    return _build(
        to=to, to_name=name, kind="signup_code", school=school_name, subject=f"{code} is your Vidyanexa confirmation code",
        title="Confirm your email",
        intro=[f"Hello {escape(first_name(name))}, thanks for signing up <b>{escape(school_name)}</b> on Vidyanexa.",
               "Enter this code on the sign-up page to confirm your email and open your school:",
               f"<b style='font-size:28px;letter-spacing:6px'>{code}</b>",
               f"It works once and expires in {minutes} minutes."],
        outro=["If you didn't sign up, you can ignore this email: nothing is set up until the code is entered."])


def school_ready(*, to: str, name: str, school_name: str, trial_days: int) -> Email:
    return _build(
        to=to, to_name=name, kind="school_ready", school=school_name, subject=f"{school_name} is ready on Vidyanexa",
        title="Your school is ready",
        intro=[f"Hello {escape(first_name(name))}, your email is confirmed and <b>{escape(school_name)}</b> is set up.",
               f"Your {trial_days}-day free trial starts today. Everyone at your school signs in with their own email and password."],
        rows=[("Your sign-in", to)],
        button=("Open your school", f"{settings.APP_URL}/dashboard"),
        outro=["Next: add your classes, then your staff and students. The checklist on your dashboard walks you through it.",
               "Questions? Just reply to this email."])


def password_changed(*, to: str, name: str, school_name: str | None, when: str) -> Email:
    return _build(
        to=to, to_name=name, kind="password_changed", school=school_name, subject="Your Vidyanexa password was changed",
        title="Your password was changed",
        intro=[f"Hello {escape(first_name(name))}, the password for your Vidyanexa account was changed on {escape(when)}.",
               "You've been signed out on your other devices."],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["If this wasn't you, reset your password straight away from the sign-in page, and tell your school office."])


def fee_receipt(*, to: str, name: str, school_name: str, student: str, class_section: str, term: str, receipt_no: str,
                amount: Decimal, method: str, paid_at: datetime, balance: Decimal, payment_id: str) -> Email:
    inr = lambda v: f"₹{v:,.0f}" if v == v.to_integral() else f"₹{v:,.2f}"  # noqa: E731
    return _build(
        to=to, to_name=name, kind="fee_receipt", school=school_name, subject=f"Fee receipt {receipt_no} – {student}",
        title=f"Payment received: {inr(amount)}",
        intro=[f"Hello {escape(first_name(name))}, thank you. We've received a fee payment for <b>{escape(student)}</b>."],
        rows=[("Receipt no.", receipt_no), ("Student", f"{student} · {class_section}"), ("For", term),
              ("Amount", inr(amount)), ("Paid by", method), ("Date", paid_at.strftime("%d %b %Y, %I:%M %p")),
              ("Balance on this invoice", inr(balance))],
        button=("View receipt", f"{settings.APP_URL}/fees/receipts/{payment_id}"),
        outro=["Keep this email for your records. The receipt can also be printed from the Vidyanexa app or website."])


def fee_reminder(*, to: str, name: str, school_name: str, student: str, class_section: str, term: str, due_date: date,
                 balance: Decimal, overdue: bool, late_fee: Decimal) -> Email:
    inr = lambda v: f"₹{v:,.0f}" if v == v.to_integral() else f"₹{v:,.2f}"  # noqa: E731
    rows = [("Student", f"{student} · {class_section}"), ("For", term), ("Due date", due_date.strftime("%d %b %Y")),
            ("Amount due", inr(balance))]
    if late_fee:
        rows.append(("Includes late fee", inr(late_fee)))
    return _build(
        to=to, to_name=name, kind="fee_reminder", school=school_name,
        subject=f"{'Overdue' if overdue else 'Reminder'}: {term} fees for {student}",
        title=f"{inr(balance)} {'is overdue' if overdue else 'is due soon'}",
        intro=[f"Hello {escape(first_name(name))}, this is a reminder about <b>{escape(student)}</b>'s school fees."],
        rows=rows, button=("Pay or view fees", f"{settings.APP_URL}/my-fees"),
        outro=["If you've already paid, thank you, and please ignore this message. For any question, contact the school office."])


def test_email(*, to: str, school_name: str | None, sender: str) -> Email:
    return _build(
        to=to, to_name=None, kind="test", school=school_name, subject="Vidyanexa test email",
        title="Email is working 🎉",
        intro=[f"This is a test email sent by {escape(sender)} from Vidyanexa settings.",
               "If you can read this, the school's emails (welcome messages, password resets and fee receipts) will be delivered."])
