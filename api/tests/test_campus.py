"""Library, hostel, inventory and assets."""
from datetime import timedelta

from sqlalchemy import select, update

from app.models import BookIssue, Plan, School
from app.services import notification_service
from tests import factories, test_attendance
from tests.factories import API, PASSWORD
from tests.test_attendance import today


async def _max_plan(db, school):
    """Hostel and inventory are in the Max plan only; hostel and CCTV are also in preview, so the platform opens them
    to this school (as the platform owner does to test them)."""
    plan_id = await db.scalar(select(Plan.id).where(Plan.code == "max"))
    s = await db.get(School, school.id)
    await db.execute(update(School).where(School.id == school.id).values(
        plan_id=plan_id, settings={**(s.settings or {}), "preview_modules": ["hostel", "cctv"]}))
    await db.commit()


async def test_preview_modules_only_where_the_platform_opens_them(client, db, school, admin_headers, super_headers):
    plan_id = await db.scalar(select(Plan.id).where(Plan.code == "max"))
    await db.execute(update(School).where(School.id == school.id).values(plan_id=plan_id))
    await db.commit()
    # Hidden from the school even on Max, and not for sale.
    listed = (await client.get(f"{API}/schools/current/modules", headers=admin_headers)).json()["data"]
    assert not {"hostel", "cctv"} & {m["module"] for m in listed}
    assert (await client.put(f"{API}/schools/current/modules/hostel", headers=admin_headers, json={"is_enabled": True})).status_code == 404
    catalog = (await client.get(f"{API}/public/pricing")).json()["data"]
    assert not {"hostel", "cctv"} & {m["module"] for m in catalog["modules"]} and "monthly" not in catalog["modules"][0]
    assert "hostel" not in (await client.get(f"{API}/public/plans")).json()["data"][2]["modules"]
    # A school admin can't open one through the school's settings.
    await client.patch(f"{API}/schools/current", headers=admin_headers, json={"settings": {"preview_modules": ["hostel"]}})
    assert (await client.get(f"{API}/hostels", headers=admin_headers)).status_code == 403
    # The platform owner opens it: it's on straight away.
    res = await client.put(f"{API}/platform/schools/{school.id}/preview-modules", headers=super_headers, json={"modules": ["hostel"]})
    assert res.status_code == 200 and res.json()["data"]["settings"]["preview_modules"] == ["hostel"]
    assert (await client.get(f"{API}/hostels", headers=admin_headers)).status_code == 200
    assert "hostel" in (await client.get(f"{API}/auth/me", headers=admin_headers)).json()["data"]["modules"]


async def _enable(client, headers, *modules):
    for m in modules:
        assert (await client.put(f"{API}/schools/current/modules/{m}", headers=headers, json={"is_enabled": True})).status_code == 200


async def test_modules_are_off_by_default(client, admin_headers):
    for path in ("/library/books", "/hostels", "/inventory/items"):
        assert (await client.get(f"{API}{path}", headers=admin_headers)).status_code == 403


