import re

from tests import factories
from tests.factories import API, PASSWORD


async def test_login_school_user(client, admin):
    res = await factories.login(client, "ADMIN@alpha.edu", PASSWORD, " Alpha ")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["tokens"]["access_token"] and data["tokens"]["refresh_token"]
    assert data["user"]["role"] == "school_admin"
    assert data["user"]["school"]["slug"] == "alpha"
    assert "students" in data["user"]["modules"]
    assert "users.manage" in data["user"]["permissions"]
    assert "password_hash" not in res.text


async def test_login_super_admin_without_school(client, super_admin):
    res = await factories.login(client, super_admin.email, PASSWORD, None)
    assert res.status_code == 200
    assert res.json()["data"]["user"]["school"] is None


async def test_login_failures_share_one_message(client, admin, other_school):
    wrong_pw = await factories.login(client, admin.email, "nope-wrong-1", "alpha")
    unknown_school = await factories.login(client, admin.email, PASSWORD, "nowhere")
    wrong_school = await factories.login(client, admin.email, PASSWORD, "beta")
    unknown_email = await factories.login(client, "nobody@alpha.edu", PASSWORD, None)
    for res in (wrong_pw, unknown_school, wrong_school, unknown_email):
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert len({r.json()["error"]["message"] for r in (wrong_pw, unknown_school, wrong_school, unknown_email)}) == 1


async def test_sign_in_with_email_alone(client, admin):
    res = await factories.login(client, admin.email, PASSWORD, None)
    assert res.status_code == 200
    assert res.json()["data"]["user"]["school"]["slug"] == "alpha"


async def test_inactive_user_and_school_cannot_login(client, db, school):
    await factories.user(db, school, "off@alpha.edu", "teacher", is_active=False)
    res = await factories.login(client, "off@alpha.edu", PASSWORD, "alpha")
    assert res.json()["error"]["code"] == "ACCOUNT_DISABLED"

    closed = await factories.school(db, "closed", is_active=False)
    await factories.user(db, closed, "t@closed.edu", "teacher")
    res = await factories.login(client, "t@closed.edu", PASSWORD, "closed")
    assert res.json()["error"]["code"] == "SCHOOL_INACTIVE"


