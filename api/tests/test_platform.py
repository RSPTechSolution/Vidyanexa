"""Shared building blocks: uploads, notifications, push devices, signed download links and PDFs."""
from datetime import date, timedelta

import asyncio

from sqlalchemy import select, text

from app.models import User
from app.services import notification_service
from app.services.notification_service import CONSOLE_PUSHES
from tests import factories
from tests import test_attendance, test_communication, test_exams, test_fees
from tests.factories import API, PASSWORD

PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82")


async def upload(client, headers, purpose, owner_id=None, name="photo.png", data=PNG, ctype="image/png", label=None):
    form = {"purpose": purpose}
    if owner_id:
        form["owner_id"] = str(owner_id)
    if label:
        form["label"] = label
    return await client.post(f"{API}/files", headers=headers, data=form, files={"file": (name, data, ctype)})


async def notifications(client, headers):
    return (await client.get(f"{API}/notifications", headers=headers)).json()["data"]


async def test_student_photo_and_documents_by_role(client, db, school, other_school, admin_headers):
    a, b, maths, science, student_id, parent_pw = await test_communication.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)
    acc = await factories.user(db, school, "acc@t.com", "accountant")
    acc_h = await factories.login_headers(client, "acc@t.com", PASSWORD, school.slug)

    # Only the office may upload; a photo must be an image.
    assert (await upload(client, t, "student_photo", student_id)).status_code == 403
    assert (await upload(client, p, "student_photo", student_id)).status_code == 403
    bad = await upload(client, admin_headers, "student_photo", student_id, name="x.pdf", data=b"%PDF-1.4", ctype="application/pdf")
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "FILE_TYPE"
    assert (await upload(client, admin_headers, "nope", student_id)).status_code == 422
    assert (await upload(client, admin_headers, "student_photo", student_id, data=b"")).status_code == 422

    first = (await upload(client, admin_headers, "student_photo", student_id)).json()["data"]
    second = await upload(client, admin_headers, "student_photo", student_id, name="new.png")
    assert second.status_code == 201
    photo = second.json()["data"]
    detail = (await client.get(f"{API}/students/{student_id}", headers=admin_headers)).json()["data"]
    assert detail["photo_file_id"] == photo["id"]  # replaced, not added
    assert (await client.get(f"{API}/files/{first['id']}", headers=admin_headers)).status_code == 404

    # Staff and the family see the photo; it is served as an image.
    for h in (admin_headers, t, p, acc_h):
        r = await client.get(f"{API}/files/{photo['id']}", headers=h)
        assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content == PNG

    # Documents: staff with students.view and the family; not other parents or other schools.
    doc = (await upload(client, admin_headers, "student_document", student_id, name="birth.pdf", data=b"%PDF-1.4 test",
                        ctype="application/pdf", label="Birth certificate")).json()["data"]
    assert doc["label"] == "Birth certificate"
    listed = (await client.get(f"{API}/files", headers=p, params={"purpose": "student_document", "owner_id": student_id})).json()["data"]
    assert [f["filename"] for f in listed] == ["birth.pdf"]
    other_kid = (await client.get(f"{API}/students", headers=admin_headers, params={"search": "Other"})).json()["data"][0]["id"]
    assert (await client.get(f"{API}/files", headers=p, params={"purpose": "student_document", "owner_id": other_kid})).status_code == 404
    o_admin = await factories.user(db, other_school, "oadmin@t.com", "school_admin")
    o_h = await factories.login_headers(client, "oadmin@t.com", PASSWORD, other_school.slug)
    assert (await client.get(f"{API}/files/{doc['id']}", headers=o_h)).status_code == 404
    assert (await client.get(f"{API}/files/{photo['id']}", headers=o_h)).status_code == 404
    assert o_admin

    # Executable or odd types are refused.
    assert (await upload(client, admin_headers, "student_document", student_id, name="x.exe", data=b"MZ", ctype="application/x-msdownload")).status_code == 422

    # Only those who may upload can delete; deleting the photo clears it on the student.
    assert (await client.delete(f"{API}/files/{doc['id']}", headers=p)).status_code == 403
    assert (await client.delete(f"{API}/files/{photo['id']}", headers=admin_headers)).status_code == 200
    detail = (await client.get(f"{API}/students/{student_id}", headers=admin_headers)).json()["data"]
    assert detail["photo_file_id"] is None


