"""Copy uploaded files from the server's disk into the bucket, once, when switching STORAGE_BACKEND from local to s3.

    python -m app.storage_migrate            # copy what isn't in the bucket yet (safe to run again)
    python -m app.storage_migrate --check    # only report what would be copied

Reads STORAGE_DIR for the files and the S3_* settings for the bucket. Files stay on disk; remove them yourself once the
app has run on the bucket for a while. Backups (STORAGE_DIR/backups) are not uploaded files and are skipped."""
import asyncio
import mimetypes
import sys
from pathlib import Path

from app.core.config import settings
from app.services.blob_store import S3Store


async def main(check: bool) -> int:
    root = Path(settings.STORAGE_DIR).resolve()
    store = S3Store(settings.S3_BUCKET)
    there = {o["key"]: o["size"] for o in await store.list()}
    todo = [p for p in root.rglob("*") if p.is_file() and p.relative_to(root).parts[0] != "backups"]
    copied = skipped = 0
    for p in todo:
        key = p.relative_to(root).as_posix()
        if there.get(key) == p.stat().st_size:
            skipped += 1
            continue
        if not check:
            await store.put(key, p.read_bytes(), mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        copied += 1
    print(f"{'Would copy' if check else 'Copied'} {copied} file(s); {skipped} already in the bucket.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main("--check" in sys.argv)))
