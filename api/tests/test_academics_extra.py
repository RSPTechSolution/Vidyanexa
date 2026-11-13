"""Syllabus and lesson plans, certificates and ID cards, admission enquiries, promotion, substitutions."""
import uuid
from datetime import date, timedelta

from sqlalchemy import select

from app.models import SchoolClass, Section, Student
from tests import factories, test_communication
from tests.factories import API, PASSWORD, student_body


def next_weekday(d: date, weekday: int) -> date:
    """The first date on or after d that falls on weekday (1 = Monday)."""
    return d + timedelta(days=(weekday - d.isoweekday()) % 7)


# ---- syllabus & lesson plans ------------------------------------------------------------------

async def test_syllabus_scope_progress_and_family_view(client, db, school, admin_headers):
    a, b, maths, science, student_id, parent_pw = await test_communication.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)

    # The teacher may write the Maths syllabus for Class 7 (they teach it) but not Science, nor Class 8.
    bulk = await client.post(f"{API}/syllabus/topics/bulk", headers=t, json={
        "class_id": str(a.class_id), "subject_id": maths["id"],
        "text": "1. Number system: Integers\n2. Number system: Fractions\n- Algebra: Simple equations\n\n Geometry basics"})
    assert bulk.status_code == 201, bulk.text
    assert bulk.json()["data"]["added"] == 4
    assert (await client.post(f"{API}/syllabus/topics/bulk", headers=t, json={
        "class_id": str(a.class_id), "subject_id": science["id"], "text": "Plants"})).status_code == 403
    assert (await client.post(f"{API}/syllabus/topics", headers=t, json={
        "class_id": str(b.class_id), "subject_id": maths["id"], "title": "x"})).status_code == 403
    assert (await client.post(f"{API}/syllabus/topics", headers=p, json={
        "class_id": str(a.class_id), "subject_id": maths["id"], "title": "x"})).status_code == 403

    view = (await client.get(f"{API}/syllabus/classes/{a.class_id}/subjects/{maths['id']}", headers=t)).json()["data"]
    assert [(x["unit"], x["title"]) for x in view["topics"]] == [
        ("Number system", "Integers"), ("Number system", "Fractions"), ("Algebra", "Simple equations"), (None, "Geometry basics")]
    assert view["can_edit_topics"] and view["sections"][0]["editable"]
    first, second = view["topics"][0]["id"], view["topics"][1]["id"]
    month = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y-%m")  # last month: overdue if not done
    await client.patch(f"{API}/syllabus/topics/{second}", headers=t, json={"planned_month": month})

    assert (await client.put(f"{API}/syllabus/progress", headers=t, json={"topic_id": first, "section_id": str(a.id)})).status_code == 200
    future = (date.today() + timedelta(days=3)).isoformat()
    assert (await client.put(f"{API}/syllabus/progress", headers=t, json={"topic_id": first, "section_id": str(a.id),
                                                                       "completed_on": future})).status_code == 422
    assert (await client.put(f"{API}/syllabus/progress", headers=t, json={"topic_id": first, "section_id": str(b.id)})).status_code == 422

    cov = (await client.get(f"{API}/syllabus/coverage", headers=t)).json()["data"]
    assert len(cov) == 1 and cov[0]["done"] == 1 and cov[0]["total"] == 4 and cov[0]["percent"] == 25.0
    assert cov[0]["behind"] == 1 and cov[0]["last_topic"] == "Integers"
    admin_cov = (await client.get(f"{API}/syllabus/coverage", headers=admin_headers)).json()["data"]
    assert any(r["section_id"] == str(a.id) for r in admin_cov)

    mine = (await client.get(f"{API}/syllabus/my", headers=p)).json()["data"]
    assert mine[0]["subjects"][0]["subject_name"] == "Mathematics" and mine[0]["subjects"][0]["done"] == 1
    assert (await client.get(f"{API}/syllabus/coverage", headers=p)).status_code == 403

    # Lesson plans: own sections only; marking taught ticks the topic off.
    day = date.today().isoformat()
    bad = await client.post(f"{API}/lesson-plans", headers=t, json={"section_id": str(b.id), "subject_id": maths["id"], "date": day, "title": "x"})
    assert bad.status_code == 403
    wrong_topic = await client.post(f"{API}/lesson-plans", headers=t, json={
        "section_id": str(a.id), "subject_id": maths["id"], "date": day, "title": "x", "topic_id": "00000000-0000-0000-0000-000000000000"})
    assert wrong_topic.status_code == 404
    lp = (await client.post(f"{API}/lesson-plans", headers=t, json={
        "section_id": str(a.id), "subject_id": maths["id"], "date": day, "title": "Adding fractions", "topic_id": second,
        "objectives": "Add like fractions", "activities": "Pizza slices"})).json()["data"]
    assert lp["topic_title"] == "Fractions" and lp["status"] == "planned" and lp["can_edit"]
    done = (await client.post(f"{API}/lesson-plans/{lp['id']}/taught", headers=t)).json()["data"]
    assert done["status"] == "taught"
    cov = (await client.get(f"{API}/syllabus/coverage", headers=t)).json()["data"]
    assert cov[0]["done"] == 2 and cov[0]["behind"] == 0
    listed = (await client.get(f"{API}/lesson-plans", headers=admin_headers, params={"from": day, "to": day})).json()["data"]
    assert [x["title"] for x in listed] == ["Adding fractions"] and listed[0]["teacher"] == "T7"
    assert (await client.get(f"{API}/lesson-plans", headers=t, params={"from": "2026-01-01", "to": "2026-12-31"})).status_code == 422

    other = await factories.user(db, school, "t8@t.com", "teacher")
    o = await factories.login_headers(client, "t8@t.com", PASSWORD, school.slug)
    assert (await client.delete(f"{API}/lesson-plans/{lp['id']}", headers=o)).status_code == 403
    assert (await client.delete(f"{API}/syllabus/topics/{first}", headers=o)).status_code == 403
    assert other
    assert (await client.delete(f"{API}/syllabus/topics/{first}", headers=admin_headers)).status_code == 200


