from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.core import pricing
from app.core.database import system_session
from app.models import Lead, Plan, School
from tests import factories
from tests.factories import API, PASSWORD

SIGNUP = {
    "school_name": "Sunrise Public School", "school_slug": "sunrise", "city": "Pune", "full_name": "Meera Iyer",
    "email": "meera@sunrise.edu", "phone": "+91 98000 11111", "password": "Sunrise123", "plan_code": "pro",
    "billing_cycle": "yearly", "accept_terms": True,
}


# ---- public website -----------------------------------------------------------------------

async def test_public_plans_in_inr_without_auth(client):
    res = await client.get(f"{API}/public/plans")
    plans = res.json()["data"]
    assert [p["code"] for p in plans] == ["basic", "pro", "max"]
    assert plans[0]["price_monthly"] == 2999 and plans[0]["max_students"] == 300
    assert plans[2]["max_students"] is None  # unlimited
    assert set(plans[2]["modules"]) >= set(plans[1]["modules"]) >= set(plans[0]["modules"])


async def test_quote_matches_pricing_rules(client):
    res = await client.post(f"{API}/public/quote", json={"modules": ["fees", "transport"], "students": 600})
    q = res.json()["data"]
    # 500 x 3 + 100 x 2 = 1700 for students; fees 799 + transport 999; platform 1499. Only the total is published.
    assert "module_total" not in q and "student_total" not in q
    assert q["monthly"] == 1499 + 1798 + 1700
    assert q["yearly"] == q["monthly"] * 10
    assert {"students", "academics", "attendance"} <= set(q["modules"])  # core always included

    bad = await client.post(f"{API}/public/quote", json={"modules": ["teleport"], "students": 100})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "INVALID_CUSTOM_PLAN"
    too_many = await client.post(f"{API}/public/quote", json={"modules": [], "students": 20000})
    assert too_many.status_code == 400


async def test_signup_starts_a_trial_with_plan_modules(client):
    res = await factories.signup(client, SIGNUP)
    assert res.status_code == 201, res.text
    assert res.json()["data"]["plan"]["code"] == "pro"

    login = await factories.login(client, "meera@sunrise.edu", "Sunrise123", "sunrise")
    me = login.json()["data"]["user"]
    assert me["role"] == "school_admin" and me["must_change_password"] is False
    assert me["school"]["subscription_status"] == "trialing"
    assert "exams" in me["modules"] and "ai" not in me["modules"]

    dup = await client.post(f"{API}/public/signup", json=SIGNUP)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "SLUG_TAKEN"
    no_terms = await client.post(f"{API}/public/signup", json={**SIGNUP, "school_slug": "other", "accept_terms": False})
    assert no_terms.status_code == 422


async def test_signup_with_custom_plan(client, db):
    body = {**SIGNUP, "plan_code": "custom", "custom_modules": ["fees", "ai"], "custom_students": 250}
    res = await client.post(f"{API}/public/signup", json=body)
    assert res.status_code == 201, res.text
    school = await db.scalar(select(School).where(School.slug == "sunrise"))
    plan = school.plan
    assert plan.is_custom and not plan.is_public
    assert plan.price_monthly == pricing.quote(["fees", "ai"], 250).monthly
    assert plan.max_students == 250 and "ai" in plan.modules and "transport" not in plan.modules


async def test_contact_form_creates_a_lead(client, db):
    res = await client.post(f"{API}/public/contact", json={
        "name": "Ravi", "email": "ravi@school.edu", "message": "We need a demo please",
        "students": 800, "modules": ["fees", "exams"],
    })
    assert res.status_code == 201
    lead = await db.scalar(select(Lead))
    assert lead.kind == "quote" and lead.quoted_monthly == pricing.quote(["fees", "exams"], 800).monthly


async def test_leads_are_hidden_from_tenant_sessions(school, db):
    await db.execute(Lead.__table__.insert().values(kind="contact", name="X", email="x@y.edu", modules=[]))
    await db.commit()
    async with system_session(school.id, bypass=False) as s:
        assert (await s.scalars(select(Lead))).all() == []
    with pytest.raises(DBAPIError, match="row-level security"):
        async with system_session(school.id, bypass=False) as s:
            await s.execute(text("INSERT INTO leads (id, kind, status, name, email, modules) "
                                 "VALUES (gen_random_uuid(), 'contact', 'new', 'Y', 'y@y.edu', '{}')"))


async def test_school_users_cannot_change_plan_rows(school):
    # RLS hides the rows from UPDATE, so nothing changes (Postgres doesn't raise).
    async with system_session(school.id, bypass=False) as s:
        result = await s.execute(text("UPDATE plans SET price_monthly = 1 WHERE code = 'max'"))
        assert result.rowcount == 0
        assert len((await s.scalars(select(Plan))).all()) == 3  # but plans are readable
    async with system_session() as s:  # bypass
        assert (await s.scalar(select(Plan.price_monthly).where(Plan.code == "max"))) == 17999