async def test_user_photo_and_school_logo(client, db, school, admin_headers):
    t_user = await factories.user(db, school, "tt@t.com", "teacher")
    t = await factories.login_headers(client, "tt@t.com", PASSWORD, school.slug)
    mine = await upload(client, t, "user_photo", t_user.id)
    assert mine.status_code == 201
    assert (await client.get(f"{API}/auth/me", headers=t)).json()["data"]["photo_file_id"] == mine.json()["data"]["id"]
    admin_id = (await client.get(f"{API}/auth/me", headers=admin_headers)).json()["data"]["id"]
    assert (await upload(client, t, "user_photo", admin_id)).status_code == 403  # not someone else's

    assert (await upload(client, t, "school_logo")).status_code == 403
    logo = (await upload(client, admin_headers, "school_logo")).json()["data"]
    public = await client.get(f"{API}/files/public/{logo['id']}")
    assert public.status_code == 200 and public.content == PNG
    assert (await client.get(f"{API}/files/public/{mine.json()['data']['id']}")).status_code == 404  # only logos are public
    school_out = (await client.get(f"{API}/schools/current", headers=admin_headers)).json()
    if school_out.get("data"):
        assert school_out["data"]["logo_url"].endswith(f"/files/public/{logo['id']}")


async def test_homework_attachments_and_notifications(client, db, school, admin_headers):
    a, b, maths, science, student_id, parent_pw = await test_communication.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "t7@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "kdad@t.com", parent_pw, school.slug)
    CONSOLE_PUSHES.clear()
    due = (date.today() + timedelta(days=3)).isoformat()
    hw = (await client.post(f"{API}/homework", headers=t, json={"section_id": str(a.id), "subject_id": maths["id"],
                                                                 "title": "Worksheet 4", "due_date": due})).json()["data"]
    att = await upload(client, t, "homework", hw["id"], name="worksheet.pdf", data=b"%PDF-1.4 ws", ctype="application/pdf")
    assert att.status_code == 201
    assert (await upload(client, p, "homework", hw["id"], name="x.pdf", data=b"%PDF", ctype="application/pdf")).status_code == 403

    mine = (await client.get(f"{API}/homework/my", headers=p)).json()["data"]
    assert [f["filename"] for f in mine[0]["attachments"]] == ["worksheet.pdf"]
    got = await client.get(f"{API}/files/{att.json()['data']['id']}", headers=p, params={"download": True})
    assert got.status_code == 200 and "attachment" in got.headers["content-disposition"]

    # The parent got a notification and a (console) push.
    items = await notifications(client, p)
    assert [(n["kind"], n["title"]) for n in items] == [("homework", "New homework: Mathematics")]
    assert items[0]["link"] == "/my-homework" and items[0]["read"] is False
    await asyncio.gather(*notification_service._running)  # pushes go out after the commit, in the background
    assert any(push["title"] == "New homework: Mathematics" for push in CONSOLE_PUSHES)
    assert (await notifications(client, t)) == []  # not the teacher who set it

    # A notice to the class (from its class teacher) reaches the parent; read state works per user.
    t7 = await db.scalar(select(User.id).where(User.email == "t7@t.com"))
    made_ct = await client.patch(f"{API}/classes/sections/{a.id}", headers=admin_headers, json={"class_teacher_id": str(t7)})
    assert made_ct.status_code == 200, made_ct.text
    posted = await client.post(f"{API}/notices", headers=t, json={"title": "Test on Friday", "body": "Ch 3", "audience": "sections",
                                                                  "section_ids": [str(a.id)]})
    assert posted.status_code == 201, posted.text
    assert (await client.get(f"{API}/notifications/unread-count", headers=p)).json()["data"]["count"] == 2
    first = (await notifications(client, p))[0]
    assert first["kind"] == "notice"
    assert (await client.post(f"{API}/notifications/{first['id']}/read", headers=t)).status_code == 404  # not theirs
    assert (await client.post(f"{API}/notifications/{first['id']}/read", headers=p)).status_code == 200
    assert (await client.get(f"{API}/notifications/unread-count", headers=p)).json()["data"]["count"] == 1
    assert (await client.post(f"{API}/notifications/read-all", headers=p)).json()["data"]["marked"] == 1
    assert (await client.get(f"{API}/notifications", headers=p, params={"unread": True})).json()["data"] == []

    # School-wide notices reach staff too, but not the author.
    await client.post(f"{API}/notices", headers=admin_headers, json={"title": "Holiday", "body": "Closed", "audience": "everyone"})
    assert [n["title"] for n in await notifications(client, t)] == ["Holiday"]
    assert (await notifications(client, admin_headers)) == []


