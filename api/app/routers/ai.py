"""The AI assistant."""
from fastapi import APIRouter

from app.core import ratelimit
from app.core.config import settings
from app.core.deps import DB, CurrentUser, enabled_modules, require_module, require_permission
from app.core.errors import TooManyRequests
from app.schemas.ai import AiAnswer, AiQuestion, AiStatus
from app.schemas.common import ApiResponse, ok
from app.services import ai_service as svc

router = APIRouter(dependencies=[require_module("ai")])


def _key(current: CurrentUser) -> str:
    return f"rl:ai:{current.user.id}"


@router.get("", response_model=ApiResponse[AiStatus])
async def status(db: DB, current: CurrentUser = require_permission("ai.use")):
    current.require_school()
    from app.core.redis import get_redis
    used = int(await get_redis().get(_key(current)) or 0)
    modules = set(await enabled_modules(db, current.user.school_id))
    return ok(AiStatus(mode="ai" if svc._llm_on() else "rules", provider=svc.llm_name(), templates=svc.templates_out(current.user, modules),
                       left_today=max(settings.AI_DAILY_LIMIT - used, 0)))


@router.post("/ask", response_model=ApiResponse[AiAnswer])
async def ask(body: AiQuestion, db: DB, current: CurrentUser = require_permission("ai.use")):
    current.require_school()
    if not await ratelimit.hit(_key(current), settings.AI_DAILY_LIMIT, 86400):
        raise TooManyRequests("You've reached today's limit for the assistant. Try again tomorrow.", code="RATE_LIMITED")
    modules = set(await enabled_modules(db, current.user.school_id))
    return ok(await svc.ask(db, current.user, modules, body.question))
