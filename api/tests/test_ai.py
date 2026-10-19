"""The AI assistant: safe templates, permissions, teacher scoping, and optional Claude routing."""
import uuid
from datetime import timedelta
from decimal import Decimal

from app.core.config import settings
from app.models import AttendanceRecord, FeeInvoice, Section, Student
from app.services import ai_service
from app.services.fee_service import academic_year
from tests import factories, test_attendance
from tests.factories import API, PASSWORD
from tests.test_campus import _enable, _max_plan
from tests.test_attendance import today


async def _setup(client, db, school, admin_headers):
    await _max_plan(db, school)
    await _enable(client, admin_headers, "ai")
    section, ids, _, teacher, other = await test_attendance.setup(client, db, school, admin_headers)
    sids = [uuid.UUID(i) for i in ids]
    # Kid1 is absent today; Kid2 is in section B (which the class teacher doesn't teach) and absent too.
    from sqlalchemy import select
    b = await db.scalar(select(Section).where(Section.class_id == section.class_id, Section.name == "B"))
    kid2 = await db.get(Student, sids[2])
    kid2.section_id = b.id
    for i, s in enumerate(sids):
        db.add(AttendanceRecord(school_id=school.id, student_id=s, section_id=b.id if i == 2 else section.id, date=today(),
                                status="present" if i == 0 else "absent", remark="Fever" if i == 1 else None))
    db.add(FeeInvoice(school_id=school.id, invoice_no="INV-1", student_id=sids[1], term="Q1", academic_year=academic_year(today()),
                      issue_date=today() - timedelta(days=60), due_date=today() - timedelta(days=20), total=Decimal(5000), status="unpaid"))
    await db.commit()
    return sids


async def test_rules_answer_with_permissions_and_scope(client, db, school, admin_headers):
    await _setup(client, db, school, admin_headers)
    await factories.user(db, school, "acc@t.com", "accountant")
    ct = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    acc = await factories.login_headers(client, "acc@t.com", PASSWORD, school.slug)
    parent = await factories.login_headers(client, "mum@t.com", (await client.get(f"{API}/auth/me", headers=admin_headers)).json() and PASSWORD, school.slug) \
        if False else None  # families can't use the assistant; checked below with a fresh parent
    p = await factories.user(db, school, "p@t.com", "parent")
    ph = await factories.login_headers(client, "p@t.com", PASSWORD, school.slug)
    assert (await client.get(f"{API}/ai", headers=ph)).status_code == 403 and parent is None and p

    st = (await client.get(f"{API}/ai", headers=admin_headers)).json()["data"]
    assert st["mode"] == "rules" and {"absent_today", "fee_defaulters", "draft_notice"} <= {t["id"] for t in st["templates"]}
    ask = lambda h, q: client.post(f"{API}/ai/ask", headers=h, json={"question": q})  # noqa: E731

    a = (await ask(admin_headers, "Who is absent today?")).json()["data"]
    assert a["template"] == "absent_today" and sorted(r[0] for r in a["rows"]) == ["Kid1 Sharma", "Kid2 Sharma"]
    # The class teacher of 4-A only sees their own section.
    t = (await ask(ct, "who is absent today")).json()["data"]
    assert [r[0] for r in t["rows"]] == ["Kid1 Sharma"] and t["rows"][0][3] == "Fever"
    # Teachers can't see fees: told it's an access matter, with what they can ask.
    no = (await ask(ct, "fee defaulters please")).json()["data"]
    assert no["template"] is None and "needs access" in no["text"] and no["suggestions"]
    f = (await ask(acc, "Fee defaulters in class 4")).json()["data"]
    assert f["template"] == "fee_defaulters" and f["rows"][0][:3] == ["Kid1 Sharma", "Class 4 – A", "Rs 5,000"]
    who = (await ask(admin_headers, "Tell me about Kid0")).json()["data"]
    assert who["template"] == "student_lookup" and who["text"] == "Kid0 Sharma" and ["Fees due", "Nothing due"] in who["rows"]
    many = (await ask(admin_headers, "Tell me about Sharma")).json()["data"]
    assert "3 students match" in many["text"]
    notice = (await ask(admin_headers, "Write a notice about the science exhibition on 20 November")).json()["data"]
    draft = notice["rows"][0][0]
    assert draft.startswith("Dear Parents,") and "science exhibition on 20 November" in draft and "[date]" not in draft
    huh = (await ask(admin_headers, "What's the weather like?")).json()["data"]
    assert huh["template"] is None and huh["text"].startswith("I can't answer")


async def test_daily_limit(client, db, school, admin_headers, monkeypatch):
    await _setup(client, db, school, admin_headers)
    monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 2)
    for _ in range(2):
        assert (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "who is absent"})).status_code == 200
    assert (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "who is absent"})).status_code == 429
    assert (await client.get(f"{API}/ai", headers=admin_headers)).json()["data"]["left_today"] == 0


