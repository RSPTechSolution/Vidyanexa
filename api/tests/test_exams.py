from sqlalchemy import select
from app.models import MessageLog
from tests import factories
from tests.factories import API, PASSWORD, student_body


async def setup(client, db, school, headers):
    """Class 6 A with three students (one with a parent login); Maths taught by `maths@t.com`, English by `eng@t.com`."""
    periods = (await client.put(f"{API}/timetable/periods", headers=headers, json={"periods": [
        {"name": "P1", "start_time": "08:00", "end_time": "08:40"}, {"name": "P2", "start_time": "08:40", "end_time": "09:20"}]})).json()["data"]
    maths = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "Mathematics"})).json()["data"]
    english = (await client.post(f"{API}/timetable/subjects", headers=headers, json={"name": "English"})).json()["data"]
    _, section = await factories.klass(db, school, "Class 6")
    t_maths = await factories.user(db, school, "maths@t.com", "teacher")
    t_eng = await factories.user(db, school, "eng@t.com", "teacher")
    for p, subj, t in ((periods[0], maths, t_maths), (periods[1], english, t_eng)):
        r = await client.put(f"{API}/timetable/slots", headers=headers, json={
            "section_id": str(section.id), "day": 1, "period_id": p["id"], "subject_id": subj["id"], "teacher_id": str(t.id)})
        assert r.status_code == 200, r.text
    ids, pw = [], None
    for i, name in enumerate(["Asha", "Bina", "Chetan"]):
        body = student_body(section, f"E{i}", first_name=name, roll_no=i + 1)
        if i == 0:
            body["guardians"] = [{"new_parent": {"full_name": "Asha Mum", "phone": "+91 90000 00011", "email": "ashamum@t.com"}, "relationship": "mother"}]
        res = (await client.post(f"{API}/students", headers=headers, json=body)).json()["data"]
        ids.append(res["student"]["id"])
        pw = pw or res["new_parent_passwords"].get("ashamum@t.com")
    exam = (await client.post(f"{API}/exams", headers=headers, json={"name": "Half-Yearly", "kind": "term",
                                                                       "start_date": "2026-09-14", "end_date": "2026-09-24"})).json()["data"]
    added = (await client.post(f"{API}/exams/{exam['id']}/papers/from-timetable", headers=headers,
                               json={"class_ids": [str(section.class_id)], "max_marks": 50, "pass_marks": 17})).json()["data"]
    assert added == {"added": 2}
    detail = (await client.get(f"{API}/exams/{exam['id']}", headers=headers)).json()["data"]
    papers = {p["subject_name"]: p for p in detail["classes_detail"][0]["papers"]}
    return section, exam, papers, ids, pw


async def test_subject_teacher_enters_only_their_marks(client, db, school, admin_headers):
    section, exam, papers, ids, _ = await setup(client, db, school, admin_headers)
    m = await factories.login_headers(client, "maths@t.com", PASSWORD, school.slug)
    sheets = (await client.get(f"{API}/exams/{exam['id']}/marks-sheets", headers=m)).json()["data"]
    assert [(s["subject_name"], s["section_label"]) for s in sheets] == [("Mathematics", "Class 6 – A")]

    url = f"{API}/exams/papers/{papers['Mathematics']['id']}/sections/{section.id}"
    too_high = await client.put(url, headers=m, json={"entries": [{"student_id": ids[0], "marks": 51}]})
    assert too_high.status_code == 422
    saved = await client.put(url, headers=m, json={"entries": [
        {"student_id": ids[0], "marks": 45}, {"student_id": ids[1], "marks": 12}, {"student_id": ids[2], "absent": True}]})
    assert saved.status_code == 200, saved.text
    rows = {r["name"]: r for r in saved.json()["data"]["rows"]}
    assert rows["Asha Sharma"]["marks"] == 45 and rows["Chetan Sharma"]["absent"] and rows["Chetan Sharma"]["marks"] is None

    # The maths teacher can't enter English marks.
    eng_url = f"{API}/exams/papers/{papers['English']['id']}/sections/{section.id}"
    sheet = (await client.get(eng_url, headers=m)).json()["data"]
    assert sheet["editable"] is False
    denied = await client.put(eng_url, headers=m, json={"entries": [{"student_id": ids[0], "marks": 40}]})
    assert denied.json()["error"]["code"] == "MARKS_LOCKED"