# ---- certificates & ID cards ------------------------------------------------------------------

async def test_certificates_and_id_cards(client, db, school, admin_headers):
    _, section = await factories.klass(db, school, "Class 9")
    body = student_body(section, "TC1", first_name="Meera", gender="female",
                        guardians=[{"new_parent": {"full_name": "Raj Kapoor", "phone": "+91 90000 00031", "email": "raj@t.com"}, "relationship": "father"}])
    created = (await client.post(f"{API}/students", headers=admin_headers, json=body)).json()["data"]
    sid, parent_pw = created["student"]["id"], created["new_parent_passwords"]["raj@t.com"]
    p = await factories.login_headers(client, "raj@t.com", parent_pw, school.slug)
    t = await factories.user(db, school, "tc@t.com", "teacher")
    th = await factories.login_headers(client, "tc@t.com", PASSWORD, school.slug)

    assert (await client.post(f"{API}/certificates", headers=admin_headers, json={"student_id": sid, "kind": "bonafide"})).status_code == 422
    assert (await client.post(f"{API}/certificates", headers=th, json={"student_id": sid, "kind": "bonafide", "purpose": "Bank"})).status_code == 403
    bona = (await client.post(f"{API}/certificates", headers=admin_headers, json={"student_id": sid, "kind": "bonafide",
                                                                                  "purpose": "Opening a bank account"})).json()["data"]
    assert bona["serial_no"].startswith("BC/") and bona["serial_no"].endswith("/0001") and bona["details"] == {"purpose": "Opening a bank account"}
    second = (await client.post(f"{API}/certificates", headers=admin_headers, json={"student_id": sid, "kind": "bonafide", "purpose": "Passport"})).json()["data"]
    assert second["serial_no"].endswith("/0002")

    pdf = await client.get(f"{API}/certificates/{bona['id']}/pdf", headers=admin_headers)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert (await client.get(f"{API}/certificates/{bona['id']}/pdf", headers=p)).status_code == 200  # the family may open it

    tc_body = {"student_id": sid, "kind": "transfer", "leaving_date": date.today().isoformat(), "reason": "Family moving to Pune",
               "conduct": "Very good", "promoted": "yes", "mark_left": True}
    tc = await client.post(f"{API}/certificates", headers=admin_headers, json=tc_body)
    assert tc.status_code == 201, tc.text
    assert tc.json()["data"]["serial_no"].startswith("TC/")
    assert (await client.get(f"{API}/students/{sid}", headers=admin_headers)).json()["data"]["status"] == "inactive"
    assert (await client.post(f"{API}/certificates", headers=admin_headers, json=tc_body)).json()["error"]["code"] == "TC_EXISTS"
    tc_pdf = await client.get(f"{API}/certificates/{tc.json()['data']['id']}/pdf", headers=admin_headers)
    assert tc_pdf.status_code == 200 and len(tc_pdf.content) > 1500

    await client.post(f"{API}/certificates/{tc.json()['data']['id']}/cancel", headers=admin_headers)
    assert (await client.post(f"{API}/certificates", headers=admin_headers, json={**tc_body, "mark_left": False})).status_code == 201
    listed = (await client.get(f"{API}/certificates", headers=admin_headers, params={"student_id": sid})).json()["data"]
    assert len(listed) == 4 and sum(c["cancelled"] for c in listed) == 1
    assert (await client.get(f"{API}/certificates/{tc.json()['data']['id']}/pdf", headers=p)).status_code == 404  # cancelled

    # ID cards for a section (active students only).
    other = (await client.post(f"{API}/students", headers=admin_headers, json=student_body(section, "TC2", first_name="Kabir"))).json()["data"]
    cards = await client.post(f"{API}/certificates/id-cards", headers=admin_headers, json={"section_id": str(section.id)})
    assert cards.status_code == 200 and cards.content.startswith(b"%PDF") and "attachment" in cards.headers["content-disposition"]
    assert (await client.post(f"{API}/certificates/id-cards", headers=admin_headers, json={})).status_code == 422
    assert (await client.post(f"{API}/certificates/id-cards", headers=th, json={"student_ids": [other["student"]["id"]]})).status_code == 403
    assert t


