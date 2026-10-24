"""The storage page: space used and left, what takes it, every file, and deleting files (school admins only)."""
import uuid

from sqlalchemy import select

from app.models import StoredFile, User
from app.services.storage_service import GB, Purpose, register_purpose
from tests import factories
from tests.factories import API, PASSWORD


async def _anyone(db, user, owner_id) -> bool:
    return True


register_purpose("test_doc", Purpose(can_upload=_anyone, can_read=_anyone))


async def _upload(client, headers, name: str, size: int, purpose: str = "test_doc", owner: str | None = None, kind: str = "text/plain"):
    r = await client.post(f"{API}/files", headers=headers, data={"purpose": purpose, "owner_id": owner or str(uuid.uuid4())},
                          files={"file": (name, b"x" * size if kind == "text/plain" else b"GIF89a" + b"0" * (size - 6), kind)})
    assert r.status_code == 201, r.text
    return r.json()["data"]


async def test_the_page_shows_space_used_and_left_and_what_uses_it(client, admin, admin_headers):
    await _upload(client, admin_headers, "timetable.txt", 3000)
    await _upload(client, admin_headers, "fees.txt", 1000)
    await _upload(client, admin_headers, "me.gif", 500, "user_photo", str(admin.id), "image/gif")

    s = (await client.get(f"{API}/storage", headers=admin_headers)).json()["data"]
    assert s["used"] == 4500 and s["files"] == 3
    assert s["limit"] == s["storage_gb"] * GB and s["free"] == s["limit"] - 4500 and s["plan_name"] == "Pro"
    assert {k["purpose"]: k["bytes"] for k in s["kinds"]} == {"test_doc": 4000, "user_photo": 500}
    photos = next(g for g in s["groups"] if g["group"] == "photos")
    assert photos == {"group": "photos", "files": 1, "bytes": 500}

    files = (await client.get(f"{API}/storage/files", headers=admin_headers)).json()
    assert [f["filename"] for f in files["data"]] == ["timetable.txt", "fees.txt", "me.gif"]  # largest first
    assert files["meta"]["total"] == 3
    photo = files["data"][2]
    assert photo["purpose_label"] == "Staff and parent photos" and photo["owner"] == admin.full_name and photo["uploaded_by"] == admin.full_name

    newest = (await client.get(f"{API}/storage/files?sort=newest", headers=admin_headers)).json()["data"]
    assert newest[0]["filename"] == "me.gif"
    found = (await client.get(f"{API}/storage/files?search=fee", headers=admin_headers)).json()["data"]
    assert [f["filename"] for f in found] == ["fees.txt"]
    only_photos = (await client.get(f"{API}/storage/files?group=photos", headers=admin_headers)).json()["data"]
    assert [f["filename"] for f in only_photos] == ["me.gif"]


async def test_deleting_files_frees_space_and_updates_what_used_them(client, db, admin, admin_headers):
    a = await _upload(client, admin_headers, "old-notes.txt", 2000)
    b = await _upload(client, admin_headers, "old-list.txt", 1500)
    keep = await _upload(client, admin_headers, "keep.txt", 100)
    photo = await _upload(client, admin_headers, "me.gif", 400, "user_photo", str(admin.id), "image/gif")
    await db.refresh(admin)
    assert str(admin.photo_file_id) == photo["id"]

    r = await client.post(f"{API}/storage/delete", headers=admin_headers, json={"ids": [a["id"], b["id"], photo["id"]]})
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"deleted": 3, "freed": 3900}

    s = (await client.get(f"{API}/storage", headers=admin_headers)).json()["data"]
    assert s["used"] == 100 and s["files"] == 1
    assert [f["id"] for f in (await client.get(f"{API}/storage/files", headers=admin_headers)).json()["data"]] == [keep["id"]]
    await db.refresh(admin)
    assert admin.photo_file_id is None  # the profile no longer shows a deleted photo
    assert (await client.get(f"{API}/files/{a['id']}", headers=admin_headers)).status_code == 404


async def test_only_school_admins_and_only_their_own_school(client, db, school, other_school, admin_headers):
    await factories.user(db, school, "t@alpha.edu", "teacher")
    teacher = await factories.login_headers(client, "t@alpha.edu", PASSWORD, school.slug)
    assert (await client.get(f"{API}/storage", headers=teacher)).status_code == 403
    assert (await client.get(f"{API}/storage/files", headers=teacher)).status_code == 403

    await factories.user(db, other_school, "admin@beta.edu", "school_admin")
    beta = await factories.login_headers(client, "admin@beta.edu", PASSWORD, other_school.slug)
    theirs = await _upload(client, beta, "beta-secret.txt", 50)
    assert (await client.get(f"{API}/storage/files", headers=admin_headers)).json()["data"] == []
    r = await client.post(f"{API}/storage/delete", headers=admin_headers, json={"ids": [theirs["id"]]})
    assert r.json()["data"]["deleted"] == 0
    assert await db.scalar(select(StoredFile).where(StoredFile.id == uuid.UUID(theirs["id"]))) is not None
    assert (await db.scalar(select(User).where(User.email == "admin@beta.edu"))) is not None