async def test_absence_fee_and_results_notifications(client, db, school, admin_headers):
    section, ids, parent_pw, _, _ = await test_attendance.setup(client, db, school, admin_headers)
    t = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    p = await factories.login_headers(client, "mum@t.com", parent_pw, school.slug)
    day = date.today()
    body = {"date": day.isoformat(), "records": [{"student_id": i, "status": "absent" if n == 0 else "present"} for n, i in enumerate(ids)]}
    saved = await client.put(f"{API}/attendance/sections/{section.id}", headers=t, json=body)
    if saved.status_code == 200:  # today may be a weekly off for the school
        items = await notifications(client, p)
        assert len(items) == 1 and items[0]["kind"] == "absent" and "absent today" in items[0]["title"]
        await client.put(f"{API}/attendance/sections/{section.id}", headers=t, json=body)  # same again: no second alert
        assert len(await notifications(client, p)) == 1


async def test_fee_receipt_notification_and_pdf(client, db, school, admin_headers):
    student_id, other_id, parent_pw, *_ = await test_fees.setup(client, db, school, admin_headers)
    await test_fees.generate(client, admin_headers)
    inv = (await client.get(f"{API}/fees/invoices", headers=admin_headers, params={"student_id": student_id})).json()["data"][0]
    pay = (await client.post(f"{API}/fees/invoices/{inv['id']}/payments", headers=admin_headers,
                             json={"amount": 5000, "method": "upi", "reference": "UPI9"})).json()["data"]
    p = await factories.login_headers(client, "dad@t.com", parent_pw, school.slug)
    items = await notifications(client, p)
    assert items[0]["kind"] == "fee_receipt" and "5,000.00" in items[0]["title"]

    pdf = await client.get(f"{API}/fees/payments/{pay['id']}/receipt.pdf", headers=p)
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf" and pdf.content.startswith(b"%PDF")
    assert len(pdf.content) > 1500
    assert (await client.get(f"{API}/fees/payments/{pay['id']}/receipt.pdf", headers=admin_headers)).status_code == 200
    other_parent = await factories.user(db, school, "op@t.com", "parent")
    op = await factories.login_headers(client, "op@t.com", PASSWORD, school.slug)
    assert (await client.get(f"{API}/fees/payments/{pay['id']}/receipt.pdf", headers=op)).status_code == 404
    assert other_parent and other_id


async def test_report_card_pdf_and_results_notification(client, db, school, admin_headers):
    section, exam, papers, ids, parent_pw = await test_exams.setup(client, db, school, admin_headers)
    for subj, values in {"Mathematics": [45, 12, 30], "English": [48, 20, 30]}.items():
        await client.put(f"{API}/exams/papers/{papers[subj]['id']}/sections/{section.id}", headers=admin_headers,
                         json={"entries": [{"student_id": i, "marks": v} for i, v in zip(ids, values)]})
    p = await factories.login_headers(client, "ashamum@t.com", parent_pw, school.slug)
    assert (await client.get(f"{API}/exams/{exam['id']}/report/{ids[0]}/pdf", headers=p)).status_code == 404  # unpublished
    staff = await client.get(f"{API}/exams/{exam['id']}/report/{ids[0]}/pdf", headers=admin_headers)
    assert staff.status_code == 200 and staff.content.startswith(b"%PDF")

    await client.post(f"{API}/exams/{exam['id']}/publish", headers=admin_headers)
    items = await notifications(client, p)
    assert [(n["kind"], n["title"]) for n in items] == [("results", "Half-Yearly results are out")]
    await client.post(f"{API}/exams/{exam['id']}/unpublish", headers=admin_headers)
    await client.post(f"{API}/exams/{exam['id']}/publish", headers=admin_headers)
    assert len(await notifications(client, p)) == 2  # re-published after a correction: families hear again

    pdf = await client.get(f"{API}/exams/{exam['id']}/report/{ids[0]}/pdf", headers=p, params={"download": True})
    assert pdf.status_code == 200 and "attachment" in pdf.headers["content-disposition"]
    assert (await client.get(f"{API}/exams/{exam['id']}/report/{ids[1]}/pdf", headers=p)).status_code == 404


