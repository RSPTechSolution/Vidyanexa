import csv
import io

from app.services import email_service
from tests import factories
from tests.factories import API, PASSWORD

HEADER = "admission_no,first_name,last_name,gender,date_of_birth,admission_date,class,section,roll_no,blood_group,address,father_name,father_phone,father_email,mother_name,mother_phone,mother_email"


def rows(*lines: str) -> str:
    return "\n".join([HEADER, *lines]) + "\n"


async def count_students(client, headers) -> int:
    return (await client.get(f"{API}/students", headers=headers, params={"status": "active"})).json()["meta"]["total"]


async def test_check_reports_every_problem_and_saves_nothing(client, db, school, admin_headers):
    await factories.klass(db, school, "Class 5", ("A",))
    csv_text = rows(
        "S1,Asha,Rao,female,2016-04-12,,Class 5,A,1,,,,,,,,",
        "S1,Bina,Rao,female,12-05-2016,,Class 5,A,2,,,,,,,,",            # admission no. repeated in the file
        "S3,Chetan,Das,male,notadate,,Class 5,A,3,,,,,,,,",              # bad date
        "S4,Dev,Shah,male,2016-01-01,,Class 9,A,4,,,,,,,,",              # no such class
        "S5,Esha,Iyer,female,2016-01-01,,Class 5,Z,5,,,,,,,,",           # no such section
        "S6,Farah,Khan,female,2016-01-01,,Class 5,A,6,,,Imran Khan,+91 90000 00061,,,,",  # father without email
    )
    res = (await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": csv_text, "dry_run": True})).json()["data"]
    assert res["ok"] is False and res["rows"] == 6
    by_row = {(e["row"], e["column"]) for e in res["errors"]}
    assert {(3, "date_of_birth"), (4, "class"), (5, "section"), (6, "father_email")} <= by_row
    assert any(e["row"] == 2 and "admission" in e["message"].lower() for e in res["errors"])
    assert await count_students(client, admin_headers) == 0


async def test_import_students_with_shared_parents_and_emails(client, db, school, admin_headers):
    await factories.klass(db, school, "Class 5", ("A", "B"))
    csv_text = rows(
        "S1,Asha,Rao,female,2016-04-12,2026-04-01,Class 5,A,1,B+,Sector 9,Ravi Rao,+91 90000 00071,ravi.rao@school.in,Lata Rao,+91 90000 00072,lata.rao@school.in",
        "S2,Arun,Rao,male,12/06/2018,,class 5,b,1,,,Ravi Rao,+91 90000 00071,ravi.rao@school.in,,,",
    )
    email_service.CONSOLE_OUTBOX.clear()
    check = (await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": csv_text, "dry_run": True, "send_emails": True})).json()["data"]
    assert check["ok"] and check["created"] == 2 and check["parents_created"] == 2 and check["parents_linked"] == 1
    assert check["credentials"] == [] and list(email_service.CONSOLE_OUTBOX) == []  # a check never emails
    assert await count_students(client, admin_headers) == 0

    done = (await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": csv_text, "dry_run": False, "send_emails": True})).json()["data"]
    assert done["ok"] and done["created"] == 2 and done["emails_sent"] == 2
    assert sorted(c["email"] for c in done["credentials"]) == ["lata.rao@school.in", "ravi.rao@school.in"]
    assert sorted(m.to for m in email_service.CONSOLE_OUTBOX if m.kind == "welcome") == ["lata.rao@school.in", "ravi.rao@school.in"]
    assert await count_students(client, admin_headers) == 2

    # Ravi is one account linked to both children.
    parents = (await client.get(f"{API}/transfer/parents/export", headers=admin_headers)).text
    ravi = next(r for r in csv.DictReader(io.StringIO(parents.lstrip("﻿"))) if r["email"] == "ravi.rao@school.in")
    assert "Asha Rao" in ravi["children"] and "Arun Rao" in ravi["children"]

    # Importing the same file again fails on the admission numbers and changes nothing.
    again = (await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": csv_text, "dry_run": False})).json()["data"]
    assert again["ok"] is False and await count_students(client, admin_headers) == 2


async def test_export_round_trips(client, db, school, admin_headers):
    await factories.klass(db, school, "Class 2", ("A",))
    csv_text = rows("R1,Mira,Sen,female,2019-02-03,2026-04-01,Class 2,A,1,O+,,,,,Ritu Sen,+91 90000 00081,ritu.sen@school.in")
    await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": csv_text, "dry_run": False})
    exported = await client.get(f"{API}/transfer/students/export", headers=admin_headers)
    assert exported.headers["content-type"].startswith("text/csv") and "attachment" in exported.headers["content-disposition"]
    row = next(csv.DictReader(io.StringIO(exported.text.lstrip("﻿"))))
    assert (row["admission_no"], row["class"], row["section"], row["mother_email"], row["status"]) == ("R1", "Class 2", "A", "ritu.sen@school.in", "active")
    template = await client.get(f"{API}/transfer/students/template", headers=admin_headers)
    assert template.text.lstrip("﻿").startswith("admission_no,first_name")


async def test_staff_import_applies_role_rules(client, db, school, admin_headers):
    bad = "full_name,email,role,phone,employee_id,designation,license_no\n" \
          "Anil Kumar,anil@school.in,Teacher,,T-1,,\n" \
          "Gurmeet Singh,gurmeet@school.in,driver,+91 90000 00091,D-1,,\n" \
          "Some Parent,parent1@school.in,parent,+91 90000 00092,,,\n"
    res = (await client.post(f"{API}/transfer/staff/import", headers=admin_headers, json={"csv": bad, "dry_run": True})).json()["data"]
    cols = {(e["row"], e["column"]) for e in res["errors"]}
    assert (1, "phone") in cols and (2, "license_no") in cols and (3, "role") in cols

    good = "full_name,email,role,phone,employee_id,designation,license_no\n" \
           "Anil Kumar,anil@school.in,Teacher,+91 90000 00093,T-1,TGT Science,\n" \
           "Gurmeet Singh,gurmeet@school.in,driver,+91 90000 00091,D-1,,PB01 2019 0012345\n"
    done = (await client.post(f"{API}/transfer/staff/import", headers=admin_headers, json={"csv": good, "dry_run": False})).json()["data"]
    assert done["ok"] and done["created"] == 2 and done["emails_sent"] == 0 and len(done["credentials"]) == 2
    staff = (await client.get(f"{API}/transfer/staff/export", headers=admin_headers)).text
    assert "anil@school.in" in staff and "PB01 2019 0012345" in staff
    # The new teacher can sign in with the temporary password.
    pw = next(c["password"] for c in done["credentials"] if c["email"] == "anil@school.in")
    assert (await factories.login(client, "anil@school.in", pw, school.slug)).status_code == 200


async def test_permissions_and_bad_files(client, db, school, admin_headers):
    await factories.user(db, school, "t@school.in", "teacher")
    t = await factories.login_headers(client, "t@school.in", PASSWORD, school.slug)
    assert (await client.post(f"{API}/transfer/students/import", headers=t, json={"csv": rows("x")})).status_code == 403
    assert (await client.get(f"{API}/transfer/staff/export", headers=t)).status_code == 403
    assert (await client.get(f"{API}/transfer/students/export", headers=t)).status_code == 200  # teachers can view students
    missing = await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": "name,class\nA,B\n"})
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "IMPORT_COLUMNS"


async def test_dashboard_counts_students_from_records(client, db, school, admin_headers):
    await factories.klass(db, school, "Class 1", ("A",))
    await client.post(f"{API}/transfer/students/import", headers=admin_headers, json={"csv": rows(
        "D1,Ana,Roy,female,2019-01-01,,Class 1,A,1,,,,,,,,", "D2,Bo,Roy,male,2019-01-02,,Class 1,A,2,,,,,,,,"), "dry_run": False})
    s = (await client.get(f"{API}/dashboard/summary", headers=admin_headers)).json()["data"]
    assert {r["role"]: r["count"] for r in s["roles"]}["student"] == 2 and s["student_logins"] == 0


async def test_import_fields_for_the_mapping_screen(client, admin_headers):
    fields = (await client.get(f"{API}/transfer/students/fields", headers=admin_headers)).json()["data"]
    by_key = {f["key"]: f for f in fields}
    assert by_key["admission_no"] == {"key": "admission_no", "label": "Admission number", "required": True, "hint": None}
    assert by_key["roll_no"]["required"] is False and by_key["date_of_birth"]["hint"]
    staff = (await client.get(f"{API}/transfer/staff/fields", headers=admin_headers)).json()["data"]
    assert [f["key"] for f in staff if f["required"]] == ["full_name", "email", "role"]
