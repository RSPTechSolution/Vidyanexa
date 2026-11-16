import hashlib
import logging

from starlette.requests import Request

from app.core.redis import get_redis

log = logging.getLogger(__name__)


async def hit(key: str, limit: int, window_seconds: int) -> bool:
    """Count one attempt. Returns False when the limit is exceeded."""
    redis = get_redis()
    async with redis.pipeline(transaction=True) as pipe:
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = await pipe.execute()
    return int(count) <= limit


async def reset(key: str) -> None:
    await get_redis().delete(key)


def api_bucket(request: Request, client_ip: str | None, per_session: int, anonymous: int) -> tuple[str, int] | None:
    """Which allowance an API call counts against: its session (the bearer token, hashed: the key never holds the token)
    or, without one, its address. None when that limit is switched off."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and len(auth) > 7:
        if per_session <= 0:
            return None
        return f"rl:api:s:{hashlib.sha256(auth[7:].encode()).hexdigest()[:24]}", per_session
    if anonymous <= 0:
        return None
    return f"rl:api:ip:{client_ip or 'unknown'}", anonymous


async def allow(key: str, limit: int, window_seconds: int = 60) -> bool:
    """Like hit(), but lets the call through if Redis is unavailable: a cache outage must not take the API down."""
    try:
        return await hit(key, limit, window_seconds)
    except Exception:  # noqa: BLE001 - any Redis failure: fail open, and say so in the logs
        log.warning("rate limit check skipped: Redis unavailable", exc_info=True)
        return True