async def test_signed_download_links(client, db, school, admin_headers):
    student_id, _, parent_pw, *_ = await test_fees.setup(client, db, school, admin_headers)
    await test_fees.generate(client, admin_headers)
    inv = (await client.get(f"{API}/fees/invoices", headers=admin_headers, params={"student_id": student_id})).json()["data"][0]
    pay = (await client.post(f"{API}/fees/invoices/{inv['id']}/payments", headers=admin_headers,
                             json={"amount": 100, "method": "cash"})).json()["data"]
    p = await factories.login_headers(client, "dad@t.com", parent_pw, school.slug)
    path = f"{API}/fees/payments/{pay['id']}/receipt.pdf"
    link = (await client.post(f"{API}/auth/download-link", headers=p, json={"path": path})).json()["data"]["url"]
    token = link.split("?dl=")[1]
    assert (await client.get(path, params={"dl": token})).status_code == 200  # no Authorization header
    assert (await client.get(f"{API}/fees/my", params={"dl": token})).status_code == 401  # only for that path
    assert (await client.post(f"{API}/auth/download-link", headers=p, json={"path": "https://evil.com/x"})).status_code == 422
    assert (await client.get(path, params={"dl": "garbage"})).status_code == 401
    await client.post(f"{API}/auth/logout", headers=p)
    assert (await client.get(path, params={"dl": token})).status_code == 401  # signing out kills the link


async def test_devices_register_and_move(client, db, school, admin_headers):
    await factories.user(db, school, "d1@t.com", "teacher")
    await factories.user(db, school, "d2@t.com", "teacher")
    h1 = await factories.login_headers(client, "d1@t.com", PASSWORD, school.slug)
    h2 = await factories.login_headers(client, "d2@t.com", PASSWORD, school.slug)
    tok = {"token": "fcm-token-1234567890", "platform": "android", "app": "staff"}
    assert (await client.post(f"{API}/notifications/devices", headers=h1, json=tok)).status_code == 200
    assert (await client.post(f"{API}/notifications/devices", headers=h2, json=tok)).status_code == 200  # same phone, new user
    assert (await client.post(f"{API}/notifications/devices", headers=h1, json={**tok, "platform": "pc"})).status_code == 422
    assert (await client.post(f"{API}/notifications/devices/remove", headers=h2, json={"token": tok["token"]})).status_code == 200


async def test_a_phone_moves_between_schools_and_double_registration_is_safe(client, db, school, admin_headers):
    """A phone used at one school, then signed in at another, gets the new person's pushes (row security hides the old
    row from the second school); two registrations at the same moment don't fail either."""
    other = await factories.school(db, "other-school")
    await factories.user(db, school, "m1@t.com", "teacher")
    await factories.user(db, other, "m2@t.com", "teacher")
    h1 = await factories.login_headers(client, "m1@t.com", PASSWORD, school.slug)
    h2 = await factories.login_headers(client, "m2@t.com", PASSWORD, other.slug)
    tok = {"token": "fcm-token-moving-phone-1", "platform": "android", "app": "staff"}
    assert (await client.post(f"{API}/notifications/devices", headers=h1, json=tok)).status_code == 200
    assert (await client.post(f"{API}/notifications/devices", headers=h2, json=tok)).status_code == 200
    rows = (await db.execute(text("SELECT u.email FROM device_tokens d JOIN users u ON u.id = d.user_id WHERE d.token = :t"),
                             {"t": tok["token"]})).all()
    assert [r[0] for r in rows] == ["m2@t.com"]
    again = await asyncio.gather(*[client.post(f"{API}/notifications/devices", headers=h2, json={**tok, "token": "fcm-token-twice-2"}) for _ in range(3)])
    assert [r.status_code for r in again] == [200, 200, 200]