async def test_me_requires_valid_token(client, admin_headers):
    assert (await client.get(f"{API}/auth/me")).status_code == 401
    bad = await client.get(f"{API}/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "INVALID_TOKEN"
    ok = await client.get(f"{API}/auth/me", headers=admin_headers)
    assert ok.status_code == 200 and ok.json()["data"]["email"] == "admin@alpha.edu"


async def test_refresh_rotates_and_detects_reuse(client, admin):
    tokens = (await factories.login(client, admin.email, PASSWORD, "alpha")).json()["data"]["tokens"]
    first = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    new = first.json()["data"]
    assert new["refresh_token"] != tokens["refresh_token"]

    # Replaying the old token is treated as theft: the whole session dies.
    replay = await client.post(f"{API}/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401
    me = await client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {new['access_token']}"})
    assert me.status_code == 401 and me.json()["error"]["code"] == "SESSION_REVOKED"
    again = await client.post(f"{API}/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert again.status_code == 401


async def test_logout_revokes_access_token(client, admin_headers):
    assert (await client.post(f"{API}/auth/logout", headers=admin_headers)).status_code == 200
    res = await client.get(f"{API}/auth/me", headers=admin_headers)
    assert res.status_code == 401


async def test_change_password_revokes_other_sessions(client, admin):
    h1 = await factories.login_headers(client, admin.email, PASSWORD, "alpha")
    h2 = await factories.login_headers(client, admin.email, PASSWORD, "alpha")
    wrong = await client.post(f"{API}/auth/change-password", headers=h1,
                              json={"current_password": "bad-pass-1", "new_password": "NewPass123"})
    assert wrong.json()["error"]["code"] == "WRONG_PASSWORD"
    weak = await client.post(f"{API}/auth/change-password", headers=h1,
                             json={"current_password": PASSWORD, "new_password": "short"})
    assert weak.status_code == 422 and weak.json()["error"]["code"] == "VALIDATION_ERROR"
    ok = await client.post(f"{API}/auth/change-password", headers=h1,
                           json={"current_password": PASSWORD, "new_password": "NewPass123"})
    assert ok.status_code == 200
    assert (await client.get(f"{API}/auth/me", headers=h1)).status_code == 200
    assert (await client.get(f"{API}/auth/me", headers=h2)).status_code == 401
    assert (await factories.login(client, admin.email, "NewPass123", "alpha")).status_code == 200


async def test_password_reset_flow(client, admin):
    from app.services.email_service import CONSOLE_OUTBOX
    CONSOLE_OUTBOX.clear()
    unknown = await client.post(f"{API}/auth/password-reset/request", json={"email": "ghost@alpha.edu", "school_slug": "alpha"})
    known = await client.post(f"{API}/auth/password-reset/request", json={"email": admin.email, "school_slug": "alpha"})
    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()  # no account enumeration

    [email] = [m for m in CONSOLE_OUTBOX if m.kind == "password_reset"]  # only the real account gets one
    assert email.to == admin.email
    token = re.search(r"token=(\S+)", email.text).group(1)
    res = await client.post(f"{API}/auth/password-reset/confirm", json={"token": token, "new_password": "Reset1234"})
    assert res.status_code == 200
    assert (await factories.login(client, admin.email, "Reset1234", "alpha")).status_code == 200
    reused = await client.post(f"{API}/auth/password-reset/confirm", json={"token": token, "new_password": "Again1234"})
    assert reused.json()["error"]["code"] == "INVALID_RESET_TOKEN"


async def test_login_rate_limited(client, admin):
    for _ in range(10):
        await factories.login(client, admin.email, "wrong-pass-1", "alpha")
    res = await factories.login(client, admin.email, PASSWORD, "alpha")
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "RATE_LIMITED"


async def test_validation_error_shape(client):
    res = await client.post(f"{API}/auth/login", json={"email": "x", "password": ""})
    assert res.status_code == 422
    err = res.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert {d["field"] for d in err["details"]} == {"email", "password"}


async def test_sign_in_with_a_code(client, db, school, monkeypatch):
    from sqlalchemy import select

    from app.core.config import settings
    from app.models import MessageLog
    monkeypatch.setattr(settings, "OTP_DEBUG", True)
    u = await factories.user(db, school, "otp@t.com", "parent")
    u.phone = "+91 98765 11111"
    await db.commit()

    # Unknown accounts get the same answer, without a code.
    res = (await client.post(f"{API}/auth/login-code/request", json={"identifier": "nobody@t.com", "school_slug": school.slug})).json()["data"]
    assert "debug_code" not in res and "sign-in code has been sent" in res["message"]

    code = (await client.post(f"{API}/auth/login-code/request", json={"identifier": "OTP@t.com", "school_slug": school.slug})).json()["data"]["debug_code"]
    again = await client.post(f"{API}/auth/login-code/request", json={"identifier": "otp@t.com", "school_slug": school.slug})
    assert again.status_code == 429  # one a minute
    wrong = "000000" if code != "000000" else "111111"
    bad = await client.post(f"{API}/auth/login-code", json={"identifier": "otp@t.com", "school_slug": school.slug, "code": wrong})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "INVALID_CODE"
    ok = await client.post(f"{API}/auth/login-code", json={"identifier": "otp@t.com", "school_slug": school.slug, "code": code})
    assert ok.status_code == 200 and ok.json()["data"]["user"]["email"] == "otp@t.com"
    # A code works once.
    assert (await client.post(f"{API}/auth/login-code", json={"identifier": "otp@t.com", "school_slug": school.slug, "code": code})).status_code == 401

    # By mobile number (no school ID needed), and an SMS goes out. An unknown number gets no code.
    assert "debug_code" not in (await client.post(f"{API}/auth/login-code/request", json={"identifier": "98765 22222"})).json()["data"]
    code = (await client.post(f"{API}/auth/login-code/request", json={"identifier": "098765 11111"})).json()["data"]["debug_code"]
    sms = (await db.scalars(select(MessageLog).where(MessageLog.kind == "login"))).all()
    assert [m.to for m in sms] == ["+919876511111"] and code in sms[0].body
    assert (await client.post(f"{API}/auth/login-code", json={"identifier": "9876511111", "school_slug": school.slug, "code": code})).status_code == 200


async def test_code_is_dropped_after_five_wrong_tries(client, db, school, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "OTP_DEBUG", True)
    await factories.user(db, school, "otp2@t.com", "teacher")
    code = (await client.post(f"{API}/auth/login-code/request", json={"identifier": "otp2@t.com", "school_slug": school.slug})).json()["data"]["debug_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        await client.post(f"{API}/auth/login-code", json={"identifier": "otp2@t.com", "school_slug": school.slug, "code": wrong})
    assert (await client.post(f"{API}/auth/login-code", json={"identifier": "otp2@t.com", "school_slug": school.slug, "code": code})).status_code == 401
