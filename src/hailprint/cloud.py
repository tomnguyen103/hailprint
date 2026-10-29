"""Supabase S3 state and public bucket synchronization and cloud runners."""

from __future__ import annotations

import contextlib
import hashlib
import io
import os
import re
import sys
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3

from hailprint import odin, paths

ENV_VARS: tuple[str, ...] = (
    "SUPABASE_S3_ENDPOINT",
    "SUPABASE_S3_REGION",
    "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY",
    "HAILPRINT_STATE_BUCKET",
    "HAILPRINT_PUBLIC_BUCKET",
)
STATE_PREFIXES: tuple[str, ...] = ("raw/spc/", "derived/")
PUBLIC_PREFIXES: tuple[str, ...] = ("",)
ODIN_PREFIX = "derived/odin/"
BACKFILL_EAGLEI_YEARS: tuple[int, ...] = (2021, 2023, 2025)


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


def parse_max_ingest(env: Mapping[str, str] = os.environ) -> int:
    raw = env.get("MAX_INGEST", "5")
    if not re.fullmatch(r"[0-9]+", raw) or int(raw) < 1:
        raise ValueError("MAX_INGEST must be a whole number from 1")
    return int(raw)


def _log(msg: str) -> None:
    print(msg, file=sys.stderr)


def nightly(
    run_cli: Callable[[list[str]], int],
    root: Path,
    env: Mapping[str, str] = os.environ,
) -> int:
    max_ingest = parse_max_ingest(env)
    rc = run_cli(["index"])
    if rc != 0:
        return rc

    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = run_cli(["candidates", "--missing", "--top", str(max_ingest)])
    if rc != 0:
        return rc

    missing_dates = [line.strip() for line in buf.getvalue().splitlines() if line.strip()]
    if missing_dates:
        gdb_dir = root / "data" / "raw" / "hcad" / "extracted" / "Parcels.gdb"
        has_gdb = gdb_dir.is_dir()
        if not has_gdb:
            _log("parcels skipped: no HCAD gdb")
        for storm_date in missing_dates:
            if run_cli(["ingest", storm_date]) != 0:
                _log(f"ingest {storm_date} failed; skipped")
                continue
            if has_gdb and run_cli(["parcels", storm_date]) != 0:
                _log(
                    f"parcels {storm_date} failed; "
                    f"rerun by hand: uv run hailprint parcels {storm_date}"
                )

    rc = run_cli(["score"])
    if rc != 0:
        return rc

    for step in ("warnings", "power", "internet"):
        if run_cli([step, "--missing"]) != 0:
            _log(f"{step} failed; publish goes on")

    publish_cmd = (
        ["publish", "--with-internet"] if env.get("PUBLISH_INTERNET") == "1" else ["publish"]
    )
    return run_cli(publish_cmd)


def odin_run(run_cli: Callable[[list[str]], int]) -> int:
    return run_cli(["odin"])


def backfill(
    run_cli: Callable[[list[str]], int],
    root: Path,
    env: Mapping[str, str] = os.environ,
) -> int:
    if run_cli(["warnings", "--missing"]) != 0:
        _log("warnings failed; publish goes on")

    eaglei_dir = root / "data" / "derived" / "eaglei"
    missing_years = [
        str(y) for y in BACKFILL_EAGLEI_YEARS if not (eaglei_dir / f"eaglei-{y}.parquet").exists()
    ]
    if missing_years:
        rc = run_cli(["eaglei", *missing_years])
        if rc != 0:
            return rc

    for step in ("power", "internet"):
        if run_cli([step, "--missing"]) != 0:
            _log(f"{step} failed; publish goes on")

    publish_cmd = (
        ["publish", "--with-internet"] if env.get("PUBLISH_INTERNET") == "1" else ["publish"]
    )
    return run_cli(publish_cmd)


def _default_cli(argv: list[str]) -> int:
    from hailprint import __main__ as cli_mod

    return cli_mod.main(argv)


def run_cloud(
    task: str,
    *,
    client: Any = None,
    root: Path | None = None,
    env: Mapping[str, str] = os.environ,
    run_cli: Callable[[list[str]], int] | None = None,
    now: datetime | None = None,
) -> int:
    config = Config.from_env(env)
    resolved_root = root if root is not None else paths.resolve_root(env)
    s3 = client if client is not None else s3_client(config)
    runner = run_cli if run_cli is not None else _default_cli
    data_dir = resolved_root / "data"
    site_dir = resolved_root / "site" / "data"

    if task == "odin":
        slot = odin.slot_of(now if now is not None else datetime.now(UTC))
        odin_key = f"{ODIN_PREFIX}{odin.file_name(slot.date())}"
        state = sync_down(s3, config.state_bucket, (odin_key,), data_dir)
        rc = odin_run(runner)
        if rc != 0:
            return rc
        sync_up(s3, config.state_bucket, (odin_key,), data_dir, state)
        return 0

    if task not in ("nightly", "backfill"):
        raise ValueError(f"unknown cloud task: {task}")

    state = sync_down(s3, config.state_bucket, STATE_PREFIXES, data_dir)
    pub_state = sync_down(s3, config.public_bucket, PUBLIC_PREFIXES, site_dir)

    rc = (
        nightly(runner, resolved_root, env)
        if task == "nightly"
        else backfill(runner, resolved_root, env)
    )
    if rc != 0:
        return rc

    sync_up(
        s3,
        config.state_bucket,
        STATE_PREFIXES,
        data_dir,
        state,
        exclude_prefixes=(ODIN_PREFIX,),
    )
    sync_up(
        s3,
        config.public_bucket,
        PUBLIC_PREFIXES,
        site_dir,
        pub_state,
        public=True,
        mirror=True,
    )
    return 0
