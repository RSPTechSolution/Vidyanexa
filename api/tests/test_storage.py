"""Plan storage: what a school has uploaded is counted against its plan, warned about, and stopped when full. Photos are
shrunk on upload. Files can live in an S3-compatible bucket (R2 in production; the local stand-in in tests)."""
import io
import uuid

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app.core.config import settings
from app.models import StoredFile
from app.services import backup_service, blob_store, storage_service
from app.services.storage_service import Purpose, register_purpose
from tests.conftest import API


async def _anyone(db, user, owner_id) -> bool:
    return True


register_purpose("test_doc", Purpose(can_upload=_anyone, can_read=_anyone))


def _upload(client, headers, size: int, name: str = "notes.txt"):
    return client.post(f"{API}/files", headers=headers, data={"purpose": "test_doc", "owner_id": str(uuid.uuid4())},
                       files={"file": (name, b"x" * size, "text/plain")})


@pytest.fixture
def small_gb(monkeypatch):
    """Make a "GB" 1,000 bytes, so the Pro plan's 50 GB fills up with a few small files."""
    monkeypatch.setattr(storage_service, "GB", 1000)
    return 50 * 1000


async def test_uploads_count_against_the_plan_warn_the_admins_and_stop_when_full(client, admin_headers, small_gb):
    limit = small_gb
    assert (await _upload(client, admin_headers, int(limit * 0.7))).status_code == 201
    bell = (await client.get(f"{API}/notifications", headers=admin_headers)).json()["data"]
    assert not [n for n in bell if n["kind"] == "storage"]  # 70%: nothing to say yet

    assert (await _upload(client, admin_headers, int(limit * 0.15))).status_code == 201  # 85%
    bell = (await client.get(f"{API}/notifications", headers=admin_headers)).json()["data"]
    assert [n["title"] for n in bell if n["kind"] == "storage"] == ["Your school has used 80% of its storage"]

    # Too big for what's left: refused, with a clear message, and nothing is stored.
    r = await _upload(client, admin_headers, int(limit * 0.2))
    assert r.status_code == 413
    body = r.json()
    assert body["error"]["code"] == "STORAGE_FULL"
    assert "storage is full" in body["error"]["message"] and "upgrade" in body["error"]["message"]

    # Exactly filling it is allowed, and the admins hear it's full; after that, even a tiny file is refused.
    used = (await client.get(f"{API}/subscription", headers=admin_headers)).json()["data"]["usage"]["storage_bytes"]
    assert used == int(limit * 0.7) + int(limit * 0.15)
    assert (await _upload(client, admin_headers, limit - used)).status_code == 201
    bell = (await client.get(f"{API}/notifications", headers=admin_headers)).json()["data"]
    assert "Your school's storage is full" in [n["title"] for n in bell if n["kind"] == "storage"]
    assert (await _upload(client, admin_headers, 1)).status_code == 413

    # The dashboard shows it, and files can still be read.
    summary = (await client.get(f"{API}/dashboard/summary", headers=admin_headers)).json()["data"]
    assert summary["storage"]["used"] == limit


async def test_storage_is_per_school(client, admin_headers, db, other_school, small_gb):
    from tests import factories
    other = await factories.user(db, other_school, "admin@beta.edu", "school_admin")
    other_headers = await factories.login_headers(client, other.email, factories.PASSWORD, "beta")
    assert (await _upload(client, admin_headers, small_gb)).status_code == 201  # alpha is full
    assert (await _upload(client, admin_headers, 1)).status_code == 413
    assert (await _upload(client, other_headers, 1000)).status_code == 201  # beta is not affected


async def test_freeing_space_lets_uploads_continue(client, admin_headers, small_gb):
    first = (await _upload(client, admin_headers, small_gb)).json()["data"]
    assert (await _upload(client, admin_headers, 10)).status_code == 413
    assert (await client.delete(f"{API}/files/{first['id']}", headers=admin_headers)).status_code == 200
    assert (await _upload(client, admin_headers, 10)).status_code == 201


async def test_a_full_school_can_still_replace_a_photo_with_a_smaller_one(client, admin, admin_headers, small_gb):
    def photo(size):
        return client.post(f"{API}/files", headers=admin_headers, data={"purpose": "user_photo", "owner_id": str(admin.id)},
                           files={"file": ("me.gif", b"GIF89a" + b"0" * (size - 6), "image/gif")})
    assert (await photo(2000)).status_code == 201
    assert (await _upload(client, admin_headers, small_gb - 2000)).status_code == 201  # now full
    assert (await photo(1500)).status_code == 201  # replaces the 2,000-byte photo: takes less, so it's allowed
    assert (await photo(2500)).status_code == 413  # would take more than there is


async def test_a_school_cant_move_to_a_plan_its_files_dont_fit(db, school):
    from app.models import Plan
    from app.core.errors import Conflict
    from app.services import billing_service
    for i in range(11):
        db.add(StoredFile(school_id=school.id, purpose="test_doc", filename=f"big{i}.zip", content_type="application/zip",
                          size=1024 ** 3, storage_key=f"x{i}"))
    await db.flush()
    basic = await db.scalar(select(Plan).where(Plan.code == "basic"))
    with pytest.raises(Conflict, match="your files take 11 GB and Basic includes 10 GB"):
        await billing_service.apply_plan(db, school, basic, cycle="monthly", status="active", actor_id=None)


