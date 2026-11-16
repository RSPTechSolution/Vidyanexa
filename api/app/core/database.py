"""Async engine, sessions and per-transaction tenant context.

Every request runs in one transaction. Before any statement in that transaction,
the tenant context stored on the session (``session.info["tenant"]``) is written
into Postgres settings with ``set_config(..., is_local => true)``. Row-level
security policies read those settings, so a query can only ever see rows of the
current school -- even if a service forgets to filter by ``school_id``.
"""
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


@dataclass
class TenantContext:
    school_id: uuid.UUID | None = None
    bypass: bool = False  # super admin / system jobs only


def make_engine(url: str | None = None, *, null_pool: bool = False):
    kwargs = {"poolclass": NullPool} if null_pool else {
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_pre_ping": True,
        # Recycle connections now and then, and never let one query or a forgotten open transaction hold a connection
        # for long: under heavy traffic that is what turns one slow request into a queue for everyone.
        "pool_recycle": 1800,
        "connect_args": {"server_settings": {
            "statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS),
            "idle_in_transaction_session_timeout": str(max(settings.DB_STATEMENT_TIMEOUT_MS, 60000)),
        }} if settings.DB_STATEMENT_TIMEOUT_MS > 0 else {},
    }
    return create_async_engine(url or settings.DATABASE_URL, **kwargs)


engine = make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

_SET_CONTEXT = text(
    "SELECT set_config('app.current_school_id', :sid, true), "
    "set_config('app.bypass_rls', :bypass, true)"
)


def _context_params(ctx: TenantContext) -> dict:
    return {"sid": str(ctx.school_id) if ctx.school_id else "", "bypass": "on" if ctx.bypass else "off"}


@event.listens_for(Session, "after_begin")
def _apply_tenant_context(session: Session, transaction, connection) -> None:
    ctx: TenantContext = session.info.get("tenant") or TenantContext()
    connection.execute(_SET_CONTEXT, _context_params(ctx))


async def set_tenant(session: AsyncSession, school_id: uuid.UUID | None, *, bypass: bool = False) -> None:
    """Change the tenant context, applying it immediately if a transaction is open."""
    ctx = TenantContext(school_id=school_id, bypass=bypass)
    session.info["tenant"] = ctx
    if session.in_transaction():
        await session.execute(_SET_CONTEXT, _context_params(ctx))


@asynccontextmanager
async def elevated(session: AsyncSession):
    """Temporarily bypass RLS (for platform tables such as plans and leads), then
    restore the request's own tenant context."""
    previous: TenantContext = session.info.get("tenant") or TenantContext()
    await set_tenant(session, previous.school_id, bypass=True)
    try:
        yield session
    finally:
        await set_tenant(session, previous.school_id, bypass=previous.bypass)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Request-scoped session. Commits once at the end; services only flush."""
    async with SessionLocal() as session:
        session.info["tenant"] = TenantContext()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def system_session(school_id: uuid.UUID | None = None, *, bypass: bool = True, url: str | None = None):
    """Session for Celery tasks / scripts. Uses NullPool so it is safe inside asyncio.run()."""
    eng = make_engine(url, null_pool=True)
    maker = async_sessionmaker(eng, expire_on_commit=False)

    class _Ctx:
        async def __aenter__(self) -> AsyncSession:
            self.session = maker()
            self.session.info["tenant"] = TenantContext(school_id=school_id, bypass=bypass)
            return self.session

        async def __aexit__(self, exc_type, exc, tb):
            try:
                if exc_type is None:
                    await self.session.commit()
                else:
                    await self.session.rollback()
            finally:
                await self.session.close()
                await eng.dispose()

    return _Ctx()