async def test_certificates_check_dues_first_and_a_tc_can_mark_the_student_left(client, db, school, admin_headers):
    """Unpaid fees, library books or fines, a hostel bed or a bus seat stop a certificate unless the office goes ahead
    knowingly; after a TC the office is asked to mark the student as left."""
    from app.models import FeeInvoice
    _, section = await factories.klass(db, school, "Class 6")
    sid = (await client.post(f"{API}/students", headers=admin_headers, json=student_body(section, "DU1", first_name="Dev"))).json()["data"]["student"]["id"]
    clear = (await client.get(f"{API}/certificates/clearance/{sid}", headers=admin_headers)).json()["data"]
    assert clear == {"student_id": sid, "clear": True, "dues": []}

    db.add(FeeInvoice(school_id=school.id, invoice_no="INV-DUE-1", student_id=uuid.UUID(sid), term="Quarter 1", academic_year="2026-27",
                      issue_date=date.today(), due_date=date.today(), total=3000, paid=500, status="partial"))
    await db.commit()
    check = (await client.get(f"{API}/certificates/clearance/{sid}", headers=admin_headers)).json()["data"]
    assert check["clear"] is False and check["dues"] == [{"area": "fees", "label": "Fees", "detail": "₹2,500 unpaid on 1 invoice"}]

    bona = {"student_id": sid, "kind": "bonafide", "purpose": "Bank"}
    refused = await client.post(f"{API}/certificates", headers=admin_headers, json=bona)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "DUES_PENDING"
    assert refused.json()["error"]["details"]["dues"][0]["area"] == "fees"
    assert (await client.post(f"{API}/certificates", headers=admin_headers, json={**bona, "ignore_dues": True})).status_code == 201

    tc = (await client.post(f"{API}/certificates", headers=admin_headers, json={
        "student_id": sid, "kind": "transfer", "leaving_date": date.today().isoformat(), "reason": "Moving", "ignore_dues": True})).json()["data"]
    assert (await client.get(f"{API}/students/{sid}", headers=admin_headers)).json()["data"]["status"] == "active"  # not yet
    left = await client.post(f"{API}/certificates/{tc['id']}/mark-left", headers=admin_headers)
    assert left.status_code == 200
    assert (await client.get(f"{API}/students/{sid}", headers=admin_headers)).json()["data"]["status"] == "inactive"
    bona_id = (await client.get(f"{API}/certificates", headers=admin_headers, params={"student_id": sid, "kind": "bonafide"})).json()["data"][0]["id"]
    assert (await client.post(f"{API}/certificates/{bona_id}/mark-left", headers=admin_headers)).json()["error"]["code"] == "NOT_A_TC"


