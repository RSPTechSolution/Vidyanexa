"""The visitor's address, when the website runs on a different server than the API (e.g. Vercel)."""
from starlette.requests import Request

from app.core.config import settings
from app.core.deps import client_ip


def _req(headers: dict[str, str], peer: str = "76.76.21.21") -> Request:
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()], "client": (peer, 443)})


def test_the_website_can_pass_on_the_visitors_address_with_the_shared_secret(monkeypatch):
    monkeypatch.setattr(settings, "WEB_PROXY_SECRET", "s3cret-shared-with-the-website")
    assert client_ip(_req({"X-Client-IP": "49.36.10.7", "X-Web-Secret": "s3cret-shared-with-the-website"})) == "49.36.10.7"


def test_anyone_else_claiming_an_address_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "WEB_PROXY_SECRET", "s3cret-shared-with-the-website")
    assert client_ip(_req({"X-Client-IP": "1.2.3.4"})) == "76.76.21.21"  # no secret
    assert client_ip(_req({"X-Client-IP": "1.2.3.4", "X-Web-Secret": "guess"})) == "76.76.21.21"  # wrong secret


def test_without_a_secret_set_the_header_is_never_believed(monkeypatch):
    monkeypatch.setattr(settings, "WEB_PROXY_SECRET", "")
    assert client_ip(_req({"X-Client-IP": "1.2.3.4", "X-Web-Secret": ""})) == "76.76.21.21"


async def test_sign_in_limits_are_per_visitor_behind_the_website(client, admin, monkeypatch):
    """Two people signing in through the website (same server address) don't share one limit."""
    monkeypatch.setattr(settings, "WEB_PROXY_SECRET", "s3cret-shared-with-the-website")
    monkeypatch.setattr(settings, "LOGIN_RATE_LIMIT", 3)
    bad = {"email": admin.email, "password": "wrong-password", "school_slug": "alpha"}

    def via_web(ip):
        return {"X-Client-IP": ip, "X-Web-Secret": "s3cret-shared-with-the-website"}

    for _ in range(3):
        await client.post("/api/v1/auth/login", json=bad, headers=via_web("49.36.10.7"))
    assert (await client.post("/api/v1/auth/login", json=bad, headers=via_web("49.36.10.7"))).status_code == 429
    # Someone else on the same account, from another address, through the same website, isn't blocked.
    assert (await client.post("/api/v1/auth/login", json=bad, headers=via_web("103.21.5.9"))).status_code != 429