async def test_claude_picks_the_template(client, db, school, admin_headers, monkeypatch):
    await _setup(client, db, school, admin_headers)
    monkeypatch.setattr(settings, "AI_PROVIDER", "anthropic")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    sent = []

    async def fake_claude(body):
        sent.append(body)
        if "tools" in body:
            return {"content": [{"type": "tool_use", "name": "absent_today", "input": {"class_name": "Class 4"}}]}
        return {"content": [{"type": "text", "text": "Dear Parents,\nHello.\nRegards,\nAlpha School"}]}
    monkeypatch.setattr(ai_service, "_claude", fake_claude)

    a = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "kaun kaun aaj nahi aaya?"})).json()["data"]
    assert a["mode"] == "ai" and a["template"] == "absent_today" and len(a["rows"]) == 2
    # Only the question and class names go to Claude, never student data.
    assert "Kid" not in str(sent[0]) and "Class 4" in str(sent[0]) and sent[0]["model"] == settings.AI_MODEL

    async def broken(body):
        return None
    monkeypatch.setattr(ai_service, "_claude", broken)
    fallback = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "who is absent today"})).json()["data"]
    assert fallback["mode"] == "rules" and fallback["template"] == "absent_today"


async def test_gemini_picks_the_template_and_drafts_notices(client, db, school, admin_headers, monkeypatch):
    await _setup(client, db, school, admin_headers)
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    sent = []

    async def fake_gemini(body):
        sent.append(body)
        if "tools" in body:
            return {"candidates": [{"content": {"parts": [{"functionCall": {"name": "absent_today", "args": {"class_name": "Class 4"}}}]}}]}
        return {"candidates": [{"content": {"parts": [{"text": "Dear Parents,\nSports day is on Friday.\nRegards,\nAlpha School"}]}}]}
    monkeypatch.setattr(ai_service, "_gemini", fake_gemini)

    status = (await client.get(f"{API}/ai", headers=admin_headers)).json()["data"]
    assert status["mode"] == "ai"
    a = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "kaun kaun aaj nahi aaya?"})).json()["data"]
    assert a["mode"] == "ai" and a["template"] == "absent_today" and len(a["rows"]) == 2
    # Only the question and class names go to Google, never student data; tools without inputs carry no empty schema.
    assert "Kid" not in str(sent[0]) and "Class 4" in str(sent[0])
    none_tool = next(d for d in sent[0]["tools"][0]["functionDeclarations"] if d["name"] == "none")
    assert "parameters" not in none_tool

    async def notice_call(body):
        sent.append(body)
        if "tools" in body:
            return {"candidates": [{"content": {"parts": [{"functionCall": {"name": "draft_notice", "args": {"topic": "sports day on Friday"}}}]}}]}
        return {"candidates": [{"content": {"parts": [{"text": "Dear Parents,\nSports day is on Friday.\nRegards,\nAlpha School"}]}}]}
    monkeypatch.setattr(ai_service, "_gemini", notice_call)
    n = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "write a notice about sports day on friday"})).json()["data"]
    assert n["template"] == "draft_notice" and n["rows"][0][0].startswith("Dear Parents,")

    async def broken(body):
        return None
    monkeypatch.setattr(ai_service, "_gemini", broken)
    fallback = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "who is absent today"})).json()["data"]
    assert fallback["mode"] == "rules" and fallback["template"] == "absent_today"


async def test_greetings_get_a_friendly_reply_without_asking_the_model(client, db, school, admin_headers, monkeypatch):
    await _setup(client, db, school, admin_headers)
    monkeypatch.setattr(settings, "AI_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "test-key")
    calls = []

    async def fake_gemini(body):
        calls.append(body)
        return {"candidates": [{"content": {"parts": [{"functionCall": {"name": "absent_today", "args": {}}}]}}]}
    monkeypatch.setattr(ai_service, "_gemini", fake_gemini)

    status = (await client.get(f"{API}/ai", headers=admin_headers)).json()["data"]
    assert status["provider"] == "gemini"
    for q in ["H, How are you?", "hello", "Good morning sir", "namaste ji, kaise ho?"]:
        a = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": q})).json()["data"]
        assert a["text"].startswith("Hello") and a["suggestions"] and a["template"] is None, q
    thanks = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "thank you!"})).json()["data"]
    assert thanks["text"].startswith("You're welcome")
    assert calls == []  # small talk never costs a model call

    # A greeting with a real question in it is still answered.
    a = (await client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": "hi, who is absent today?"})).json()["data"]
    assert a["template"] == "absent_today" and len(calls) == 1


async def test_admission_enquiries(client, db, school, admin_headers):
    await _setup(client, db, school, admin_headers)
    ask = lambda q: client.post(f"{API}/ai/ask", headers=admin_headers, json={"question": q})  # noqa: E731
    empty = (await ask("how many inquiries I have?")).json()["data"]
    assert empty["template"] == "enquiries" and "no admission enquiries yet" in empty["text"]

    for name in ("Riya", "Kabir"):
        r = await client.post(f"{API}/admissions", headers=admin_headers, json={"student_name": name, "parent_name": "Parent", "phone": "9876543210"})
        assert r.status_code == 201, r.text
    a = (await ask("how many inquiries I have?")).json()["data"]
    assert a["template"] == "enquiries" and a["text"].startswith("You have 2 open admission enquiries") and a["link"] == "/admissions"
    assert ["New", 2] in a["rows"]
