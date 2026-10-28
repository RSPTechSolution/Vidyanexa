import asyncio

from sqlalchemy import select

from app.core.database import system_session
from app.models import EmailLog
from app.services import email_service
from tests import factories
from tests.factories import API, student_body


def outbox(kind: str | None = None) -> list[email_service.Email]:
    return [m for m in email_service.CONSOLE_OUTBOX if kind is None or m.kind == kind]


async def test_welcome_email_on_new_account(client, school, admin_headers):
    email_service.CONSOLE_OUTBOX.clear()
    res = await client.post(f"{API}/users", headers=admin_headers, json={
        "email": "new.teacher@t.com", "full_name": "Neha Rao", "role": "teacher", "password": "TempPass123", "phone": "+91 90000 00031"})
    assert res.status_code == 201, res.text
    [msg] = outbox("welcome")
    assert msg.to == "new.teacher@t.com" and "TempPass123" in msg.text and "Teacher" in msg.text
    assert "School ID" not in msg.text  # people sign in with their email alone
    assert "TempPass123" in msg.html

    # A request that fails sends nothing.
    email_service.CONSOLE_OUTBOX.clear()
    dup = await client.post(f"{API}/users", headers=admin_headers, json={
        "email": "new.teacher@t.com", "full_name": "Dup", "role": "teacher", "password": "TempPass123", "phone": "+91 90000 00032"})
    assert dup.status_code == 409 and outbox() == []


async def test_new_parent_and_password_reset_emails(client, db, school, admin_headers):
    _, section = await factories.klass(db, school, "Class 3")
    email_service.CONSOLE_OUTBOX.clear()
    body = student_body(section, "M1", guardians=[{"new_parent": {"full_name": "Asha Mehta", "phone": "+91 90000 00041", "email": "asha@t.com"}, "relationship": "mother"}])
    created = (await client.post(f"{API}/students", headers=admin_headers, json=body)).json()["data"]
    [welcome] = outbox("welcome")
    assert welcome.to == "asha@t.com" and created["new_parent_passwords"]["asha@t.com"] in welcome.text

    res = await client.post(f"{API}/auth/password-reset/request", json={"email": "asha@t.com", "school_slug": school.slug})
    assert res.status_code == 200
    [reset] = outbox("password_reset")
    assert "/reset-password?token=" in reset.text
    token = reset.text.split("token=")[1].split()[0]
    done = await client.post(f"{API}/auth/password-reset/confirm", json={"token": token, "new_password": "BrandNew123"})
    assert done.status_code == 200, done.text

    # Unknown accounts get the same response and no email.
    email_service.CONSOLE_OUTBOX.clear()
    same = await client.post(f"{API}/auth/password-reset/request", json={"email": "nobody@t.com", "school_slug": school.slug})
    assert same.status_code == 200 and outbox() == []


async def test_fee_receipt_goes_to_parents(client, db, school, admin_headers):
    c, section = await factories.klass(db, school, "Class 4")
    cat = (await client.post(f"{API}/fees/categories", headers=admin_headers, json={"name": "Tuition"})).json()["data"]
    await client.put(f"{API}/fees/structures", headers=admin_headers, json={"class_id": str(c.id), "items": [{"category_id": cat["id"], "amount": 5000}]})
    body = student_body(section, "F1", guardians=[{"new_parent": {"full_name": "Ravi Iyer", "phone": "+91 90000 00051", "email": "ravi@t.com"}, "relationship": "father"}])
    student_id = (await client.post(f"{API}/students", headers=admin_headers, json=body)).json()["data"]["student"]["id"]
    await client.post(f"{API}/fees/invoices/generate", headers=admin_headers, json={"term": "Q1", "due_date": "2030-01-01"})
    inv = (await client.get(f"{API}/fees/invoices", headers=admin_headers, params={"student_id": student_id})).json()["data"][0]
    email_service.CONSOLE_OUTBOX.clear()
    await client.post(f"{API}/fees/invoices/{inv['id']}/payments", headers=admin_headers, json={"amount": 2000, "method": "upi", "reference": "U1"})
    [receipt] = outbox("fee_receipt")
    assert receipt.to == "ravi@t.com" and "₹2,000" in receipt.text and "₹3,000" in receipt.text and "RCT-" in receipt.subject


async def test_admin_status_log_and_test_send(client, db, school, admin_headers):
    st = (await client.get(f"{API}/emails/status", headers=admin_headers)).json()["data"]
    assert st["provider"] == "console" and st["sending"] is False and st["daily_limit"] == 300
    sent = await client.post(f"{API}/emails/test", headers=admin_headers, json={"to": "me@t.com"})
    assert sent.status_code == 201 and sent.json()["data"]["status"] == "logged"
    log = (await client.get(f"{API}/emails", headers=admin_headers)).json()["data"]
    assert log[0]["kind"] == "test" and log[0]["to_email"] == "me@t.com"

    await factories.user(db, school, "t@t.com", "teacher")
    t = await factories.login_headers(client, "t@t.com", factories.PASSWORD, school.slug)
    assert (await client.get(f"{API}/emails", headers=t)).status_code == 403


async def test_real_provider_sends_after_commit_and_records_failures(client, db, school, admin_headers, monkeypatch):
    sent: list[str] = []

    async def fake_deliver(msg):
        if msg.to.startswith("bounce"):
            raise RuntimeError("550 mailbox unavailable")
        sent.append(msg.to)

    monkeypatch.setattr(email_service, "provider_name", lambda: "brevo-smtp")
    monkeypatch.setattr(email_service, "deliver", fake_deliver)
    ok = await client.post(f"{API}/emails/test", headers=admin_headers, json={"to": "ok@school.in"})
    bad = await client.post(f"{API}/emails/test", headers=admin_headers, json={"to": "bounce@school.in"})
    assert ok.json()["data"]["status"] == "queued"
    await asyncio.sleep(0.3)  # delivery runs after the request's transaction commits
    assert sent == ["ok@school.in"]
    async with system_session() as s:
        rows = {r.to_email: r for r in (await s.scalars(select(EmailLog).where(EmailLog.school_id == school.id))).all()}
    assert rows["ok@school.in"].status == "sent" and rows["ok@school.in"].sent_at is not None
    assert rows["bounce@school.in"].status == "failed" and "550" in rows["bounce@school.in"].error


async def test_demo_domains_are_never_sent(client, admin_headers, monkeypatch):
    sent = []

    async def fake_deliver(msg):
        sent.append(msg.to)

    monkeypatch.setattr(email_service, "provider_name", lambda: "brevo-smtp")
    monkeypatch.setattr(email_service, "deliver", fake_deliver)
    res = await client.post(f"{API}/emails/test", headers=admin_headers, json={"to": "parent@demo.com"})
    assert res.json()["data"]["status"] == "skipped"
    await asyncio.sleep(0.2)
    assert sent == []
