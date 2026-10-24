"""Files from the media domain: the API checks who may see a file, then sends a signed, expiring link to the edge."""
import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

from app.core.config import settings
from app.services import storage_service
from tests.factories import API


def _media(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_BASE_URL", "https://media.vidyanexa.com")
    monkeypatch.setattr(settings, "MEDIA_SIGNING_SECRET", "test-secret")
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")


def test_the_link_matches_what_the_worker_checks(monkeypatch):
    """The same example as infra/cloudflare/media/worker.test.mjs: if either side changes how it signs, both tests fail."""
    _media(monkeypatch)
    monkeypatch.setattr(time, "time", lambda: 1999990000)
    url = storage_service.media_url(SimpleNamespace(storage_key="abc/student_photo/x y.webp", filename="Aarav Patel.webp"))
    assert url == ("https://media.vidyanexa.com/abc/student_photo/x%20y.webp?exp=1999994400&d=0&n=Aarav%20Patel.webp"
                   "&sig=3d5d832ef35513c3679dc75b0b3b31122aef3c78ac39f8c474bbae45e60d7e69")


def test_links_stay_the_same_for_a_while_so_they_can_be_cached(monkeypatch):
    _media(monkeypatch)
    f = SimpleNamespace(storage_key="k/a.pdf", filename="a.pdf")
    monkeypatch.setattr(time, "time", lambda: 1_800_000_000)
    first = storage_service.media_url(f)
    monkeypatch.setattr(time, "time", lambda: 1_800_000_000 + 600)  # ten minutes later
    assert storage_service.media_url(f) == first
    exp = int(parse_qs(urlsplit(first).query)["exp"][0])
    assert 3600 <= exp - 1_800_000_000 <= 7200  # works for at least an hour, at most two


def test_without_the_media_domain_the_api_sends_files_itself(monkeypatch):
    monkeypatch.setattr(settings, "MEDIA_BASE_URL", "")
    assert storage_service.media_url(SimpleNamespace(storage_key="k", filename="f")) is None


async def test_allowed_people_are_sent_to_a_signed_link_and_others_get_nothing(client, db, school, admin, admin_headers, monkeypatch):
    r = await client.post(f"{API}/files", headers=admin_headers, data={"purpose": "user_photo", "owner_id": str(admin.id)},
                          files={"file": ("me.gif", b"GIF89a" + b"0" * 30, "image/gif")})
    assert r.status_code == 201, r.text
    fid = r.json()["data"]["id"]

    _media(monkeypatch)
    res = await client.get(f"{API}/files/{fid}", headers=admin_headers, follow_redirects=False)
    assert res.status_code == 302
    link = urlsplit(res.headers["location"])
    assert link.netloc == "media.vidyanexa.com" and link.path.startswith(f"/{school.id}/user_photo/")
    q = parse_qs(link.query)
    assert q["d"] == ["0"] and q["n"] == ["me.gif"] and len(q["sig"][0]) == 64

    dl = await client.get(f"{API}/files/{fid}?download=true", headers=admin_headers, follow_redirects=False)
    assert parse_qs(urlsplit(dl.headers["location"]).query)["d"] == ["1"]

    # Without signing in there's no link at all: the API still decides who may see what.
    assert (await client.get(f"{API}/files/{fid}", follow_redirects=False)).status_code == 401
