from sqlalchemy import select

from app.models import Student, StudentGuardian
from tests import factories
from tests.factories import API, PASSWORD

BELL = [
    {"name": "Period 1", "start_time": "08:00", "end_time": "08:40"},
    {"name": "Period 2", "start_time": "08:40", "end_time": "09:20"},
    {"name": "Break", "start_time": "09:20", "end_time": "09:40", "is_break": True},
    {"name": "Period 3", "start_time": "09:40", "end_time": "10:20"},
]


async def setup(client, db, school, headers):
    periods = (await client.put(f"{API}/timetable/periods", headers=headers, json={"periods": BELL})).json()["data"]
    maths = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "Mathematics", "color": "blue"})).json()["data"]
    english = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "English", "color": "rose"})).json()["data"]
    _, a = await factories.klass(db, school, "Class 5", ("A", "B"))
    b = (await client.get(f"{API}/classes", headers=headers)).json()["data"][0]["sections"][1]
    teacher = await factories.user(db, school, "priya@t.com", "teacher")
    other = await factories.user(db, school, "ravi@t.com", "teacher")
    return periods, maths, english, str(a.id), b["id"], teacher, other


async def test_bell_schedule_validation(client, admin_headers):
    bad = await client.put(f"{API}/timetable/periods", headers=admin_headers, json={"periods": [
        {"name": "P1", "start_time": "08:00", "end_time": "08:45"},
        {"name": "P2", "start_time": "08:30", "end_time": "09:15"},
    ]})
    assert bad.status_code == 422 and "overlaps" in bad.json()["error"]["details"][0]["message"]
    backwards = await client.put(f"{API}/timetable/periods", headers=admin_headers,
                                 json={"periods": [{"name": "P1", "start_time": "09:00", "end_time": "08:00"}]})
    assert backwards.status_code == 422

    saved = (await client.put(f"{API}/timetable/periods", headers=admin_headers, json={"periods": BELL})).json()["data"]
    assert [p["name"] for p in saved] == ["Period 1", "Period 2", "Break", "Period 3"]
    # Renaming keeps the id (and so the lessons in that slot).
    renamed = [{**BELL[0], "id": saved[0]["id"], "name": "Assembly period"}] + BELL[1:]
    again = (await client.put(f"{API}/timetable/periods", headers=admin_headers, json={"periods": renamed})).json()["data"]
    assert again[0]["id"] == saved[0]["id"] and again[0]["name"] == "Assembly period"


