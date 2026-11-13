"""SMS/WhatsApp, chat, parent-teacher meetings and surveys."""
from datetime import date, timedelta

from sqlalchemy import select

from app.models import MessageLog
from tests import factories, test_attendance, test_communication
from tests.factories import API, PASSWORD
from tests.test_attendance import today


async def test_sms_whatsapp_settings_and_absent_alert(client, db, school, admin_headers, super_headers):
    section, ids, parent_pw, _, _ = await test_attendance.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    st = (await client.get(f"{API}/messaging/status", headers=admin_headers)).json()["data"]
    assert st["sms_provider"] == "console" and "absent" in st["events"]
    assert (await client.put(f"{API}/messaging/settings", headers=t, json={"events": {}})).status_code == 403
    saved = (await client.put(f"{API}/messaging/settings", headers=admin_headers, json={"events": {"absent": ["sms", "whatsapp"], "bogus": ["sms"]}})).json()["data"]
    assert saved["chosen"] == {"absent": ["sms", "whatsapp"]}

    if today().weekday() != 6:
        body = {"date": today().isoformat(), "records": [{"student_id": i, "status": "absent" if n == 0 else "present"} for n, i in enumerate(ids)]}
        assert (await client.put(f"{API}/attendance/sections/{section.id}", headers=t, json=body)).status_code == 200
        logs = (await db.scalars(select(MessageLog).where(MessageLog.kind == "absent"))).all()
        assert {(m.channel, m.to) for m in logs} == {("sms", "+919000000001"), ("whatsapp", "+919000000001")}  # Mum Zero's phone
        assert all(m.status == "logged" for m in logs) and "absent" in logs[0].body

    # Testing the SMS/WhatsApp provider is the platform's job, not the school's.
    assert (await client.post(f"{API}/messaging/test", headers=admin_headers, json={"channel": "sms", "phone": "98140 10001"})).status_code == 403
    sent = await client.post(f"{API}/messaging/test", headers=super_headers, json={"channel": "sms", "phone": "98140 10001"})
    assert sent.json()["data"]["message"].startswith("Test sms logged")
    assert (await client.post(f"{API}/messaging/test", headers=super_headers, json={"channel": "sms", "phone": "12-34"})).status_code == 422
    test_row = await db.scalar(select(MessageLog).where(MessageLog.kind == "test"))
    assert test_row.to == "+919814010001" and test_row.school_id is None


async def test_chat_between_parent_and_teacher(client, db, school, admin_headers):
    a, b, maths, science, student_id, parent_pw = await test_communication.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)
    other = await factories.user(db, school, "t9@t.com", "teacher")
    o = await factories.login_headers(client, "t9@t.com", PASSWORD, school.slug)

    contacts = (await client.get(f"{API}/chat/contacts", headers=p)).json()["data"]
    assert [(c["name"], c["role"]) for c in contacts] == [("T7", "Mathematics teacher")]
    teacher_id = contacts[0]["user_id"]
    # Not a teacher of the child: refused.
    assert (await client.post(f"{API}/chat/conversations", headers=p, json={"student_id": student_id, "user_id": str(other.id), "body": "Hi"})).status_code == 403

    conv = (await client.post(f"{API}/chat/conversations", headers=p, json={"student_id": student_id, "user_id": teacher_id,
                                                                             "body": "Is there a test on Monday?"})).json()["data"]
    assert conv["other_name"] == "T7" and conv["unread"] == 0
    assert (await client.get(f"{API}/chat/unread-count", headers=t)).json()["data"]["count"] == 1
    bell = (await client.get(f"{API}/notifications", headers=t)).json()["data"]
    assert bell[0]["kind"] == "chat" and bell[0]["link"] == f"/messages?c={conv['id']}"
    tconvs = (await client.get(f"{API}/chat/conversations", headers=t)).json()["data"]
    assert tconvs[0]["other_role"] == "Parent" and tconvs[0]["unread"] == 1
    msgs = (await client.get(f"{API}/chat/conversations/{conv['id']}/messages", headers=t)).json()["data"]
    assert [(m["body"], m["mine"]) for m in msgs] == [("Is there a test on Monday?", False)]
    assert (await client.get(f"{API}/chat/unread-count", headers=t)).json()["data"]["count"] == 0
    await client.post(f"{API}/chat/conversations/{conv['id']}/messages", headers=t, json={"body": "Yes, chapters 3 and 4."})
    msgs = (await client.get(f"{API}/chat/conversations/{conv['id']}/messages", headers=p)).json()["data"]
    assert [m["mine"] for m in msgs] == [True, False] and msgs[0]["read"]

    # Strangers can't read it; the same pair reuses the conversation.
    assert (await client.get(f"{API}/chat/conversations/{conv['id']}/messages", headers=o)).status_code == 404
    again = (await client.post(f"{API}/chat/conversations", headers=p, json={"student_id": student_id, "user_id": teacher_id, "body": "Thanks!"})).json()["data"]
    assert again["id"] == conv["id"]
    # The teacher's contacts are the families of classes they teach.
    tc = (await client.get(f"{API}/chat/contacts", headers=t)).json()["data"]
    assert [(c["student_name"], c["name"], c["role"]) for c in tc] == [("Kiran Sharma", "Kiran Dad", "Father")]


