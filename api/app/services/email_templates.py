"""The emails Vidyanexa sends. Each returns an Email with matching HTML and plain-text bodies.

HTML uses inline styles and tables only, which is what email clients reliably render.
"""
import re
from datetime import date, datetime
from decimal import Decimal
from html import escape

from app.core.config import settings
from app.services.email_service import Email

NAVY = "#15233F"
GOLD = "#B8893C"
IVORY = "#F7F2E8"


def _layout(*, title: str, school: str | None, intro: list[str], rows: list[tuple[str, str]] | None = None,
            button: tuple[str, str] | None = None, outro: list[str] | None = None) -> str:
    p = lambda t: f'<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">{t}</p>'  # noqa: E731
    table = ""
    if rows:
        cells = "".join(
            f'<tr><td style="padding:8px 12px;color:#6b7280;font-size:13px;border-bottom:1px solid #eef0f3">{escape(k)}</td>'
            f'<td style="padding:8px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #eef0f3">{v}</td></tr>'
            for k, v in rows)
        table = f'<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:10px;margin:4px 0 18px">{cells}</table>'
    btn = ""
    if button:
        label, url = button
        btn = (f'<p style="margin:6px 0 22px"><a href="{escape(url)}" style="display:inline-block;background:{NAVY};color:#ffffff;'
               f'text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">{escape(label)}</a></p>')
    crest = f"{settings.APP_URL.rstrip('/')}/brand/crest-reverse.png"
    return f"""<!doctype html><html><body style="margin:0;background:{IVORY};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="background:{IVORY};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6DECD">
<tr><td style="background:{NAVY};padding:18px 28px;color:{IVORY};border-bottom:3px solid {GOLD}">
<table role="presentation"><tr><td style="padding-right:14px;vertical-align:middle"><img src="{crest}" width="34" height="38" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle"><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;letter-spacing:3px">VIDYANEXA</div>
<div style="font-size:12px;color:#D9C9A6;margin-top:3px">{escape(school or "School management")}</div></td></tr></table></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;color:{NAVY};font-family:Georgia,'Times New Roman',serif">{escape(title)}</h1>
{"".join(p(x) for x in intro)}{table}{btn}{"".join(p(x) for x in (outro or []))}
</td></tr>
<tr><td style="padding:16px 28px;background:#FBF8F2;color:#6b7280;font-size:12px;line-height:1.5">
This email was sent by Vidyanexa on behalf of {escape(school or "your school")}. If you weren't expecting it, you can ignore it.
</td></tr></table></td></tr></table></body></html>"""


def _text(title: str, intro: list[str], rows: list[tuple[str, str]] | None = None, button: tuple[str, str] | None = None,
          outro: list[str] | None = None) -> str:
    parts = [title, "", *intro]
    if rows:
        parts += ["", *[f"{k}: {v}" for k, v in rows]]
    if button:
        parts += ["", f"{button[0]}: {button[1]}"]
    if outro:
        parts += ["", *outro]
    return "\n".join(parts)


def _plain(s: str) -> str:
    """The plain-text version of a line that may contain tags such as <b> or <b style=...>."""
    return re.sub(r"</?[a-z][^>]*>", "", s)


def _build(*, to: str, to_name: str | None, subject: str, kind: str, title: str, school: str | None, intro: list[str],
           rows: list[tuple[str, str]] | None = None, button: tuple[str, str] | None = None, outro: list[str] | None = None) -> Email:
    html = _layout(title=title, school=school, intro=intro, rows=[(k, escape(v)) for k, v in rows or []], button=button, outro=outro)
    text = _text(title, [_plain(x) for x in intro], rows, button, [_plain(x) for x in outro or []])
    return Email(to=to, to_name=to_name, subject=subject, html=html, text=text, kind=kind)


def welcome(*, to: str, name: str, role_label: str, school_name: str, school_slug: str, password: str) -> Email:
    first = escape(name.split()[0])
    return _build(
        to=to, to_name=name, kind="welcome", school=school_name,
        subject=f"Your {school_name} account on Vidyanexa",
        title=f"Welcome, {name.split()[0]}",
        intro=[f"Hello {first}, a Vidyanexa account has been created for you at <b>{escape(school_name)}</b> as <b>{escape(role_label)}</b>.",
               "Use these details to sign in on the website or in the Vidyanexa app:"],
        rows=[("School ID", school_slug), ("Email", to), ("Temporary password", password)],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["You'll be asked to choose your own password the first time you sign in. Please don't share these details."])


def password_set_by_school(*, to: str, name: str, school_name: str, school_slug: str, password: str) -> Email:
    return _build(
        to=to, to_name=name, kind="password_set", school=school_name, subject="Your Vidyanexa password was reset",
        title="Your password was reset",
        intro=[f"Hello {escape(name.split()[0])}, the school office has set a new temporary password for your account."],
        rows=[("School ID", school_slug), ("Email", to), ("Temporary password", password)],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["You'll choose your own password when you sign in. If you didn't ask for this, contact the school office."])