# ---- enforcement -----------------------------------------------------------------------------

async def test_modules_outside_the_plan_are_off_and_locked(client, db):
    basic = await factories.school(db, "small", plan="basic")
    await factories.user(db, basic, "head@small.edu", "school_admin")
    h = await factories.login_headers(client, "head@small.edu", PASSWORD, "small")

    me = (await client.get(f"{API}/auth/me", headers=h)).json()["data"]
    # "exams" is switched on in school_modules but Basic doesn't include it.
    assert "exams" not in me["modules"] and "fees" in me["modules"]

    modules = {m["module"]: m for m in (await client.get(f"{API}/schools/current/modules", headers=h)).json()["data"]}
    assert modules["exams"]["in_plan"] is False and modules["exams"]["upgrade_plan"] == "Pro"
    assert modules["ai"]["upgrade_plan"] == "Max"

    res = await client.put(f"{API}/schools/current/modules/transport", headers=h, json={"is_enabled": True})
    assert res.status_code == 403 and res.json()["error"]["code"] == "PLAN_UPGRADE_REQUIRED"
    # Switching a plan module off is always allowed.
    assert (await client.put(f"{API}/schools/current/modules/fees", headers=h, json={"is_enabled": False})).status_code == 200


async def test_user_limits_follow_the_plan(client, db, school, admin_headers, super_headers):
    pro = await db.scalar(select(Plan).where(Plan.code == "pro"))
    await client.patch(f"{API}/platform/plans/{pro.id}", headers=super_headers, json={"max_staff": 2, "max_students": 1})

    base = {"full_name": "Person", "password": "Passw0rd1", "phone": "+91 98000 00002"}
    # admin@alpha already uses 1 staff seat
    ok = await client.post(f"{API}/users", headers=admin_headers, json={**base, "email": "t1@alpha.edu", "role": "teacher"})
    assert ok.status_code == 201, ok.text
    over = await client.post(f"{API}/users", headers=admin_headers, json={**base, "email": "t2@alpha.edu", "role": "teacher"})
    assert over.status_code == 403 and over.json()["error"]["code"] == "PLAN_LIMIT_REACHED"

    # Student seats are taken by student records.
    _, section = await factories.klass(db, school, "Class 1")
    first = await client.post(f"{API}/students", headers=admin_headers, json=factories.student_body(section, "A1"))
    assert first.status_code == 201, first.text
    second = await client.post(f"{API}/students", headers=admin_headers, json=factories.student_body(section, "A2"))
    assert second.status_code == 403 and second.json()["error"]["details"]["limit"] == "students"

    # Parents aren't limited.
    sid = first.json()["data"]["student"]["id"]
    for i in range(3):
        r = await client.post(f"{API}/users", headers=admin_headers, json={
            **base, "email": f"p{i}@alpha.edu", "role": "parent", "children": [{"student_id": sid, "relationship": "guardian"}]})
        assert r.status_code == 201, r.text


# ---- subscription ---------------------------------------------------------------------------

async def _trial_school(client):
    await factories.signup(client, {**SIGNUP, "plan_code": "basic"})
    return await factories.login_headers(client, "meera@sunrise.edu", "Sunrise123", "sunrise")


async def test_trial_school_can_switch_plans(client):
    h = await _trial_school(client)
    sub = (await client.get(f"{API}/subscription", headers=h)).json()["data"]
    assert sub["plan"]["code"] == "basic" and sub["can_self_change"] and 13 <= sub["trial_days_left"] <= 14
    assert [p["code"] for p in sub["available_plans"]] == ["basic", "pro", "max"]

    res = await client.post(f"{API}/subscription/change", headers=h, json={"plan_code": "max", "billing_cycle": "monthly"})
    data = res.json()["data"]
    assert data["changed"] is True and data["subscription"]["plan"]["code"] == "max"
    me = (await client.get(f"{API}/auth/me", headers=h)).json()["data"]
    assert "ai" in me["modules"]  # newly included modules switch on


async def test_after_trial_changes_become_requests(client, db, super_headers):
    h = await _trial_school(client)
    school = await db.scalar(select(School).where(School.slug == "sunrise"))
    school.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()

    sub = (await client.get(f"{API}/subscription", headers=h)).json()["data"]
    assert sub["trial_expired"] is True and sub["can_self_change"] is False
    res = await client.post(f"{API}/subscription/change", headers=h, json={"plan_code": "pro", "message": "Please upgrade"})
    assert res.json()["data"]["changed"] is False
    leads = (await client.get(f"{API}/platform/leads?kind=upgrade", headers=super_headers)).json()["data"]
    assert leads[0]["plan_code"] == "pro" and leads[0]["school_name"] == "Sunrise Public School"