async def test_ptm_booking(client, db, school, admin_headers):
    section, ids, parent_pw, teacher, other = await test_attendance.setup(client, db, school, admin_headers)
    p = await factories.login_headers(client, "mum@t.com", parent_pw, school.slug)
    t = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    d = today() + timedelta(days=5)
    day = (d + timedelta(days=1) if d.weekday() == 6 else d).isoformat()
    assert (await client.post(f"{API}/ptm", headers=t, json={"title": "PTM", "date": day, "start_time": "09:00", "end_time": "10:00",
                                                             "section_ids": [str(section.id)]})).status_code == 403
    e = (await client.post(f"{API}/ptm", headers=admin_headers, json={"title": "Term 1 PTM", "date": day, "start_time": "09:00",
                                                                       "end_time": "10:00", "slot_minutes": 15, "section_ids": [str(section.id)]})).json()["data"]
    assert e["slots"] == 4 and e["booked"] == 0
    assert any(n["kind"] == "ptm" for n in (await client.get(f"{API}/notifications", headers=p)).json()["data"])
    slots = (await client.get(f"{API}/ptm/{e['id']}/slots", headers=p)).json()["data"]
    assert slots[0]["teacher_name"] == "Ct" and [s["time"] for s in slots[0]["slots"]] == ["09:00", "09:15", "09:30", "09:45"]
    assert (await client.post(f"{API}/ptm/{e['id']}/book", headers=p, json={"student_id": ids[0], "slot": "09:05"})).status_code == 422
    assert (await client.post(f"{API}/ptm/{e['id']}/book", headers=p, json={"student_id": ids[1], "slot": "09:15"})).status_code == 404  # not their child
    booked = (await client.post(f"{API}/ptm/{e['id']}/book", headers=p, json={"student_id": ids[0], "slot": "09:15", "note": "About maths"})).json()["data"]
    assert booked[0]["booking"] == "09:15"
    moved = (await client.post(f"{API}/ptm/{e['id']}/book", headers=p, json={"student_id": ids[0], "slot": "09:30"})).json()["data"]
    assert moved[0]["booking"] == "09:30" and next(s for s in moved[0]["slots"] if s["time"] == "09:15")["free"]
    sched = (await client.get(f"{API}/ptm/{e['id']}/schedule", headers=t)).json()["data"]
    assert [(r["time"], r["student_name"]) for r in sched if r["student_name"]] == [("09:30", "Kid0 Sharma")]
    assert (await client.get(f"{API}/ptm", headers=t)).json()["data"][0]["booked"] == 1
    cleared = (await client.delete(f"{API}/ptm/{e['id']}/book/{ids[0]}", headers=p)).json()["data"]
    assert cleared[0]["booking"] is None
    assert teacher and other


async def test_surveys(client, db, school, admin_headers):
    section, ids, parent_pw, _, _ = await test_attendance.setup(client, db, school, admin_headers)
    p = await factories.login_headers(client, "mum@t.com", parent_pw, school.slug)
    t = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    body = {"title": "Canteen feedback", "audience": "families", "questions": [
        {"id": "q1", "kind": "rating", "text": "How is the food?"},
        {"id": "q2", "kind": "choice", "text": "Favourite day", "options": ["Monday", "Friday"]},
        {"id": "q3", "kind": "multi", "text": "What should we add?", "options": ["Fruit", "Juice", "Salad"], "required": False},
        {"id": "q4", "kind": "text", "text": "Anything else?", "required": False}]}
    assert (await client.post(f"{API}/surveys", headers=t, json=body)).status_code == 403
    assert (await client.post(f"{API}/surveys", headers=admin_headers, json={**body, "questions": [{"id": "x", "kind": "choice", "text": "?", "options": ["one"]}]})).status_code == 422
    s = (await client.post(f"{API}/surveys", headers=admin_headers, json=body)).json()["data"]
    assert (await client.get(f"{API}/surveys", headers=p)).json()["data"] == []  # not published yet
    await client.post(f"{API}/surveys/{s['id']}/publish", headers=admin_headers)
    mine = (await client.get(f"{API}/surveys", headers=p)).json()["data"]
    assert [x["title"] for x in mine] == ["Canteen feedback"] and mine[0]["open"] and not mine[0]["answered"]
    assert (await client.get(f"{API}/surveys", headers=t)).json()["data"] == []  # families only

    assert (await client.post(f"{API}/surveys/{s['id']}/respond", headers=p, json={"answers": {"q1": 6, "q2": "Monday"}})).status_code == 422
    assert (await client.post(f"{API}/surveys/{s['id']}/respond", headers=p, json={"answers": {"q1": 4}})).status_code == 422  # q2 required
    done = (await client.post(f"{API}/surveys/{s['id']}/respond", headers=p, json={"answers": {"q1": 4, "q2": "Friday", "q3": ["Fruit", "Salad"],
                                                                                              "q4": "More millets"}})).json()["data"]
    assert done["answered"]
    assert (await client.post(f"{API}/surveys/{s['id']}/respond", headers=p, json={"answers": {"q1": 5, "q2": "Monday"}})).json()["error"]["code"] == "SURVEY_ANSWERED"
    assert (await client.put(f"{API}/surveys/{s['id']}", headers=admin_headers, json=body)).json()["error"]["code"] == "SURVEY_ANSWERED"

    r = (await client.get(f"{API}/surveys/{s['id']}/results", headers=admin_headers)).json()["data"]
    q = {x["id"]: x for x in r["questions"]}
    assert r["responses"] == 1 and r["audience_size"] == 1
    assert q["q1"]["average"] == 4 and q["q2"]["counts"] == {"Monday": 0, "Friday": 1} and q["q3"]["counts"]["Salad"] == 1
    assert q["q4"]["texts"] == [{"text": "More millets", "by": "Mum Zero"}]
    assert date
