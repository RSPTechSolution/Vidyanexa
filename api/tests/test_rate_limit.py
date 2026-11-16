"""The API-wide rate limit (a floor under the per-feature limits): per session, per address, and safe when Redis fails."""
from app.core import ratelimit
from app.core.config import settings

API = "/api/v1"


async def test_calls_without_a_session_are_limited_per_address(client, monkeypatch):
    monkeypatch.setattr(settings, "API_ANON_RATE_LIMIT_PER_MINUTE", 3)
    codes = [(await client.get(f"{API}/public/plans")).status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200]
    assert codes[3] == 429
    res = await client.get(f"{API}/public/plans")
    assert res.json()["error"]["code"] == "RATE_LIMITED"
    assert res.headers["retry-after"] == "60"


async def test_a_signed_in_session_has_its_own_allowance(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "API_RATE_LIMIT_PER_MINUTE", 3)
    monkeypatch.setattr(settings, "API_ANON_RATE_LIMIT_PER_MINUTE", 1)
    codes = [(await client.get(f"{API}/auth/me", headers=admin_headers)).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


async def test_health_checks_are_never_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "API_ANON_RATE_LIMIT_PER_MINUTE", 1)
    assert [(await client.get(f"{API}/health")).status_code for _ in range(5)] == [200] * 5


async def test_a_redis_outage_lets_calls_through(client, monkeypatch):
    async def broken(*_args, **_kwargs):
        raise ConnectionError("redis down")

    monkeypatch.setattr(settings, "API_ANON_RATE_LIMIT_PER_MINUTE", 1)
    monkeypatch.setattr(ratelimit, "hit", broken)
    assert [(await client.get(f"{API}/public/plans")).status_code for _ in range(3)] == [200] * 3