async def test_results_grades_ranks_and_publishing(client, db, school, admin_headers):
    section, exam, papers, ids, parent_pw = await setup(client, db, school, admin_headers)
    marks = {"Mathematics": [45, 12, 30], "English": [48, 20, 30]}
    for subj, values in marks.items():
        await client.put(f"{API}/exams/papers/{papers[subj]['id']}/sections/{section.id}", headers=admin_headers,
                         json={"entries": [{"student_id": i, "marks": v} for i, v in zip(ids, values)]})
    res = (await client.get(f"{API}/exams/{exam['id']}/results/{section.id}", headers=admin_headers)).json()["data"]
    by = {s["name"]: s for s in res["students"]}
    assert by["Asha Sharma"]["percent"] == 93.0 and by["Asha Sharma"]["grade"] == "A1" and by["Asha Sharma"]["rank"] == 1
    assert by["Bina Sharma"]["passed"] is False  # 12/50 is below the pass mark of 17
    assert by["Chetan Sharma"]["rank"] == 2 and by["Bina Sharma"]["rank"] == 3
    assert res["pass_rate"] == 66.7

    p = await factories.login_headers(client, "ashamum@t.com", parent_pw, school.slug)
    hidden = await client.get(f"{API}/exams/{exam['id']}/report/{ids[0]}", headers=p)
    assert hidden.status_code == 404  # not published yet
    mine = (await client.get(f"{API}/exams/my", headers=p)).json()["data"]
    assert mine[0]["exams"] == [] and len(mine[0]["upcoming"]) == 2

    await client.put(f"{API}/exams/{exam['id']}/remarks/{ids[0]}", headers=admin_headers, json={"remark": "Excellent work."})
    await client.put(f"{API}/messaging/settings", headers=admin_headers, json={"events": {"results": ["sms"]}})
    assert (await client.post(f"{API}/exams/{exam['id']}/publish", headers=admin_headers)).status_code == 200
    texts = (await db.scalars(select(MessageLog).where(MessageLog.kind == "results"))).all()
    assert [(m.channel, m.to) for m in texts] == [("sms", "+919000000011")] and "results are out" in texts[0].body  # Asha's mother
    card = (await client.get(f"{API}/exams/{exam['id']}/report/{ids[0]}", headers=p)).json()["data"]
    assert card["result"]["percent"] == 93.0 and card["result"]["remark"] == "Excellent work." and card["class_size"] == 3
    assert (await client.get(f"{API}/exams/{exam['id']}/report/{ids[1]}", headers=p)).status_code == 404  # not their child
    mine = (await client.get(f"{API}/exams/my", headers=p)).json()["data"]
    assert mine[0]["exams"][0]["grade"] == "A1" and mine[0]["exams"][0]["rank"] == 1

    # Published results are locked; the date sheet too.
    locked = await client.put(f"{API}/exams/papers/{papers['English']['id']}/sections/{section.id}", headers=admin_headers,
                              json={"entries": [{"student_id": ids[0], "marks": 10}]})
    assert locked.json()["error"]["code"] == "MARKS_LOCKED"
    assert (await client.delete(f"{API}/exams/{exam['id']}", headers=admin_headers)).json()["error"]["code"] == "EXAM_HAS_MARKS"


async def test_datesheet_validation(client, db, school, admin_headers):
    section, exam, papers, _, _ = await setup(client, db, school, admin_headers)
    bad = await client.put(f"{API}/exams/{exam['id']}/papers", headers=admin_headers, json={"class_id": str(section.class_id), "papers": [
        {"subject_id": papers["Mathematics"]["subject_id"], "exam_date": "2026-10-30", "max_marks": 50, "pass_marks": 17}]})
    assert bad.status_code == 422  # outside the exam period
    worse = await client.put(f"{API}/exams/{exam['id']}/papers", headers=admin_headers, json={"class_id": str(section.class_id), "papers": [
        {"subject_id": papers["Mathematics"]["subject_id"], "max_marks": 50, "pass_marks": 60}]})
    assert worse.status_code == 422
    ok = await client.put(f"{API}/exams/{exam['id']}/papers", headers=admin_headers, json={"class_id": str(section.class_id), "papers": [
        {"subject_id": papers["Mathematics"]["subject_id"], "exam_date": "2026-09-15", "max_marks": 80, "pass_marks": 27}]})
    assert ok.status_code == 200
    only = ok.json()["data"]["classes_detail"][0]["papers"]
    assert [(p["subject_name"], p["max_marks"]) for p in only] == [("Mathematics", 80)]  # English removed (no marks yet)
