"""Where file contents live: a folder on disk (development) or an S3-compatible bucket (Cloudflare R2, Wasabi, AWS S3,
MinIO). Picked by STORAGE_BACKEND; the rest of the app only sees `put`, `get` and `delete` by key.

The S3 client is boto3, which blocks, so each call runs in a worker thread."""
import asyncio
import functools
from pathlib import Path
from typing import Protocol

from app.core.config import settings
from app.core.errors import NotFound


class BlobStore(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...


class LocalStore:
    def __init__(self, root: str):
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise NotFound("File not found")  # never follow a key outside the storage folder
        return p

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    async def get(self, key: str) -> bytes:
        p = self._path(key)
        if not p.exists():
            raise NotFound("The file is missing from storage")
        return p.read_bytes()

    async def delete(self, key: str) -> None:
        try:
            self._path(key).unlink()
        except (FileNotFoundError, NotFound):
            pass


@functools.cache
def _client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL or None,
        region_name=settings.S3_REGION or None,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY or None,
        config=Config(signature_version="s3v4", retries={"max_attempts": 4, "mode": "standard"}, s3={"addressing_style": "path"}),
    )


class S3Store:
    def __init__(self, bucket: str):
        if not bucket:
            raise RuntimeError("STORAGE_BACKEND=s3 needs S3_BUCKET (and the endpoint and keys)")
        self.bucket = bucket

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(_client().put_object, Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    async def get(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        def read() -> bytes:
            try:
                return _client().get_object(Bucket=self.bucket, Key=key)["Body"].read()
            except ClientError as e:
                if e.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
                    raise NotFound("The file is missing from storage") from e
                raise
        return await asyncio.to_thread(read)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(_client().delete_object, Bucket=self.bucket, Key=key)

    async def list(self, prefix: str = "") -> list[dict]:
        def run() -> list[dict]:
            out: list[dict] = []
            for page in _client().get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
                out += [{"key": o["Key"], "size": o["Size"]} for o in page.get("Contents", [])]
            return out
        return await asyncio.to_thread(run)


@functools.cache
def files() -> BlobStore:
    """The store for uploaded files."""
    return S3Store(settings.S3_BUCKET) if settings.STORAGE_BACKEND == "s3" else LocalStore(settings.STORAGE_DIR)


def backups_offsite() -> S3Store | None:
    """The bucket that keeps a copy of each backup off the server, if one is set."""
    return S3Store(settings.S3_BACKUP_BUCKET) if settings.S3_BACKUP_BUCKET else None


def reset() -> None:
    """Forget the chosen store and client (tests change the settings)."""
    files.cache_clear()
    _client.cache_clear()
