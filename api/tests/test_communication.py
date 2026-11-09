from datetime import date, timedelta

from sqlalchemy import select

from app.models import User
from tests import factories
from tests.factories import API, PASSWORD, student_body


async def setup(client, db, school, headers):
    """Two sections; a teacher who teaches Maths in 7 A only; a parent of a child in 7 A."""
    periods = (await client.put(f"{API}/timetable/periods", headers=headers, json={"periods": [
        {"name": "P1", "start_time": "08:00", "end_time": "08:40"}]})).json()["data"]
    maths = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "Mathematics"})).json()["data"]
    science = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "Science"})).json()["data"]
    _, a = await factories.klass(db, school, "Class 7")
    _, b = await factories.klass(db, school, "Class 8")
    t = await factories.user(db, school, "t7@t.com", "teacher")
    await client.put(f"{API}/timetable/slots", headers=headers, json={
        "section_id": str(a.id), "day": 1, "period_id": periods[0]["id"], "subject_id": maths["id"], "teacher_id": str(t.id)})
    body = student_body(a, "C1", first_name="Kiran", guardians=[{"new_parent": {"full_name": "Kiran Dad", "phone": "+91 90000 00021", "email": "kdad@t.com"}, "relationship": "father"}])
    created = (await client.post(f"{API}/students", headers=headers, json=body)).json()["data"]
    await client.post(f"{API}/students", headers=headers, json=student_body(b, "C2", first_name="Other"))
    return a, b, maths, science, created["student"]["id"], created["new_parent_passwords"]["kdad@t.com"]


async def test_notice_audiences_and_reads(client, db, school, admin_headers):
    a, b, *_, parent_pw = await setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)

    # Teachers post only to their own classes.
    wide = await client.post(f"{API}/notices", headers=t, json={"title": "Holiday", "body": "x", "audience": "everyone"})
    assert wide.status_code == 422
    other = await client.post(f"{API}/notices", headers=t, json={"title": "Test on Monday", "body": "x", "audience": "sections", "section_ids": [str(b.id)]})
    assert other.status_code == 422
    # Teaching a subject in a class isn't enough: only the class teacher (incharge) posts to the class.
    taught = await client.post(f"{API}/notices", headers=t, json={"title": "Maths test", "body": "x", "audience": "sections", "section_ids": [str(a.id)]})
    assert taught.status_code == 422 and "class teacher" in taught.text
    t7 = await db.scalar(select(User.id).where(User.email == "t7@t.com"))
    await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": str(t7)})
    mine = await client.post(f"{API}/notices", headers=t, json={"title": "Maths test on Monday", "body": "Chapters 3-4", "audience": "sections", "section_ids": [str(a.id)]})
    assert mine.status_code == 201, mine.text
    assert mine.json()["data"]["audience_label"] == "Class 7"  # the whole class (it has one section) and mine.json()["data"]["recipients"] == 1

    await client.post(f"{API}/notices", headers=admin_headers, json={"title": "Staff meeting", "body": "4 pm", "audience": "staff"})
    await client.post(f"{API}/notices", headers=admin_headers, json={"title": "Diwali holidays", "body": "School closed", "audience": "everyone", "pinned": True, "priority": "important"})
    await client.post(f"{API}/notices", headers=admin_headers, json={"title": "Class 8 trip", "body": "Bring lunch", "audience": "sections", "section_ids": [str(b.id)]})

    seen = (await client.get(f"{API}/notices", headers=p)).json()["data"]
    assert [n["title"] for n in seen] == ["Diwali holidays", "Maths test on Monday"]  # pinned first; no staff or Class 8 notice
    assert (await client.get(f"{API}/notices/unread-count", headers=p)).json()["data"]["count"] == 2
    await client.post(f"{API}/notices/{seen[1]['id']}/read", headers=p)
    await client.post(f"{API}/notices/{seen[1]['id']}/read", headers=p)  # idempotent
    assert (await client.get(f"{API}/notices/unread-count", headers=p)).json()["data"]["count"] == 1
    authored = next(n for n in (await client.get(f"{API}/notices", headers=t)).json()["data"] if n["title"].startswith("Maths"))
    assert authored["reads"] == 2  # the author and the parent

    staff_view = (await client.get(f"{API}/notices", headers=admin_headers)).json()["data"]
    assert len(staff_view) == 4
    staff_notice = next(n for n in staff_view if n["title"] == "Staff meeting")
    assert (await client.post(f"{API}/notices/{staff_notice['id']}/read", headers=p)).status_code == 404
    assert (await client.delete(f"{API}/notices/{staff_notice['id']}", headers=t)).status_code == 403
    assert (await client.post(f"{API}/notices", headers=p, json={"title": "Hi", "body": "x", "audience": "everyone"})).status_code == 403


