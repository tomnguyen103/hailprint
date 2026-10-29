"""Supabase S3 state and public bucket synchronization."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import boto3

ENV_VARS: tuple[str, ...] = (
    "SUPABASE_S3_ENDPOINT",
    "SUPABASE_S3_REGION",
    "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY",
    "HAILPRINT_STATE_BUCKET",
    "HAILPRINT_PUBLIC_BUCKET",
)


@dataclass(frozen=True)
class Config:
    endpoint: str
    region: str
    access_key_id: str
    secret_access_key: str
    state_bucket: str
    public_bucket: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> Config:
        missing = [name for name in ENV_VARS if not env.get(name, "").strip()]
        if missing:
            raise ValueError(f"missing environment variables: {', '.join(missing)}")
        return cls(
            endpoint=env["SUPABASE_S3_ENDPOINT"].strip(),
            region=env["SUPABASE_S3_REGION"].strip(),
            access_key_id=env["SUPABASE_S3_ACCESS_KEY_ID"].strip(),
            secret_access_key=env["SUPABASE_S3_SECRET_ACCESS_KEY"].strip(),
            state_bucket=env["HAILPRINT_STATE_BUCKET"].strip(),
            public_bucket=env["HAILPRINT_PUBLIC_BUCKET"].strip(),
        )


@dataclass
class SyncState:
    digests: dict[tuple[str, str], str] = field(default_factory=dict)
    remote_keys: set[tuple[str, str]] = field(default_factory=set)


def s3_client(config: Config) -> Any:
    return boto3.client(
        "s3",
        endpoint_url=config.endpoint,
        region_name=config.region,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
    )


def _validate_key(key: str) -> None:
    if not key or key.startswith("/") or "\\" in key or ".." in key.split("/"):
        raise ValueError("unsafe S3 key")


def _list_keys(client: Any, bucket: str, prefix: str) -> list[str]:
    keys: list[str] = []
    token: str | None = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
        if token is not None:
            kwargs["ContinuationToken"] = token
        resp = client.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []) or []:
            key = obj.get("Key", "")
            if key and not key.endswith("/"):
                keys.append(key)
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
        if not token:
            break
    return keys


# shortcut: sync_down downloads every state object on each nightly run (~11 MB),
# upgrade to ETag/local cache if state exceeds 100 MB
def sync_down(
    client: Any,
    bucket: str,
    prefixes: Iterable[str],
    local_base: Path,
) -> SyncState:
    state = SyncState()
    seen: set[str] = set()
    for prefix in prefixes:
        for key in _list_keys(client, bucket, prefix):
            if key in seen:
                continue
            seen.add(key)
            _validate_key(key)
            resp = client.get_object(Bucket=bucket, Key=key)
            body: bytes = resp["Body"].read()
            dest = local_base / key
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(body)
            state.digests[(bucket, key)] = hashlib.sha256(body).hexdigest()
            state.remote_keys.add((bucket, key))
    return state


def _matches_prefix(key: str, prefixes: tuple[str, ...]) -> bool:
    return any(prefix == "" or key.startswith(prefix) for prefix in prefixes)


def _collect_local_keys(
    local_base: Path,
    prefixes: tuple[str, ...],
    exclude_prefixes: tuple[str, ...],
) -> list[str]:
    if not local_base.exists():
        return []
    keys: list[str] = []
    for path in local_base.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix in (".lock", ".tmp"):
            continue
        rel = path.relative_to(local_base).as_posix()
        if not _matches_prefix(rel, prefixes):
            continue
        if any(rel.startswith(ex) for ex in exclude_prefixes):
            continue
        keys.append(rel)
    return keys


def _order_keys(keys: list[str], *, public: bool) -> list[str]:
    if not public:
        return sorted(keys)
    # Per-date files under storms/ upload before top-level index files (storms.json, pipeline.json)
    return sorted(keys, key=lambda k: (0 if k.startswith("storms/") else 1, k))


def _public_headers(key: str) -> dict[str, str]:
    content_type = "application/geo+json" if key.endswith(".geojson") else "application/json"
    return {
        "CacheControl": "max-age=60",
        "ContentType": content_type,
    }


def sync_up(
    client: Any,
    bucket: str,
    prefixes: Iterable[str],
    local_base: Path,
    state: SyncState,
    *,
    exclude_prefixes: Iterable[str] = (),
    public: bool = False,
    mirror: bool = False,
) -> list[str]:
    prefix_tuple = tuple(prefixes)
    exclude_tuple = tuple(exclude_prefixes)
    local_keys = _order_keys(
        _collect_local_keys(local_base, prefix_tuple, exclude_tuple),
        public=public,
    )
    local_set = set(local_keys)
    uploaded: list[str] = []

    for key in local_keys:
        path = local_base / key
        body = path.read_bytes()
        digest = hashlib.sha256(body).hexdigest()
        if state.digests.get((bucket, key)) == digest:
            continue
        extra = _public_headers(key) if public else {}
        client.put_object(Bucket=bucket, Key=key, Body=body, **extra)
        state.digests[(bucket, key)] = digest
        state.remote_keys.add((bucket, key))
        uploaded.append(key)

    if mirror:
        stale_keys = sorted(
            key
            for (b, key) in state.remote_keys
            if b == bucket
            and _matches_prefix(key, prefix_tuple)
            and not any(key.startswith(ex) for ex in exclude_tuple)
            and key not in local_set
        )
        for key in stale_keys:
            client.delete_object(Bucket=bucket, Key=key)
            state.remote_keys.discard((bucket, key))
            state.digests.pop((bucket, key), None)

    return uploaded