async def test_cannot_move_to_a_plan_that_is_too_small(client, db, super_headers):
    s = await factories.school(db, "busy", plan="pro")
    for i in range(3):
        await factories.user(db, s, f"t{i}@busy.edu", "teacher")
    basic = await db.scalar(select(Plan).where(Plan.code == "basic"))
    await client.patch(f"{API}/platform/plans/{basic.id}", headers=super_headers, json={"max_staff": 2})
    res = await client.put(f"{API}/platform/schools/{s.id}/plan", headers=super_headers, json={"plan_code": "basic"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "PLAN_TOO_SMALL"


async def test_platform_assigns_custom_plan(client, db, school, super_headers):
    res = await client.put(f"{API}/platform/schools/{school.id}/plan", headers=super_headers,
                           json={"plan_code": "custom", "custom_modules": ["library"], "custom_students": 400})
    assert res.status_code == 200, res.text
    assert res.json()["data"]["plan"]["is_custom"] is True
    custom = await client.get(f"{API}/platform/plans?include_custom=true", headers=super_headers)
    assert any(p["is_custom"] and p["max_students"] == 400 for p in custom.json()["data"])


async def test_platform_endpoints_are_super_admin_only(client, admin_headers):
    for path in ["/platform/plans", "/platform/leads"]:
        assert (await client.get(f"{API}{path}", headers=admin_headers)).status_code == 403


async def test_dashboard_summary_is_real_data(client, admin_headers):
    res = await client.get(f"{API}/dashboard/summary", headers=admin_headers)
    d = res.json()["data"]
    assert len(d["signins"]) == 14 and d["signins"][-1]["count"] >= 1  # this test's own sign-in
    assert d["plan"]["code"] == "pro" and d["active_users"] == 1
    assert d["staff"] == {"used": 1, "limit": 120}


async def test_school_pays_for_its_plan_online_with_gst(client, db):
    """Only the subscription is paid online: the plan price for the cycle, plus 18% GST, shown separately."""
    h = await _trial_school(client)
    school = await db.scalar(select(School).where(School.slug == "sunrise"))
    school.trial_ends_at = datetime.now(UTC) - timedelta(days=1)
    await db.commit()
    pro = await db.scalar(select(Plan).where(Plan.code == "pro"))

    sub = (await client.get(f"{API}/subscription", headers=h)).json()["data"]
    assert sub["gst_rate"] == 0.18 and sub["online_payment"] is True

    order = (await client.post(f"{API}/subscription/checkout", headers=h, json={"plan_code": "pro", "billing_cycle": "yearly"})).json()["data"]
    gst = round(pro.price_yearly * 0.18, 2)
    assert order["base_amount"] == pro.price_yearly and order["gst_amount"] == gst and order["total"] == pro.price_yearly + gst
    declined = (await client.post(f"{API}/subscription/payments/{order['payment_id']}/confirm", headers=h, json={"outcome": "failure"})).json()["data"]
    assert declined["status"] == "failed"
    assert (await client.get(f"{API}/subscription", headers=h)).json()["data"]["status"] == "trialing"

    order = (await client.post(f"{API}/subscription/checkout", headers=h, json={"plan_code": "pro", "billing_cycle": "yearly"})).json()["data"]
    done = (await client.post(f"{API}/subscription/payments/{order['payment_id']}/confirm", headers=h, json={"outcome": "success"})).json()["data"]
    assert done["status"] == "paid" and done["payment"]["invoice_no"].startswith("VNX-") and done["payment"]["total"] == order["total"]
    replay = await client.post(f"{API}/subscription/payments/{order['payment_id']}/confirm", headers=h, json={"outcome": "success"})
    assert replay.json()["error"]["code"] == "ORDER_DONE"

    sub = (await client.get(f"{API}/subscription", headers=h)).json()["data"]
    assert sub["status"] == "active" and sub["plan"]["code"] == "pro" and sub["billing_cycle"] == "yearly"
    end = datetime.fromisoformat(sub["current_period_end"])
    assert 364 <= (end - datetime.now(UTC)).days <= 365
    paid = (await client.get(f"{API}/subscription/payments", headers=h)).json()["data"]
    assert [(p["plan_name"], p["gst_amount"]) for p in paid] == [("Pro", gst)]

    # Only those who manage billing can pay.
    await factories.user(db, school, "t@sunrise.edu", "teacher")
    t = await factories.login_headers(client, "t@sunrise.edu", PASSWORD, "sunrise")
    assert (await client.post(f"{API}/subscription/checkout", headers=t, json={"plan_code": "pro"})).status_code == 403
