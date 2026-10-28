"""One account per email across schools, families closing their accounts when they leave, one class per class
teacher, and messaging a new student."""
from sqlalchemy import select

from app.models import Section, Student, User
from tests import factories, test_attendance
from tests.factories import PASSWORD, student_body

API = "/api/v1"


async def test_an_email_has_one_active_account_until_the_family_leaves(client, db, school, other_school, admin_headers):
    section, ids, parent_pw, _, _ = await test_attendance.setup(client, db, school, admin_headers)
    alpha_id = school.id
    beta_admin = await factories.user(db, other_school, "admin@beta.edu", "school_admin")
    beta = await factories.login_headers(client, beta_admin.email, PASSWORD, None)
    _, beta_section = await factories.klass(db, other_school, "Class 5")

    # Beta can't add Mum while her account at Alpha is active.
    body = student_body(beta_section, "B1", guardians=[{"new_parent": {"full_name": "Mum Zero", "phone": "+91 90000 00009", "email": "mum@t.com"}, "relationship": "mother"}])
    res = await client.post(f"{API}/students", headers=beta, json=body)
    assert res.status_code == 422 and "another school" in res.json()["error"]["details"][0]["message"]
    assert (await client.post(f"{API}/users", headers=beta, json={"email": "MUM@t.com", "full_name": "Mum", "role": "teacher",
                                                                  "password": "TempPass123"})).status_code == 422

    # Mum signs in with her email alone, and asks Alpha to close the accounts.
    mum = await factories.login_headers(client, "mum@t.com", parent_pw, None)
    assert (await client.post(f"{API}/account-requests", headers=mum, json={"student_ids": [ids[1]], "reason": "Moving"})).status_code == 422
    req = (await client.post(f"{API}/account-requests", headers=mum, json={"student_ids": [ids[0]], "reason": "Moving to Pune"})).json()["data"]
    assert req["status"] == "pending" and req["students"] == ["Kid0 Sharma"]
    assert (await client.post(f"{API}/account-requests", headers=mum, json={"student_ids": [ids[0]], "reason": "Again"})).status_code == 400
    teacher = await factories.login_headers(client, "ct@t.com", PASSWORD, None)
    assert (await client.get(f"{API}/account-requests", headers=teacher)).json()["data"] == []
    assert (await client.post(f"{API}/account-requests/{req['id']}/decide", headers=teacher, json={"approve": True})).status_code == 403

    # The school approves: Kid0 has left, Mum's login is closed, and Beta can now add her.
    listed = (await client.get(f"{API}/account-requests", headers=admin_headers)).json()["data"]
    assert [r["id"] for r in listed] == [req["id"]] and listed[0]["requested_by_email"] == "mum@t.com"
    done = (await client.post(f"{API}/account-requests/{req['id']}/decide", headers=admin_headers, json={"approve": True, "note": "All the best"})).json()["data"]
    assert done["status"] == "approved"
    db.expire_all()
    assert (await db.scalar(select(Student.status).where(Student.admission_no == "A0"))) == "inactive"
    assert (await db.scalar(select(User.is_active).where(User.email == "mum@t.com", User.school_id == alpha_id))) is False
    assert (await client.get(f"{API}/auth/me", headers=mum)).status_code == 401
    res = await client.post(f"{API}/students", headers=beta, json=body)
    assert res.status_code == 201, res.text
    new_pw = res.json()["data"]["new_parent_passwords"]["mum@t.com"]
    me = (await factories.login(client, "mum@t.com", new_pw, None)).json()["data"]["user"]
    assert me["school"]["slug"] == "beta"

    # Alpha can't switch her old account back on while Beta's is active.
    old = await db.scalar(select(User.id).where(User.email == "mum@t.com", User.school_id == alpha_id))
    assert (await client.patch(f"{API}/users/{old}", headers=admin_headers, json={"is_active": True})).status_code == 422


async def test_a_teacher_is_class_teacher_of_one_section(client, db, school, admin_headers):
    _, a = await factories.klass(db, school, "Class 6", ("A", "B"))
    b = await db.scalar(select(Section).where(Section.class_id == a.class_id, Section.name == "B"))
    t = await factories.user(db, school, "t@t.com", "teacher")
    assert (await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": str(t.id)})).status_code == 200
    res = await client.patch(f"{API}/classes/sections/{b.id}", headers=admin_headers, json={"class_teacher_id": str(t.id)})
    assert res.status_code == 422 and "Class 6 – A" in res.json()["error"]["details"][0]["message"]
    # Saving section A again (same teacher) is fine; moving them means clearing A first.
    assert (await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": str(t.id), "capacity": 40})).status_code == 200
    assert (await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": None})).status_code == 200
    assert (await client.patch(f"{API}/classes/sections/{b.id}", headers=admin_headers, json={"class_teacher_id": str(t.id)})).status_code == 200


async def test_staff_can_message_a_new_student_with_their_own_login(client, db, school, admin_headers):
    _, section = await factories.klass(db, school, "Class 9")
    body = student_body(section, "N1", first_name="Naveen", login={"email": "naveen@t.com", "password": "Student123"})
    res = await client.post(f"{API}/students", headers=admin_headers, json=body)
    assert res.status_code == 201, res.text
    contacts = (await client.get(f"{API}/chat/contacts", headers=admin_headers)).json()["data"]
    assert [(c["name"], c["role"]) for c in contacts if c["student_name"] == "Naveen Sharma"] == [("Naveen Sharma", "Student")]
