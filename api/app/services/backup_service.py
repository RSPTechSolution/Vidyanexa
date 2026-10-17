"""Database backups: every table as CSV in one zip, with a manifest. Made with the owner connection (so row-level security
doesn't hide rows), kept under STORAGE_DIR/backups (and copied to S3_BACKUP_BUCKET when set), and pruned to the newest BACKUP_KEEP. Restore with `python -m app.restore`.

A school can also export its own rows (every table with a school_id) as a zip of CSVs."""
import asyncio
import io
import json
import logging
import os
import re
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text

from app.core.config import settings
from app.core.database import make_engine
from app.models import Base

log = logging.getLogger(__name__)
NAME = re.compile(r"^eduvia-\d{8}-\d{6}\.zip$")
SKIP = {"user_sessions", "password_reset_tokens"}  # short-lived secrets: not worth restoring, not worth leaking


def backup_dir() -> Path:
    d = Path(settings.STORAGE_DIR) / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _tables() -> list[str]:
    return [t.name for t in Base.metadata.sorted_tables if t.name not in SKIP]


async def _copy_out(conn, query: str) -> bytes:
    raw = await conn.get_raw_connection()
    buf = io.BytesIO()
    await raw.driver_connection.copy_from_query(query, output=buf, format="csv", header=True)
    return buf.getvalue()


async def create_backup(note: str = "manual") -> dict:
    """Write a backup zip and return its manifest."""
    eng = make_engine(settings.MIGRATION_DATABASE_URL, null_pool=True)
    stamp = datetime.now(UTC)
    name = f"eduvia-{stamp:%Y%m%d-%H%M%S}.zip"
    rows: dict[str, int] = {}
    tmp = backup_dir() / (name + ".part")
    try:
        async with eng.connect() as conn:
            await conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))  # one consistent snapshot
            revision = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
                for t in _tables():
                    data = await _copy_out(conn, f'SELECT * FROM "{t}"')
                    rows[t] = max(data.count(b"\n") - 1, 0)
                    z.writestr(f"{t}.csv", data)
                manifest = {"app": "eduvia", "format": 1, "created_at": stamp.isoformat(), "revision": revision, "note": note,
                            "tables": rows, "row_total": sum(rows.values())}
                z.writestr("manifest.json", json.dumps(manifest, indent=2))
        os.replace(tmp, backup_dir() / name)
    finally:
        await eng.dispose()
        if tmp.exists():
            tmp.unlink()
    prune()
    await copy_offsite(backup_dir() / name)
    return {"name": name, **manifest, "size": (backup_dir() / name).stat().st_size}


async def copy_offsite(path: Path) -> bool:
    """Put a copy of the backup in the backup bucket (S3_BACKUP_BUCKET), so losing the server doesn't lose the backups,
    and keep the newest BACKUP_KEEP there too. A failure is logged, never raised: the local backup is still good."""
    from app.services import blob_store

    store = blob_store.backups_offsite()
    if not store:
        return False
    try:
        await store.put(f"backups/{path.name}", path.read_bytes(), "application/zip")
        names = sorted((o["key"] for o in await store.list("backups/") if NAME.match(o["key"].rsplit("/", 1)[-1])), reverse=True)
        for old in names[settings.BACKUP_KEEP:]:
            await store.delete(old)
        return True
    except Exception:
        log.exception("Could not copy backup %s to the backup bucket", path.name)
        return False


def prune(keep: int | None = None) -> None:
    keep = settings.BACKUP_KEEP if keep is None else keep
    files = sorted((p for p in backup_dir().iterdir() if NAME.match(p.name)), key=lambda p: p.name, reverse=True)
    for old in files[keep:]:
        old.unlink(missing_ok=True)


def list_backups() -> list[dict]:
    out = []
    for p in sorted((p for p in backup_dir().iterdir() if NAME.match(p.name)), key=lambda p: p.name, reverse=True):
        try:
            with zipfile.ZipFile(p) as z:
                m = json.loads(z.read("manifest.json"))
        except (zipfile.BadZipFile, KeyError, json.JSONDecodeError):
            m = {}
        out.append({"name": p.name, "size": p.stat().st_size, "created_at": m.get("created_at"), "revision": m.get("revision"),
                    "row_total": m.get("row_total"), "note": m.get("note")})
    return out


def path_of(name: str) -> Path | None:
    if not NAME.match(name):
        return None
    p = backup_dir() / name
    return p if p.exists() else None


async def restore_backup(path: Path) -> dict:
    """Replace every table's rows with the backup's. Refuses a backup from a different schema revision."""
    with zipfile.ZipFile(path) as z:
        manifest = json.loads(z.read("manifest.json"))
        files = {n: z.read(n) for n in z.namelist() if n.endswith(".csv")}
    eng = make_engine(settings.MIGRATION_DATABASE_URL, null_pool=True)
    try:
        async with eng.begin() as conn:
            revision = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
            if revision != manifest.get("revision"):
                raise ValueError(f"Backup is from schema {manifest.get('revision')}, the database is at {revision}. Migrate to match first.")
            tables = [t for t in _tables() if f"{t}.csv" in files]
            await conn.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in reversed(tables)) + " RESTART IDENTITY CASCADE"))
            raw = await conn.get_raw_connection()
            for t in tables:  # parents first, so foreign keys hold
                data = files[f"{t}.csv"]
                if data.count(b"\n") > 1:
                    await raw.driver_connection.copy_to_table(t, source=io.BytesIO(data), format="csv", header=True)
    finally:
        await eng.dispose()
    return manifest


async def export_school(school_id: uuid.UUID) -> bytes:
    """One school's rows from every table that has a school_id, as a zip of CSVs (no secrets: password hashes are blanked)."""
    eng = make_engine(settings.MIGRATION_DATABASE_URL, null_pool=True)
    out = io.BytesIO()
    try:
        async with eng.connect() as conn:
            await conn.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                for t in Base.metadata.sorted_tables:
                    if t.name in SKIP:
                        continue
                    if t.name == "schools":
                        query = f"SELECT * FROM schools WHERE id = '{school_id}'"
                    elif "school_id" in t.c:
                        cols = ", ".join("NULL AS password_hash" if c.name == "password_hash" else f'"{c.name}"' for c in t.c)
                        query = f'SELECT {cols} FROM "{t.name}" WHERE school_id = \'{school_id}\''
                    else:
                        continue
                    z.writestr(f"{t.name}.csv", await _copy_out(conn, query))
                z.writestr("README.txt", "Your school's data from Vidyanexa, one CSV file per table. Uploaded files are not included; "
                                         "download them from the app. Passwords are never exported.\n")
    finally:
        await eng.dispose()
    return out.getvalue()


async def daily_loop() -> None:
    """Background task: make a backup when the newest one is more than a day old. Checks hourly."""
    while True:
        try:
            newest = list_backups()[:1]
            age = (datetime.now(UTC) - datetime.fromisoformat(newest[0]["created_at"])).total_seconds() if newest and newest[0]["created_at"] else None
            # Several API workers each run this loop; a short Redis lock lets only one of them make the backup.
            from app.core.redis import get_redis
            if (age is None or age > 86400) and await get_redis().set("lock:daily-backup", "1", nx=True, ex=3300):
                m = await create_backup("daily")
                log.info("Daily backup written: %s (%s rows)", m["name"], m["row_total"])
        except Exception:  # never take the app down over a backup
            log.exception("Daily backup failed")
        await asyncio.sleep(3600)