# ---- admission enquiries ------------------------------------------------------------------------

async def test_enquiries_pipeline_and_public_form(client, db, school, admin_headers):
    c, section = await factories.klass(db, school, "Class 3")
    rec = await factories.user(db, school, "front@t.com", "receptionist")
    r = await factories.login_headers(client, "front@t.com", PASSWORD, school.slug)
    t = await factories.user(db, school, "te@t.com", "teacher")
    th = await factories.login_headers(client, "te@t.com", PASSWORD, school.slug)

    today = date.today()
    e = (await client.post(f"{API}/admissions", headers=r, json={
        "student_name": "Anaya Rao", "class_id": str(c.id), "parent_name": "Vikram Rao", "phone": "+91 98765 43210",
        "source": "phone", "follow_up_on": (today - timedelta(days=1)).isoformat(), "note": "Wants transport"})).json()["data"]
    assert e["status"] == "new" and e["class_name"] == "Class 3" and e["overdue"] and e["notes"][0]["text"] == "Wants transport"
    assert (await client.post(f"{API}/admissions", headers=th, json={"student_name": "x", "parent_name": "y", "phone": "9999999999"})).status_code == 403
    assert (await client.post(f"{API}/admissions", headers=r, json={"student_name": "x", "parent_name": "y", "phone": "abc"})).status_code == 422

    noted = (await client.post(f"{API}/admissions/{e['id']}/notes", headers=r, json={"text": "Called, visiting Saturday"})).json()["data"]
    assert noted["status"] == "contacted" and noted["notes"][0]["text"] == "Called, visiting Saturday"
    moved = (await client.patch(f"{API}/admissions/{e['id']}", headers=r, json={"status": "visit", "follow_up_on": today.isoformat(),
                                                                                "assigned_to": str(t.id)})).json()["data"]
    assert moved["status"] == "visit" and moved["assigned_name"] == "Te" and not moved["overdue"]
    assert (await client.patch(f"{API}/admissions/{e['id']}", headers=r, json={"assigned_to": "00000000-0000-0000-0000-000000000000"})).status_code == 422

    summary = (await client.get(f"{API}/admissions/summary", headers=r)).json()["data"]
    assert summary["by_status"]["visit"] == 1 and summary["due_today"] == 1 and summary["overdue"] == 0 and summary["conversion"] is None
    due = (await client.get(f"{API}/admissions", headers=r, params={"due": True})).json()["data"]
    assert [x["student_name"] for x in due] == ["Anaya Rao"]

    # Admit: the office creates the student, then links them; the enquiry closes.
    st = (await client.post(f"{API}/students", headers=admin_headers, json=student_body(section, "ENQ1", first_name="Anaya"))).json()["data"]
    done = (await client.patch(f"{API}/admissions/{e['id']}", headers=r, json={"student_id": st["student"]["id"]})).json()["data"]
    assert done["status"] == "admitted" and done["follow_up_on"] is None
    assert (await client.get(f"{API}/admissions/summary", headers=r)).json()["data"]["conversion"] == 100.0

    # Public website form: rate limited, honeypot dropped, the office is notified.
    public = await client.post(f"{API}/public/schools/{school.slug}/enquiry", json={
        "student_name": "Ira Sen", "class_name": "class 3", "parent_name": "Maya Sen", "phone": "9876500000", "message": "Any seats?"})
    assert public.status_code == 201, public.text
    await client.post(f"{API}/public/schools/{school.slug}/enquiry", json={
        "student_name": "Bot", "parent_name": "Bot", "phone": "9876500001", "website": "http://spam"})
    assert (await client.post(f"{API}/public/schools/nope/enquiry", json={"student_name": "A", "parent_name": "B", "phone": "9876500002"})).status_code == 404
    web = (await client.get(f"{API}/admissions", headers=r, params={"status": "new"})).json()["data"]
    assert [(x["student_name"], x["source"], x["class_name"]) for x in web] == [("Ira Sen", "website", "Class 3")]
    bell = (await client.get(f"{API}/notifications", headers=r)).json()["data"]
    assert bell[0]["kind"] == "enquiry" and "Ira Sen" in bell[0]["title"]
    assert rec


# ---- promotion --------------------------------------------------------------------------------