async def test_homework_flow(client, db, school, admin_headers):
    a, b, maths, science, student_id, parent_pw = await setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)
    due = (date.today() + timedelta(days=3)).isoformat()

    targets = (await client.get(f"{API}/homework/targets", headers=t)).json()["data"]
    assert [(x["section_label"], [s["name"] for s in x["subjects"]]) for x in targets] == [("Class 7 – A", ["Mathematics"])]
    wrong = await client.post(f"{API}/homework", headers=t, json={"section_id": str(a.id), "subject_id": science["id"], "title": "Read ch 2", "due_date": due})
    assert wrong.status_code == 403
    past = await client.post(f"{API}/homework", headers=t, json={"section_id": str(a.id), "subject_id": maths["id"], "title": "Ex 3.1", "due_date": "2020-01-01"})
    assert past.status_code == 422
    hw = (await client.post(f"{API}/homework", headers=t, json={"section_id": str(a.id), "subject_id": maths["id"],
                                                                 "title": "Exercise 3.1, Q1-10", "details": "In the notebook", "due_date": due})).json()["data"]
    assert hw["students"] == 1 and hw["done"] == 0

    mine = (await client.get(f"{API}/homework/my", headers=p)).json()["data"]
    assert len(mine) == 1 and mine[0]["status"] == "pending" and mine[0]["student_id"] == student_id
    assert (await client.post(f"{API}/homework/{hw['id']}/done", headers=p, json={"student_id": student_id, "note": "Done Q1-10"})).status_code == 200
    detail = (await client.get(f"{API}/homework/{hw['id']}", headers=t)).json()["data"]
    assert detail["roster"][0]["status"] == "done" and detail["roster"][0]["note"] == "Done Q1-10" and detail["done"] == 1

    checked = (await client.put(f"{API}/homework/{hw['id']}/check", headers=t, json={"entries": [
        {"student_id": student_id, "status": "checked", "remark": "Neat work"}]})).json()["data"]
    assert checked["roster"][0]["status"] == "checked" and checked["checked"] == 1
    late = await client.post(f"{API}/homework/{hw['id']}/done", headers=p, json={"student_id": student_id, "done": False})
    assert late.json()["error"]["code"] == "ALREADY_CHECKED"
    assert (await client.get(f"{API}/homework", headers=p)).status_code == 403


async def test_teachers_see_only_their_own_homework(client, db, school, admin_headers):
    """A subject teacher sees their subject only; the class teacher (incharge) sees all of their class; admins see all."""
    a, b, maths, science, *_ = await setup(client, db, school, admin_headers)
    sci = await factories.user(db, school, "sci7@t.com", "teacher")
    periods = (await client.get(f"{API}/timetable/periods", headers=admin_headers)).json()["data"]
    await client.put(f"{API}/timetable/slots", headers=admin_headers, json={
        "section_id": str(a.id), "day": 2, "period_id": periods[0]["id"], "subject_id": science["id"], "teacher_id": str(sci.id)})
    incharge = await factories.user(db, school, "ct7@t.com", "teacher")
    await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": str(incharge.id)})
    due = (date.today() + timedelta(days=3)).isoformat()

    def titles(r):
        return sorted(h["title"] for h in r.json()["data"])

    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    s = await factories.login_headers(client, "sci7@t.com", PASSWORD, school.slug)
    ct = await factories.login_headers(client, "ct7@t.com", PASSWORD, school.slug)
    for headers, subject, title in [(t, maths, "Maths 7"), (s, science, "Science 7")]:
        r = await client.post(f"{API}/homework", headers=headers, json={"section_id": str(a.id), "subject_id": subject["id"], "title": title, "due_date": due})
        assert r.status_code == 201, r.text
    await client.post(f"{API}/homework", headers=admin_headers, json={"section_id": str(b.id), "subject_id": maths["id"], "title": "Maths 8", "due_date": due})

    assert titles(await client.get(f"{API}/homework", headers=t)) == ["Maths 7"]
    assert titles(await client.get(f"{API}/homework", headers=s)) == ["Science 7"]
    assert titles(await client.get(f"{API}/homework", headers=ct)) == ["Maths 7", "Science 7"]
    assert titles(await client.get(f"{API}/homework", headers=admin_headers)) == ["Maths 7", "Maths 8", "Science 7"]
    # The class teacher's two tabs: what they set themselves, and their whole class.
    await client.post(f"{API}/homework", headers=admin_headers, json={"section_id": str(b.id), "subject_id": science["id"], "title": "Science 8", "due_date": due})
    await client.put(f"{API}/timetable/slots", headers=admin_headers, json={
        "section_id": str(b.id), "day": 3, "period_id": periods[0]["id"], "subject_id": science["id"], "teacher_id": str(incharge.id)})
    assert titles(await client.get(f"{API}/homework", headers=ct, params={"view": "mine"})) == ["Science 8"]
    assert titles(await client.get(f"{API}/homework", headers=ct, params={"view": "class"})) == ["Maths 7", "Science 7"]
    assert titles(await client.get(f"{API}/homework", headers=t, params={"view": "class"})) == []
    assert titles(await client.get(f"{API}/homework", headers=t, params={"view": "mine"})) == ["Maths 7"]
    science_hw = next(h for h in (await client.get(f"{API}/homework", headers=s)).json()["data"])
    assert (await client.get(f"{API}/homework/{science_hw['id']}", headers=t)).status_code == 404
