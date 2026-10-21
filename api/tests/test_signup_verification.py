"""A school that signs itself up opens only once its admin confirms the email (or mobile) with a code. Account messages
(new account, password set by the school, password changed) go by email and to the person's mobile."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import MessageLog, School, User
from app.services.email_service import CONSOLE_OUTBOX
from tests import factories
from tests.factories import API, PASSWORD

SIGNUP = {
    "school_name": "Lotus Valley School", "school_slug": "lotus", "city": "Pune", "full_name": "Kiran Rao",
    "email": "kiran@lotus.edu", "phone": "+91 98000 22222", "password": "LotusValley1", "plan_code": "pro",
    "billing_cycle": "yearly", "accept_terms": True,
}


def _emails(to: str, kind: str) -> list:
    return [m for m in CONSOLE_OUTBOX if m.to == to and m.kind == kind]


async def _texts(db, phone_tail: str, kind: str) -> list[MessageLog]:
    return list((await db.scalars(select(MessageLog).where(MessageLog.kind == kind, MessageLog.to.endswith(phone_tail)))).all())


async def test_a_new_school_opens_only_after_the_email_code(client, db):
    CONSOLE_OUTBOX.clear()
    res = await factories.signup(client, SIGNUP, confirm=False)
    assert res.status_code == 201, res.text
    out = res.json()["data"]
    assert out["verify_by"] == ["email", "sms"] and out["expires_in"] == 600
    code = out["debug_code"]

    # The code goes by email, and by SMS to the mobile given.
    mail = _emails("kiran@lotus.edu", "signup_code")
    assert len(mail) == 1 and code in mail[0].subject and code in mail[0].text
    assert [m.body[:6] for m in await _texts(db, "9800022222", "signup")] == [code]

    # Nothing works with the password alone until then; the error says what to do.
    blocked = await factories.login(client, "kiran@lotus.edu", "LotusValley1", "lotus")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "ACCOUNT_NOT_VERIFIED" and "kiran@lotus.edu" in blocked.json()["error"]["message"]

    wrong = await client.post(f"{API}/auth/login-code", json={"identifier": "kiran@lotus.edu", "school_slug": "lotus", "code": "000000" if code != "000000" else "111111"})
    assert wrong.status_code == 401

    ok = await client.post(f"{API}/auth/login-code", json={"identifier": "kiran@lotus.edu", "school_slug": "lotus", "code": code})
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["user"]["role"] == "school_admin"

    school = await db.scalar(select(School).where(School.slug == "lotus"))
    await db.refresh(school)
    assert "awaiting_verification" not in (school.settings or {})
    assert school.trial_ends_at > datetime.now(UTC) + timedelta(days=13)  # the trial counts from today
    admin = await db.scalar(select(User).where(User.email == "kiran@lotus.edu"))
    assert admin.verified_at is not None
    assert len(_emails("kiran@lotus.edu", "school_ready")) == 1

    # Now the password works too, and the school ID can't be signed up again.
    assert (await factories.login(client, "kiran@lotus.edu", "LotusValley1", "lotus")).status_code == 200
    again = await client.post(f"{API}/public/signup", json=SIGNUP)
    assert again.status_code == 409 and again.json()["error"]["code"] == "SLUG_TAKEN"


async def test_asking_again_sends_a_confirmation_code(client):
    CONSOLE_OUTBOX.clear()
    await factories.signup(client, SIGNUP, confirm=False)
    r = await client.post(f"{API}/auth/login-code/request", json={"identifier": "kiran@lotus.edu", "school_slug": "lotus"})
    assert r.status_code == 200
    assert len(_emails("kiran@lotus.edu", "signup_code")) == 2  # not a "sign-in code" email: they haven't finished signing up
    assert not _emails("kiran@lotus.edu", "login_code")


async def test_an_unconfirmed_sign_up_does_not_hold_the_school_id(client, db):
    await factories.signup(client, SIGNUP, confirm=False)
    # Starting again, here with a corrected email: allowed, and it replaces the first attempt.
    retry = await factories.signup(client, {**SIGNUP, "school_name": "Lotus Valley International", "email": "kiran.rao@lotus.edu"})
    assert retry.status_code == 201, retry.text
    schools = (await db.scalars(select(School).where(School.slug == "lotus"))).all()
    assert [s.name for s in schools] == ["Lotus Valley International"]
    # The first email's account went with it.
    assert await db.scalar(select(User).where(User.email == "kiran@lotus.edu")) is None


async def test_people_added_by_the_school_get_email_and_sms_and_are_verified_on_first_sign_in(client, db, school, admin_headers):
    CONSOLE_OUTBOX.clear()
    r = await client.post(f"{API}/users", headers=admin_headers, json={
        "email": "ravi@alpha.edu", "full_name": "Ravi Kumar", "role": "accountant", "phone": "+91 98000 33333",
        "employee_id": "A-77", "password": "TempPass123"})
    assert r.status_code == 201, r.text
    assert len(_emails("ravi@alpha.edu", "welcome")) == 1
    sms = await _texts(db, "9800033333", "account")
    assert len(sms) == 1 and "TempPass123" in sms[0].body and school.slug in sms[0].body

    ravi = await db.scalar(select(User).where(User.email == "ravi@alpha.edu"))
    assert ravi.verified_at is None
    assert (await factories.login(client, "ravi@alpha.edu", "TempPass123", school.slug)).status_code == 200  # not blocked
    await db.refresh(ravi)
    assert ravi.verified_at is not None


async def test_a_password_change_is_confirmed_by_email_and_sms(client, db, school):
    user = await factories.user(db, school, "neha@alpha.edu", "teacher")
    user.phone = "+91 98000 44444"
    await db.commit()
    headers = await factories.login_headers(client, "neha@alpha.edu", PASSWORD, school.slug)
    CONSOLE_OUTBOX.clear()
    r = await client.post(f"{API}/auth/change-password", headers=headers, json={"current_password": PASSWORD, "new_password": "BrandNew#2026"})
    assert r.status_code == 200, r.text
    assert len(_emails("neha@alpha.edu", "password_changed")) == 1
    assert len(await _texts(db, "9800044444", "account")) == 1
