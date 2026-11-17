"""SMS/WhatsApp for new homework and for notices, on the channels each school chose (results are checked in tests/test_exams.py)."""
from datetime import date, timedelta

from sqlalchemy import select

from app.models import MessageLog
from tests import factories, test_communication
from tests.factories import API, PASSWORD


async def _texts(db, kind: str) -> list[MessageLog]:
    return list((await db.scalars(select(MessageLog).where(MessageLog.kind == kind))).all())


async def test_new_homework_is_texted_only_when_the_school_chose_it(client, db, school, admin_headers):
    a, _, maths, _, _, _ = await test_communication.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    due = (date.today() + timedelta(days=3)).isoformat()
    body = {"section_id": str(a.id), "subject_id": maths["id"], "title": "Exercise 3.1", "due_date": due}

    assert (await client.post(f"{API}/homework", headers=t, json=body)).status_code == 201
    assert await _texts(db, "homework") == []  # not chosen yet

    await client.put(f"{API}/messaging/settings", headers=admin_headers, json={"events": {"homework": ["whatsapp"]}})
    assert (await client.post(f"{API}/homework", headers=t, json={**body, "title": "Exercise 3.2"})).status_code == 201
    sent = await _texts(db, "homework")
    assert [(m.channel, m.to) for m in sent] == [("whatsapp", "+919000000021")]  # Kiran's father, the only family in 7 A
    assert "Mathematics" in sent[0].body and "Exercise 3.2" in sent[0].body


async def test_notices_go_by_text_once_per_phone(client, db, school, admin_headers):
    a, _, _, _, _, _ = await test_communication.setup(client, db, school, admin_headers)
    notice = {"title": "Sports day", "body": "Wear house colours", "audience": "sections", "section_ids": [str(a.id)]}

    # Only urgent notices chosen: an ordinary notice isn't texted, an urgent one is.
    await client.put(f"{API}/messaging/settings", headers=admin_headers, json={"events": {"notice": ["sms"]}})
    await client.post(f"{API}/notices", headers=admin_headers, json=notice)
    assert await _texts(db, "notices") == [] and await _texts(db, "notice") == []
    await client.post(f"{API}/notices", headers=admin_headers, json={**notice, "title": "School closed", "priority": "urgent"})
    assert [(m.channel, m.to) for m in await _texts(db, "notice")] == [("sms", "+919000000021")]

    # Every notice chosen too: an ordinary one is texted, and an urgent one reaches each phone once per channel.
    await client.put(f"{API}/messaging/settings", headers=admin_headers, json={"events": {"notice": ["sms"], "notices": ["sms", "whatsapp"]}})
    await client.post(f"{API}/notices", headers=admin_headers, json={**notice, "title": "PTM on Saturday"})
    assert sorted((m.channel, m.to) for m in await _texts(db, "notices")) == [("sms", "+919000000021"), ("whatsapp", "+919000000021")]
    await client.post(f"{API}/notices", headers=admin_headers, json={**notice, "title": "Heavy rain", "priority": "urgent"})
    urgent = [m for m in await _texts(db, "notice") if "Heavy rain" in m.body]
    assert sorted((m.channel, m.to) for m in urgent) == [("sms", "+919000000021"), ("whatsapp", "+919000000021")]