async def test_promotion_with_exam_suggestions(client, db, school, admin_headers):
    c5, s5 = await factories.klass(db, school, "Class 5", ("A",))
    c6, s6 = await factories.klass(db, school, "Class 6", ("A", "B"), capacity=2)
    c6.sort_order = 2
    await db.commit()
    s6b = await db.scalar(select(Section).where(Section.class_id == c6.id, Section.name == "B"))
    ids = []
    for i, name in enumerate(["Aman", "Bela", "Chirag"]):
        ids.append((await client.post(f"{API}/students", headers=admin_headers, json=student_body(s5, f"P{i}", first_name=name, roll_no=i + 5))).json()["data"]["student"]["id"])
    # A published exam where Bela fails.
    maths = (await client.post(f"{API}/timetable/subjects", headers=admin_headers, json={"name": "Maths"})).json()["data"]
    exam = (await client.post(f"{API}/exams", headers=admin_headers, json={"name": "Annual", "kind": "final",
                                                                            "start_date": "2026-03-01", "end_date": "2026-03-10"})).json()["data"]
    r = await client.put(f"{API}/exams/{exam['id']}/papers", headers=admin_headers, json={"class_id": str(c5.id), "papers": [
        {"subject_id": maths["id"], "max_marks": 100, "pass_marks": 33}]})
    assert r.status_code == 200, r.text
    paper = (await client.get(f"{API}/exams/{exam['id']}", headers=admin_headers)).json()["data"]["classes_detail"][0]["papers"][0]
    await client.put(f"{API}/exams/papers/{paper['id']}/sections/{s5.id}", headers=admin_headers,
                     json={"entries": [{"student_id": i, "marks": m} for i, m in zip(ids, [80, 20, 60])]})
    await client.post(f"{API}/exams/{exam['id']}/publish", headers=admin_headers)

    pre = (await client.get(f"{API}/promotion/{s5.id}", headers=admin_headers)).json()["data"]
    assert pre["next_class_name"] == "Class 6" and pre["default_section_id"] == str(s6.id)
    assert [(s["name"], s["suggested"]) for s in pre["students"]] == [("Aman Sharma", "promote"), ("Bela Sharma", "repeat"), ("Chirag Sharma", "promote")]

    teacher = await factories.user(db, school, "pt@t.com", "teacher")
    th = await factories.login_headers(client, "pt@t.com", PASSWORD, school.slug)
    assert (await client.get(f"{API}/promotion/{s5.id}", headers=th)).status_code == 403
    assert teacher

    # Three into a section with room for two is refused as a whole.
    full = await client.post(f"{API}/promotion", headers=admin_headers, json={"section_id": str(s5.id), "items": [
        {"student_id": i, "action": "promote", "to_section_id": str(s6.id)} for i in ids]})
    assert full.json()["error"]["code"] == "SECTION_FULL"
    bad = await client.post(f"{API}/promotion", headers=admin_headers, json={"section_id": str(s5.id), "items": [
        {"student_id": ids[0], "action": "graduate"}]})
    assert bad.status_code == 422

    res = await client.post(f"{API}/promotion", headers=admin_headers, json={"section_id": str(s5.id), "items": [
        {"student_id": ids[0], "action": "promote", "to_section_id": str(s6.id)},
        {"student_id": ids[1], "action": "repeat"},
        {"student_id": ids[2], "action": "promote", "to_section_id": str(s6b.id)}]})
    assert res.status_code == 200, res.text
    assert res.json()["data"] == {"promoted": 2, "repeated": 1, "left": 0, "graduated": 0}
    rows = {s.first_name: s for s in (await db.scalars(select(Student).execution_options(populate_existing=True))).all()}
    assert rows["Aman"].class_id == c6.id and rows["Aman"].roll_no == 1
    assert rows["Bela"].class_id == c5.id and rows["Bela"].roll_no == 1
    assert rows["Chirag"].section_id == s6b.id

    # Class 6 is now the last class: its students graduate.
    pre6 = (await client.get(f"{API}/promotion/{s6.id}", headers=admin_headers)).json()["data"]
    assert pre6["next_class_id"] is None and pre6["students"][0]["suggested"] == "graduate"
    grad = (await client.post(f"{API}/promotion", headers=admin_headers, json={"section_id": str(s6.id), "items": [
        {"student_id": ids[0], "action": "graduate"}]})).json()["data"]
    assert grad["graduated"] == 1
    await db.refresh(rows["Aman"])
    assert rows["Aman"].status == "alumni"
    assert (await db.get(SchoolClass, c5.id)) is not None