async def test_library_issue_return_fines_and_limits(client, db, school, admin_headers):
    await _enable(client, admin_headers, "library")
    _, ids, parent_pw, _, _ = await test_attendance.setup(client, db, school, admin_headers)
    await factories.user(db, school, "lib@t.com", "librarian")
    lib = await factories.login_headers(client, "lib@t.com", PASSWORD, school.slug)
    t = await factories.login_headers(client, "ct@t.com", PASSWORD, school.slug)
    parent = await factories.login_headers(client, "mum@t.com", parent_pw, school.slug)

    assert (await client.post(f"{API}/library/books", headers=t, json={"title": "X"})).status_code == 403
    assert (await client.get(f"{API}/library/books", headers=parent)).status_code == 403
    b = (await client.post(f"{API}/library/books", headers=lib, json={"title": "Wings of Fire", "author": "A. P. J. Abdul Kalam", "isbn": "9788173711466",
                                                                       "category": "Biography", "rack": "B-2", "copies": 3})).json()["data"]
    assert b["total"] == 3 and b["available"] == 3 and [c["accession_no"] for c in b["copies"]] == ["00001", "00002", "00003"]
    b2 = (await client.post(f"{API}/library/books", headers=lib, json={"title": "Malgudi Days", "author": "R. K. Narayan", "copies": 1})).json()["data"]
    assert b2["copies"][0]["accession_no"] == "00004"
    # Teachers can search the catalogue, by title, author or accession number.
    assert [x["title"] for x in (await client.get(f"{API}/library/books", headers=t, params={"q": "kalam"})).json()["data"]] == ["Wings of Fire"]
    assert [x["title"] for x in (await client.get(f"{API}/library/books", headers=t, params={"q": "00004"})).json()["data"]] == ["Malgudi Days"]

    await client.put(f"{API}/library/settings", headers=lib, json={"loan_days": 7, "fine_per_day": 5, "max_books_student": 2, "max_books_staff": 3})
    bad = await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00001", "borrower": "NOPE"})
    assert bad.status_code == 422
    i1 = (await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00001", "borrower": "a0"})).json()["data"]
    assert i1["borrower"] == "Kid0 Sharma" and i1["class_section"] == "Class 4 – A" and i1["due_on"] == (today() + timedelta(days=7)).isoformat()
    taken = await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00001", "borrower": "A1"})
    assert taken.json()["error"]["code"] == "COPY_UNAVAILABLE"
    await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00002", "borrower": "A0"})
    limit = await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00003", "borrower": "A0"})
    assert limit.json()["error"]["code"] == "LIMIT_REACHED"
    staff = (await client.post(f"{API}/library/issue", headers=lib, json={"accession_no": "00004", "borrower": "ct@t.com"})).json()["data"]
    assert staff["borrower_kind"] == "staff"

    # The first book is 4 days late: the fine runs at Rs 5 a day.
    await db.execute(update(BookIssue).where(BookIssue.id == i1["id"]).values(due_on=today() - timedelta(days=4), issued_on=today() - timedelta(days=11)))
    await db.commit()
    overdue = (await client.get(f"{API}/library/issues", headers=lib, params={"status": "overdue"})).json()["data"]
    assert [(x["accession_no"], x["overdue_days"], x["fine"]) for x in overdue] == [("00001", 4, 20.0)]
    s = (await client.get(f"{API}/library/stats", headers=lib)).json()["data"]
    assert s == {"titles": 2, "copies": 4, "issued": 3, "overdue": 1, "fines_due": 20.0}
    assert "Reminded 1" in (await client.post(f"{API}/library/remind-overdue", headers=lib)).json()["data"]["message"]
    await __import__("asyncio").gather(*notification_service._running)
    notes = (await client.get(f"{API}/notifications", headers=parent)).json()["data"]
    assert any("Wings of Fire" in n["title"] for n in notes)

    # The family sees their child's books; the teacher sees their own.
    mine = (await client.get(f"{API}/library/mine", headers=parent)).json()["data"]
    assert sorted(x["accession_no"] for x in mine) == ["00001", "00002"]
    assert [x["title"] for x in (await client.get(f"{API}/library/mine", headers=t)).json()["data"]] == ["Malgudi Days"]

    # Returned late with the fine unpaid, then paid; a damaged return takes the copy out of circulation.
    r = (await client.post(f"{API}/library/return", headers=lib, json={"accession_no": "00001"})).json()["data"]
    assert r["returned_on"] == today().isoformat() and r["fine"] == 20.0 and not r["fine_paid"]
    fines = (await client.get(f"{API}/library/issues", headers=lib, params={"status": "fines"})).json()["data"]
    assert [x["id"] for x in fines] == [r["id"]]
    assert (await client.post(f"{API}/library/issues/{r['id']}/fine-paid", headers=lib)).json()["data"]["fine_paid"]
    assert (await client.post(f"{API}/library/return", headers=lib, json={"accession_no": "00001"})).json()["error"]["code"] == "NOT_ISSUED"
    d = (await client.post(f"{API}/library/return", headers=lib, json={"accession_no": "00002", "condition": "damaged"})).json()["data"]
    assert d["fine"] == 0 and d["fine_paid"]
    book = (await client.get(f"{API}/library/books/{b['id']}", headers=lib)).json()["data"]
    assert {c["accession_no"]: c["status"] for c in book["copies"]} == {"00001": "available", "00002": "damaged", "00003": "available"}
    assert book["available"] == 2


async def test_hostel_rooms_and_allocation(client, db, school, admin_headers):
    await _max_plan(db, school)
    await _enable(client, admin_headers, "hostel")
    _, ids, parent_pw, teacher, _ = await test_attendance.setup(client, db, school, admin_headers)
    await factories.user(db, school, "rec@t.com", "receptionist")
    rec = await factories.login_headers(client, "rec@t.com", PASSWORD, school.slug)
    parent = await factories.login_headers(client, "mum@t.com", parent_pw, school.slug)

    assert (await client.post(f"{API}/hostels", headers=rec, json={"name": "Girls hostel", "kind": "girls"})).status_code == 403
    assert (await client.post(f"{API}/hostels", headers=admin_headers, json={"name": "Boys", "kind": "boys", "warden_id": str(ids[0])})).status_code == 422
    boys = (await client.post(f"{API}/hostels", headers=admin_headers, json={"name": "Tagore House", "kind": "boys"})).json()["data"]
    h = (await client.post(f"{API}/hostels", headers=admin_headers, json={"name": "Sarojini House", "kind": "girls", "warden_id": str(teacher.id),
                                                                          "monthly_fee": 6000})).json()["data"]
    assert h["warden_name"] == "Ct"
    h = (await client.post(f"{API}/hostels/{h['id']}/rooms", headers=admin_headers, json={"number": "101", "floor": "First", "capacity": 2})).json()["data"]
    assert (await client.post(f"{API}/hostels/{h['id']}/rooms", headers=admin_headers, json={"number": "101"})).status_code == 422
    h = (await client.post(f"{API}/hostels/{h['id']}/rooms", headers=admin_headers, json={"number": "102", "capacity": 1})).json()["data"]
    r101, r102 = h["room_list"][0]["id"], h["room_list"][1]["id"]
    assert h["beds"] == 3 and h["occupied"] == 0
    boys = (await client.post(f"{API}/hostels/{boys['id']}/rooms", headers=admin_headers, json={"number": "1"})).json()["data"]

    # Gender rules, capacity, and moving rooms closes the old bed.
    wrong = await client.post(f"{API}/hostels/allocations", headers=admin_headers, json={"student_id": ids[0], "room_id": boys["room_list"][0]["id"]})
    assert wrong.status_code == 422
    for sid in ids[:2]:
        assert (await client.post(f"{API}/hostels/allocations", headers=admin_headers, json={"student_id": sid, "room_id": r101})).status_code == 201
    full = await client.post(f"{API}/hostels/allocations", headers=admin_headers, json={"student_id": ids[2], "room_id": r101})
    assert full.json()["error"]["code"] == "ROOM_FULL"
    moved = (await client.post(f"{API}/hostels/allocations", headers=admin_headers, json={"student_id": ids[1], "room_id": r102})).json()["data"]
    occ = {r["number"]: [o["name"] for o in r["occupants"]] for r in moved["room_list"]}
    assert occ == {"101": ["Kid0 Sharma"], "102": ["Kid1 Sharma"]} and moved["occupied"] == 2

    listed = (await client.get(f"{API}/hostels", headers=rec)).json()["data"]
    assert {x["name"]: (x["beds"], x["occupied"]) for x in listed} == {"Sarojini House": (3, 2), "Tagore House": (2, 0)}
    mine = (await client.get(f"{API}/hostels/mine", headers=parent)).json()["data"]
    assert mine == [{"student_id": ids[0], "name": "Kid0 Sharma", "hostel": "Sarojini House", "room": "101", "floor": "First",
                     "since": today().isoformat(), "warden": "Ct", "warden_phone": None}]
    alloc = moved["room_list"][0]["occupants"][0]["allocation_id"]
    assert (await client.post(f"{API}/hostels/allocations/{alloc}/vacate", headers=admin_headers)).status_code == 200
    assert (await client.get(f"{API}/hostels/mine", headers=parent)).json()["data"] == []


async def test_inventory_stock_and_assets(client, db, school, admin_headers):
    await _max_plan(db, school)
    await _enable(client, admin_headers, "inventory")
    acc = await factories.user(db, school, "acc@t.com", "accountant")
    await factories.user(db, school, "t@t.com", "teacher")
    a = await factories.login_headers(client, "acc@t.com", PASSWORD, school.slug)
    t = await factories.login_headers(client, "t@t.com", PASSWORD, school.slug)

    assert (await client.get(f"{API}/inventory/items", headers=t)).status_code == 403
    it = (await client.post(f"{API}/inventory/items", headers=a, json={"name": "Chalk box", "category": "Stationery", "unit": "box", "reorder_level": 10})).json()["data"]
    assert it["quantity"] == 0 and it["low"]
    assert (await client.post(f"{API}/inventory/items", headers=a, json={"name": "chalk BOX"})).status_code == 422
    it = (await client.post(f"{API}/inventory/items/{it['id']}/moves", headers=a, json={"kind": "in", "quantity": 50, "unit_cost": 40, "party": "Gupta Stationers"})).json()["data"]
    assert it["quantity"] == 50 and not it["low"]
    over = await client.post(f"{API}/inventory/items/{it['id']}/moves", headers=a, json={"kind": "out", "quantity": 60})
    assert over.json()["error"]["code"] == "NOT_ENOUGH_STOCK"
    it = (await client.post(f"{API}/inventory/items/{it['id']}/moves", headers=a, json={"kind": "out", "quantity": 42, "party": "Class 4 – A"})).json()["data"]
    assert it["quantity"] == 8 and it["low"]
    await __import__("asyncio").gather(*notification_service._running)
    admin_notes = (await client.get(f"{API}/notifications", headers=admin_headers)).json()["data"]
    assert any(n["title"] == "Low stock: Chalk box" for n in admin_notes)
    it = (await client.post(f"{API}/inventory/items/{it['id']}/moves", headers=a, json={"kind": "adjust", "quantity": 7, "note": "Counted"})).json()["data"]
    moves = (await client.get(f"{API}/inventory/items/{it['id']}/moves", headers=a)).json()["data"]
    assert [(m["kind"], m["quantity"], m["balance_after"]) for m in moves] == [("adjust", -1.0, 7.0), ("out", -42.0, 8.0), ("in", 50.0, 50.0)]
    assert [x["name"] for x in (await client.get(f"{API}/inventory/items", headers=a, params={"low": True})).json()["data"]] == ["Chalk box"]

    x = (await client.post(f"{API}/inventory/assets", headers=a, json={"name": "Projector", "category": "IT", "location": "Room 4", "cost": 42000,
                                                                       "warranty_until": (today() - timedelta(days=1)).isoformat(), "assigned_to": str(acc.id)})).json()["data"]
    assert x["tag"] == "AST-00001" and x["warranty_ok"] is False and x["assigned_name"] == "Acc"
    y = (await client.post(f"{API}/inventory/assets", headers=a, json={"tag": "gv-it-7", "name": "Laptop"})).json()["data"]
    assert y["tag"] == "GV-IT-7"
    assert (await client.post(f"{API}/inventory/assets", headers=a, json={"tag": "GV-IT-7", "name": "Laptop 2"})).status_code == 422
    x2 = (await client.put(f"{API}/inventory/assets/{x['id']}", headers=a, json={**{k: x[k] for k in ("tag", "name", "category", "location")}, "condition": "needs_repair"})).json()["data"]
    assert x2["condition"] == "needs_repair"
    assert [z["tag"] for z in (await client.get(f"{API}/inventory/assets", headers=a, params={"condition": "needs_repair"})).json()["data"]] == ["AST-00001"]
    assert [z["tag"] for z in (await client.get(f"{API}/inventory/assets", headers=a, params={"q": "laptop"})).json()["data"]] == ["GV-IT-7"]


async def test_other_school_cannot_see(client, db, school, other_school, admin_headers):
    await _enable(client, admin_headers, "library")
    await client.post(f"{API}/library/books", headers=admin_headers, json={"title": "Secret", "copies": 1})
    other = await factories.user(db, other_school, "oa@t.com", "school_admin")
    oh = await factories.login_headers(client, "oa@t.com", PASSWORD, other_school.slug)
    await _enable(client, oh, "library")
    assert (await client.get(f"{API}/library/books", headers=oh)).json()["data"] == []
    assert (await client.post(f"{API}/library/issue", headers=oh, json={"accession_no": "00001", "borrower": "x"})).status_code == 422