def password_reset(*, to: str, name: str, school_name: str | None, token: str, minutes: int) -> Email:
    link = f"{settings.APP_URL}/reset-password?token={token}"
    return _build(
        to=to, to_name=name, kind="password_reset", school=school_name, subject="Reset your Vidyanexa password",
        title="Reset your password",
        intro=[f"Hello {escape(name.split()[0])}, we received a request to reset your password.",
               f"The link works once and expires in {minutes} minutes."],
        button=("Choose a new password", link),
        outro=["If you didn't ask for this, you can ignore this email; your password won't change."])


def login_code(*, to: str, name: str, school_name: str | None, code: str, minutes: int) -> Email:
    return _build(
        to=to, to_name=name, kind="login_code", school=school_name, subject=f"{code} is your Vidyanexa sign-in code",
        title="Your sign-in code",
        intro=[f"Hello {escape(name.split()[0])}, use this code to sign in:", f"<b style='font-size:28px;letter-spacing:6px'>{code}</b>",
               f"It works once and expires in {minutes} minutes."],
        outro=["If you didn't try to sign in, you can ignore this email. Never share this code with anyone, including school staff."])


def signup_code(*, to: str, name: str, school_name: str, code: str, minutes: int) -> Email:
    return _build(
        to=to, to_name=name, kind="signup_code", school=school_name, subject=f"{code} is your Vidyanexa confirmation code",
        title="Confirm your email",
        intro=[f"Hello {escape(name.split()[0])}, thanks for signing up <b>{escape(school_name)}</b> on Vidyanexa.",
               "Enter this code on the sign-up page to confirm your email and open your school:",
               f"<b style='font-size:28px;letter-spacing:6px'>{code}</b>",
               f"It works once and expires in {minutes} minutes."],
        outro=["If you didn't sign up, you can ignore this email: nothing is set up until the code is entered."])


def school_ready(*, to: str, name: str, school_name: str, school_slug: str, trial_days: int) -> Email:
    return _build(
        to=to, to_name=name, kind="school_ready", school=school_name, subject=f"{school_name} is ready on Vidyanexa",
        title="Your school is ready",
        intro=[f"Hello {escape(name.split()[0])}, your email is confirmed and <b>{escape(school_name)}</b> is set up.",
               f"Your {trial_days}-day free trial starts today. Keep these details: everyone at your school signs in with the School ID."],
        rows=[("School ID", school_slug), ("Your sign-in", to)],
        button=("Open your school", f"{settings.APP_URL}/dashboard"),
        outro=["Next: add your classes, then your staff and students. The checklist on your dashboard walks you through it.",
               "Questions? Just reply to this email."])


def password_changed(*, to: str, name: str, school_name: str | None, when: str) -> Email:
    return _build(
        to=to, to_name=name, kind="password_changed", school=school_name, subject="Your Vidyanexa password was changed",
        title="Your password was changed",
        intro=[f"Hello {escape(name.split()[0])}, the password for your Vidyanexa account was changed on {escape(when)}.",
               "You've been signed out on your other devices."],
        button=("Sign in", f"{settings.APP_URL}/login"),
        outro=["If this wasn't you, reset your password straight away from the sign-in page, and tell your school office."])


def fee_receipt(*, to: str, name: str, school_name: str, student: str, class_section: str, term: str, receipt_no: str,
                amount: Decimal, method: str, paid_at: datetime, balance: Decimal, payment_id: str) -> Email:
    inr = lambda v: f"₹{v:,.0f}" if v == v.to_integral() else f"₹{v:,.2f}"  # noqa: E731
    return _build(
        to=to, to_name=name, kind="fee_receipt", school=school_name, subject=f"Fee receipt {receipt_no} – {student}",
        title=f"Payment received: {inr(amount)}",
        intro=[f"Hello {escape(name.split()[0])}, thank you. We've received a fee payment for <b>{escape(student)}</b>."],
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
        intro=[f"Hello {escape(name.split()[0])}, this is a reminder about <b>{escape(student)}</b>'s school fees."],
        rows=rows, button=("Pay or view fees", f"{settings.APP_URL}/my-fees"),
        outro=["If you've already paid, thank you, and please ignore this message. For any question, contact the school office."])


def test_email(*, to: str, school_name: str | None, sender: str) -> Email:
    return _build(
        to=to, to_name=None, kind="test", school=school_name, subject="Vidyanexa test email",
        title="Email is working 🎉",
        intro=[f"This is a test email sent by {escape(sender)} from Vidyanexa settings.",
               "If you can read this, the school's emails (welcome messages, password resets and fee receipts) will be delivered."])