# ---- substitutions ----------------------------------------------------------------------------

async def test_substitutions(client, db, school, admin_headers):
    periods = (await client.put(f"{API}/timetable/periods", headers=admin_headers, json={"periods": [
        {"name": "P1", "start_time": "08:00", "end_time": "08:40"}, {"name": "P2", "start_time": "08:40", "end_time": "09:20"}]})).json()["data"]
    maths = (await client.post(f"{API}/timetable/subjects", headers=admin_headers, json={"name": "Mathematics"})).json()["data"]
    _, a = await factories.klass(db, school, "Class 7")
    _, b = await factories.klass(db, school, "Class 8")
    away = await factories.user(db, school, "away@t.com", "teacher")
    busy = await factories.user(db, school, "busy@t.com", "teacher")
    free = await factories.user(db, school, "free@t.com", "teacher")
    for sec, period, t in ((a, periods[0], away), (a, periods[1], away), (b, periods[0], busy)):
        r = await client.put(f"{API}/timetable/slots", headers=admin_headers, json={
            "section_id": str(sec.id), "day": 2, "period_id": period["id"], "subject_id": maths["id"], "teacher_id": str(t.id)})
        assert r.status_code == 200, r.text
    tuesday = next_weekday(date.today() + timedelta(days=1), 2)
    wednesday = tuesday + timedelta(days=1)

    assert (await client.post(f"{API}/substitutions/absent", headers=admin_headers,
                              json={"date": wednesday.isoformat(), "teacher_id": str(away.id)})).status_code == 422  # no periods
    assert (await client.post(f"{API}/substitutions/absent", headers=admin_headers,
                              json={"date": "2020-01-07", "teacher_id": str(away.id)})).status_code == 422  # past
    day = (await client.post(f"{API}/substitutions/absent", headers=admin_headers,
                             json={"date": tuesday.isoformat(), "teacher_id": str(away.id)})).json()["data"]
    assert day["absent_teachers"][0]["periods"] == 2 and day["absent_teachers"][0]["covered"] == 0
    p1 = next(p for p in day["periods"] if p["period_name"] == "P1")
    again = (await client.post(f"{API}/substitutions/absent", headers=admin_headers,
                               json={"date": tuesday.isoformat(), "teacher_id": str(away.id)})).json()["data"]
    assert len(again["periods"]) == 2  # idempotent

    cands = (await client.get(f"{API}/substitutions/{p1['id']}/candidates", headers=admin_headers)).json()["data"]
    status = {c["full_name"]: c["status"] for c in cands}
    assert status == {"Busy": "busy", "Free": "free"} and cands[0]["full_name"] == "Free"  # the absent teacher isn't offered

    assert (await client.put(f"{API}/substitutions/{p1['id']}", headers=admin_headers, json={"substitute_id": str(busy.id)})).status_code == 422
    done = (await client.put(f"{API}/substitutions/{p1['id']}", headers=admin_headers,
                             json={"substitute_id": str(free.id), "note": "Revise chapter 3"})).json()["data"]
    assert done["substitute"] == "Free" and done["note"] == "Revise chapter 3"
    f = await factories.login_headers(client, "free@t.com", PASSWORD, school.slug)
    mine = (await client.get(f"{API}/substitutions/mine", headers=f)).json()["data"]
    assert [(m["section_label"], m["period_name"]) for m in mine] == [("Class 7 – A", "P1")]
    bell = (await client.get(f"{API}/notifications", headers=f)).json()["data"]
    assert bell[0]["kind"] == "substitution" and "Class 7 – A" in bell[0]["title"]
    assert (await client.get(f"{API}/substitutions", headers=f, params={"date": tuesday.isoformat()})).status_code == 403

    summary = (await client.get(f"{API}/substitutions", headers=admin_headers, params={"date": tuesday.isoformat()})).json()["data"]
    assert summary["absent_teachers"][0]["covered"] == 1
    cleared = (await client.post(f"{API}/substitutions/present", headers=admin_headers,
                                 json={"date": tuesday.isoformat(), "teacher_id": str(away.id)})).json()["data"]
    assert cleared["periods"] == []