async def test_teacher_cannot_be_double_booked(client, db, school, admin_headers):
    periods, maths, english, sec_a, sec_b, teacher, _ = await setup(client, db, school, admin_headers)
    p1 = periods[0]["id"]
    slot = {"day": 1, "period_id": p1, "subject_id": maths["id"], "teacher_id": str(teacher.id)}

    ok = await client.put(f"{API}/timetable/slots", headers=admin_headers, json={**slot, "section_id": sec_a, "room": "101"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["data"]["teacher_name"] == teacher.full_name and ok.json()["data"]["section_label"] == "Class 5 – A"

    clash = await client.put(f"{API}/timetable/slots", headers=admin_headers, json={**slot, "section_id": sec_b})
    assert clash.status_code == 409 and clash.json()["error"]["code"] == "TEACHER_BUSY"
    assert "Class 5 – A" in clash.json()["error"]["message"]

    # Same teacher, same section, changing subject is fine; another day is fine.
    assert (await client.put(f"{API}/timetable/slots", headers=admin_headers,
                             json={**slot, "section_id": sec_a, "subject_id": english["id"]})).status_code == 200
    assert (await client.put(f"{API}/timetable/slots", headers=admin_headers, json={**slot, "section_id": sec_b, "day": 2})).status_code == 200

    brk = await client.put(f"{API}/timetable/slots", headers=admin_headers, json={**slot, "section_id": sec_a, "period_id": periods[2]["id"]})
    assert brk.status_code == 422

    view = (await client.get(f"{API}/timetable/teachers/{teacher.id}", headers=admin_headers)).json()["data"]
    assert len(view["entries"]) == 2 and {e["section_label"] for e in view["entries"]} == {"Class 5 – A", "Class 5 – B"}


async def test_availability_and_suggestions(client, db, school, admin_headers):
    periods, maths, _, sec_a, sec_b, teacher, other = await setup(client, db, school, admin_headers)
    p1 = periods[0]["id"]
    await client.put(f"{API}/timetable/teachers/{other.id}/subjects", headers=admin_headers, json={"subject_ids": [maths["id"]]})
    await client.put(f"{API}/timetable/slots", headers=admin_headers,
                     json={"section_id": sec_a, "day": 1, "period_id": p1, "subject_id": maths["id"], "teacher_id": str(teacher.id)})

    res = await client.get(f"{API}/timetable/available-teachers", headers=admin_headers,
                           params={"day": 1, "period_id": p1, "subject_id": maths["id"], "section_id": sec_b})
    teachers = {t["full_name"]: t for t in res.json()["data"]}
    assert teachers[other.full_name]["status"] == "free" and teachers[other.full_name]["qualified"]
    assert teachers[teacher.full_name]["status"] == "busy" and teachers[teacher.full_name]["busy_with"] == "Class 5 – A"
    assert res.json()["data"][0]["full_name"] == other.full_name  # free + qualified first

    # Can't block a slot the teacher is already teaching in.
    blocked = await client.put(f"{API}/timetable/teachers/{teacher.id}/unavailability", headers=admin_headers,
                               json={"slots": [{"day": 1, "period_id": p1}]})
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "TEACHER_SCHEDULED"

    await client.put(f"{API}/timetable/teachers/{other.id}/unavailability", headers=admin_headers,
                     json={"slots": [{"day": 1, "period_id": p1}]})
    refused = await client.put(f"{API}/timetable/slots", headers=admin_headers,
                               json={"section_id": sec_b, "day": 1, "period_id": p1, "subject_id": maths["id"], "teacher_id": str(other.id)})
    assert refused.json()["error"]["code"] == "TEACHER_UNAVAILABLE"
    listed = {t["full_name"]: t for t in (await client.get(f"{API}/timetable/teachers", headers=admin_headers)).json()["data"]}
    assert listed[other.full_name]["unavailable"] == [{"day": 1, "period_id": p1}]
    assert listed[teacher.full_name]["periods_per_week"] == 1


async def test_copy_and_subject_in_use(client, db, school, admin_headers):
    periods, maths, english, sec_a, sec_b, teacher, _ = await setup(client, db, school, admin_headers)
    for day in (1, 2):
        await client.put(f"{API}/timetable/slots", headers=admin_headers, json={
            "section_id": sec_a, "day": day, "period_id": periods[0]["id"], "subject_id": maths["id"], "teacher_id": str(teacher.id)})
    copied = (await client.post(f"{API}/timetable/sections/{sec_b}/copy", headers=admin_headers,
                                json={"source_section_id": sec_a, "include_teachers": True})).json()["data"]
    assert copied == {"copied": 2, "with_teacher": 0}  # the teacher is busy in A at those times
    b = (await client.get(f"{API}/timetable/sections/{sec_b}", headers=admin_headers)).json()["data"]
    assert len(b["entries"]) == 2 and all(e["teacher_id"] is None for e in b["entries"])

    in_use = await client.delete(f"{API}/timetable/subjects/{maths['id']}", headers=admin_headers)
    assert in_use.json()["error"]["code"] == "SUBJECT_IN_USE"
    assert (await client.delete(f"{API}/timetable/subjects/{english['id']}", headers=admin_headers)).status_code == 200

    await client.request("DELETE", f"{API}/timetable/slots", headers=admin_headers,
                         params={"section_id": sec_b, "day": 1, "period_id": periods[0]["id"]})
    assert len((await client.get(f"{API}/timetable/sections/{sec_b}", headers=admin_headers)).json()["data"]["entries"]) == 1


async def test_my_timetable_per_role(client, db, school, admin_headers):
    periods, maths, _, sec_a, _, teacher, _ = await setup(client, db, school, admin_headers)
    await client.put(f"{API}/timetable/slots", headers=admin_headers, json={
        "section_id": sec_a, "day": 3, "period_id": periods[0]["id"], "subject_id": maths["id"], "teacher_id": str(teacher.id)})
    class_id = (await client.get(f"{API}/classes", headers=admin_headers)).json()["data"][0]["id"]
    created = await client.post(f"{API}/students", headers=admin_headers, json={
        "first_name": "Riya", "last_name": "Sharma", "gender": "female", "date_of_birth": "2016-04-12",
        "admission_no": "A1", "admission_date": "2024-04-01", "class_id": class_id, "section_id": sec_a,
        "guardians": [{"new_parent": {"full_name": "Parent One", "phone": "+91 90000 00001", "email": "p1@t.com"}, "relationship": "mother"}],
    })
    assert created.status_code == 201, created.text
    pw = created.json()["data"]["new_parent_passwords"]["p1@t.com"]

    t_headers = await factories.login_headers(client, "priya@t.com", PASSWORD, school.slug)
    mine = (await client.get(f"{API}/timetable/my", headers=t_headers)).json()["data"]
    assert mine[0]["kind"] == "teacher" and len(mine[0]["entries"]) == 1
    # Teachers can look but not edit.
    assert (await client.get(f"{API}/timetable/sections/{sec_a}", headers=t_headers)).status_code == 200
    assert (await client.put(f"{API}/timetable/slots", headers=t_headers, json={
        "section_id": sec_a, "day": 4, "period_id": periods[0]["id"], "subject_id": maths["id"]})).status_code == 403

    p_headers = await factories.login_headers(client, "p1@t.com", pw, school.slug)
    kids = (await client.get(f"{API}/timetable/my", headers=p_headers)).json()["data"]
    assert kids[0]["title"] == "Riya Sharma" and kids[0]["subtitle"] == "Class 5 – A" and len(kids[0]["entries"]) == 1
    riya = await db.scalar(select(Student.id).where(Student.first_name == "Riya"))
    assert kids[0]["student_id"] == str(riya)  # which child, for the app's child switcher
    assert (await client.get(f"{API}/timetable/sections/{sec_a}", headers=p_headers)).status_code == 403
    assert await db.scalar(select(StudentGuardian.id).join(Student, Student.id == StudentGuardian.student_id))


async def test_tenant_isolation(client, db, school, other_school, admin_headers):
    periods, maths, *_ = await setup(client, db, school, admin_headers)
    await factories.user(db, other_school, "boss@o.com", "school_admin")
    o_headers = await factories.login_headers(client, "boss@o.com", PASSWORD, other_school.slug)
    assert (await client.get(f"{API}/timetable/subjects", headers=o_headers)).json()["data"] == []
    assert (await client.get(f"{API}/timetable/periods", headers=o_headers)).json()["data"] == []
    assert (await client.delete(f"{API}/timetable/subjects/{maths['id']}", headers=o_headers)).status_code == 404