async def test_photos_are_shrunk_turned_to_webp_and_lose_hidden_details(client, admin, admin_headers):
    im = Image.effect_noise((3000, 2000), 60).convert("RGB")
    exif = Image.Exif()
    exif[0x8825] = {1: "N", 2: (12.0, 58.0, 0.0)}  # where it was taken
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=95, exif=exif)
    original = buf.getvalue()

    r = await client.post(f"{API}/files", headers=admin_headers, data={"purpose": "user_photo", "owner_id": str(admin.id)},
                          files={"file": ("IMG_2041.jpg", original, "image/jpeg")})
    assert r.status_code == 201, r.text
    f = r.json()["data"]
    assert f["content_type"] == "image/webp" and f["filename"] == "IMG_2041.webp"
    assert f["size"] < len(original) / 3

    stored = (await client.get(f"{API}/files/{f['id']}", headers=admin_headers)).content
    out = Image.open(io.BytesIO(stored))
    assert out.format == "WEBP" and max(out.size) == settings.IMAGE_MAX_PX
    assert not out.getexif().get_ifd(0x8825)


def test_files_that_arent_photos_are_kept_as_they_are():
    assert storage_service.shrink_image(b"%PDF-1.4", "application/pdf") == (b"%PDF-1.4", "application/pdf")
    assert storage_service.shrink_image(b"not really a png", "image/png") == (b"not really a png", "image/png")
    tiny = io.BytesIO()
    Image.new("RGB", (4, 4)).save(tiny, "PNG")
    data, kind = storage_service.shrink_image(tiny.getvalue(), "image/png")
    assert kind in ("image/png", "image/webp") and len(data) <= len(tiny.getvalue())  # only swapped if smaller


# ---- the bucket ----------------------------------------------------------------------------------

S3_TEST = "http://localhost:9090"  # the local stand-in (docker compose ... up -d s3)


def _bucket_running() -> bool:
    try:
        return httpx.get(S3_TEST, timeout=2).status_code < 600
    except httpx.HTTPError:
        return False


@pytest.fixture
def bucket(monkeypatch):
    if not _bucket_running():
        pytest.skip("the local S3 stand-in isn't running (docker compose -f infra/compose/docker-compose.dev.yml up -d s3)")
    name = f"test-{uuid.uuid4().hex[:12]}"
    for k, v in {"STORAGE_BACKEND": "s3", "S3_ENDPOINT_URL": S3_TEST, "S3_REGION": "us-east-1", "S3_ACCESS_KEY_ID": "test",
                 "S3_SECRET_ACCESS_KEY": "test", "S3_BUCKET": name, "S3_BACKUP_BUCKET": name + "-backups"}.items():
        monkeypatch.setattr(settings, k, v)
    blob_store.reset()
    blob_store._client().create_bucket(Bucket=name)
    blob_store._client().create_bucket(Bucket=name + "-backups")
    yield name
    blob_store.reset()


async def test_files_live_in_the_bucket_in_a_folder_per_school(client, admin_headers, school, bucket):
    r = await client.post(f"{API}/files", headers=admin_headers, data={"purpose": "test_doc", "owner_id": str(uuid.uuid4())},
                          files={"file": ("timetable.pdf", b"%PDF-1.4 the timetable", "application/pdf")})
    assert r.status_code == 201, r.text
    fid = r.json()["data"]["id"]
    keys = [o["key"] for o in await blob_store.files().list()]
    assert len(keys) == 1 and keys[0].startswith(f"{school.id}/test_doc/") and keys[0].endswith(".pdf")
    assert not [p for p in await _local_files() if str(school.id) in p.parts]  # nothing written to the server disk

    got = await client.get(f"{API}/files/{fid}", headers=admin_headers)
    assert got.status_code == 200 and got.content == b"%PDF-1.4 the timetable"

    assert (await client.delete(f"{API}/files/{fid}", headers=admin_headers)).status_code == 200
    assert await blob_store.files().list() == []


async def test_a_file_missing_from_the_bucket_is_a_clean_not_found(client, admin_headers, db, bucket):
    fid = (await _upload(client, admin_headers, 10)).json()["data"]["id"]
    f = await db.get(StoredFile, uuid.UUID(fid))
    await blob_store.files().delete(f.storage_key)
    assert (await client.get(f"{API}/files/{fid}", headers=admin_headers)).status_code == 404


async def test_backups_are_copied_to_the_backup_bucket_and_pruned(tmp_path, monkeypatch, bucket):
    monkeypatch.setattr(settings, "BACKUP_KEEP", 2)
    for stamp in ("20261001-010000", "20261002-010000", "20261003-010000"):
        p = tmp_path / f"eduvia-{stamp}.zip"
        p.write_bytes(b"PK zip " + stamp.encode())
        assert await backup_service.copy_offsite(p)
    names = sorted(o["key"] for o in await blob_store.backups_offsite().list())
    assert names == ["backups/eduvia-20261002-010000.zip", "backups/eduvia-20261003-010000.zip"]


async def _local_files() -> list:
    from pathlib import Path
    root = Path(settings.STORAGE_DIR)
    return [p for p in root.rglob("*") if p.is_file() and "backups" not in p.parts] if root.exists() else []
