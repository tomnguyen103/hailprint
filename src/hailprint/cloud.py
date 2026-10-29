"""Supabase S3 state and public bucket synchronization and cloud runners."""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import sys
import urllib.request
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
import pandas as pd

from hailprint import candidates, odin, paths

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
BACKFILL_EAGLEI_YEARS: tuple[int, ...] = (2020, 2021, 2022, 2023, 2024, 2025)
MAX_BYTES = 64 * 1024 * 1024
_PROJECT_REF_RE = re.compile(r"^[a-z0-9-]+$")
_PUBLIC_KEY_RE = re.compile(
    r"^(storms\.json|pipeline\.json|storms/\d{4}-\d{2}-\d{2}/"
    r"(swath\.geojson|reports\.geojson|pairs\.json|zip-counts\.json|"
    r"warnings\.geojson|power\.json|internet\.json))$"
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


def _fetch_session_token(project_ref: str, anon_key: str, email: str, password: str) -> str:
    if not _PROJECT_REF_RE.fullmatch(project_ref):
        raise ValueError(f"invalid Supabase project_ref: {project_ref!r}")
    url = f"https://{project_ref}.supabase.co/auth/v1/token?grant_type=password"
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"apikey": anon_key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("access_token")
    if not isinstance(token, str) or not token:
        raise ValueError("missing access_token from Supabase auth")
    return token


def s3_client(config: Config) -> Any:
    if ":" in config.access_key_id:
        project_ref, email, password = config.access_key_id.split(":", 2)
        if not _PROJECT_REF_RE.fullmatch(project_ref):
            raise ValueError(f"invalid Supabase project_ref: {project_ref!r}")
        token = _fetch_session_token(project_ref, config.secret_access_key, email, password)
        return boto3.client(
            "s3",
            endpoint_url=config.endpoint,
            region_name=config.region,
            aws_access_key_id=project_ref,
            aws_secret_access_key=config.secret_access_key,
            aws_session_token=token,
        )
    return boto3.client(
        "s3",
        endpoint_url=config.endpoint,
        region_name=config.region,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
    )


def _validate_key(key: str, local_base: Path | None = None, *, public: bool = False) -> None:
    if not key or key.startswith("/") or "\\" in key or ":" in key or ".." in key.split("/"):
        raise ValueError("unsafe S3 key")
    if public and not _PUBLIC_KEY_RE.fullmatch(key):
        raise ValueError("unsafe S3 key")
    if local_base is not None:
        base_resolved = local_base.resolve()
        dest_resolved = (local_base / key).resolve()
        if not dest_resolved.is_relative_to(base_resolved) or dest_resolved == base_resolved:
            raise ValueError("unsafe S3 key")


def _list_keys(client: Any, bucket: str, prefix: str, max_bytes: int = MAX_BYTES) -> list[str]:
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
                size = obj.get("Size")
                if isinstance(size, int) and size > max_bytes:
                    raise RuntimeError(f"S3 object {key} exceeds {max_bytes} bytes")
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
    *,
    max_bytes: int = MAX_BYTES,
    public: bool = False,
) -> SyncState:
    state = SyncState()
    seen: set[str] = set()
    for prefix in prefixes:
        for key in _list_keys(client, bucket, prefix, max_bytes=max_bytes):
            if key in seen:
                continue
            seen.add(key)
            _validate_key(key, local_base, public=public)
            resp = client.get_object(Bucket=bucket, Key=key)
            body: bytes = resp["Body"].read(max_bytes + 1)
            if len(body) > max_bytes:
                raise RuntimeError(f"S3 object {key} exceeds {max_bytes} bytes")
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
    base_resolved = local_base.resolve()
    keys: list[str] = []
    for path in local_base.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        if not path.resolve().is_relative_to(base_resolved):
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
    collected = _collect_local_keys(local_base, prefix_tuple, exclude_tuple)
    if public:
        collected = [k for k in collected if _PUBLIC_KEY_RE.fullmatch(k)]
    local_keys = _order_keys(collected, public=public)
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

    rc = run_cli(["candidates", "--missing", "--top", str(max_ingest)])
    if rc != 0:
        return rc

    cand_path = root / "data" / "derived" / "index" / "candidate-days.csv"
    swaths_dir = root / "data" / "derived" / "swaths"
    if not cand_path.is_file():
        _log("candidates failed: no candidate-days.csv")
        return 1
    ranked = pd.read_csv(cand_path, parse_dates=["storm_date"])
    if ranked.empty:
        missing_dates: list[str] = []
    else:
        ranked["storm_date"] = pd.to_datetime(ranked["storm_date"]).dt.date
        missing_dates = [
            d.isoformat() for d in candidates.missing_days(ranked, swaths_dir)[:max_ingest]
        ]
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


@contextlib.contextmanager
def _cli_context(root: Path, now: datetime | None):
    from hailprint import __main__ as cli_mod
    from hailprint import archive

    derived = root / "data" / "derived"
    raw = root / "data" / "raw"
    patches: list[tuple[Any, str, Any]] = [
        (paths, "ROOT", root),
        (paths, "RAW_DIR", raw),
        (paths, "DERIVED_DIR", derived),
        (paths, "OUT_DIR", root / "out"),
        (paths, "SITE_DATA_DIR", root / "site" / "data"),
        (cli_mod, "RAW_DIR", raw / "mesh"),
        (cli_mod, "DERIVED_DIR", derived / "swaths"),
        (cli_mod, "OUT_DIR", root / "out"),
        (cli_mod, "PARCELS_GDB", raw / "hcad" / "extracted" / "Parcels.gdb"),
        (cli_mod, "PARCELS_DIR", derived / "parcels"),
        (cli_mod, "SCORES_DIR", derived / "scores"),
        (cli_mod, "WARNINGS_DIR", derived / "warnings"),
        (cli_mod, "EAGLEI_DIR", derived / "eaglei"),
        (cli_mod, "POWER_DIR", derived / "power"),
        (cli_mod, "ODIN_DIR", derived / "odin"),
        (cli_mod, "INTERNET_DIR", derived / "internet"),
        (cli_mod, "SITE_DATA_DIR", root / "site" / "data"),
        (archive, "INDEX_PATH", derived / "index" / "mesh-archive.parquet"),
        (candidates, "WCM_PATH", raw / "spc" / "1955-2025_hail.csv.zip"),
        (candidates, "CANDIDATES_PATH", derived / "index" / "candidate-days.csv"),
        (candidates, "DAILY_DIR", raw / "spc" / "daily"),
    ]
    if now is not None:
        patches.append((cli_mod, "_utc_now", lambda: now))
        patches.append((candidates, "_utc_today", lambda: now.date()))
    saved = [(mod, attr, getattr(mod, attr)) for mod, attr, _ in patches]
    try:
        for mod, attr, val in patches:
            setattr(mod, attr, val)
        yield
    finally:
        for mod, attr, old_val in saved:
            setattr(mod, attr, old_val)


def _default_cli(argv: list[str], *, root: Path | None = None, now: datetime | None = None) -> int:
    from hailprint import __main__ as cli_mod

    if root is None and now is None:
        return cli_mod.main(argv)
    with _cli_context(root if root is not None else paths.ROOT, now):
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
    runner: Callable[[list[str]], int] = (
        run_cli
        if run_cli is not None
        else (lambda argv: _default_cli(argv, root=resolved_root, now=now))
    )
    data_dir = resolved_root / "data"
    site_dir = resolved_root / "site" / "data"

    if task == "odin":
        pre_now = now if now is not None else datetime.now(UTC)
        slot = odin.slot_of(pre_now)
        odin_key = f"{ODIN_PREFIX}{odin.file_name(slot.date())}"
        next_day_key = f"{ODIN_PREFIX}{odin.file_name((slot + timedelta(days=1)).date())}"
        state = sync_down(s3, config.state_bucket, (odin_key,), data_dir)
        rc = odin_run(runner)
        if rc != 0:
            return rc
        post_slot = odin.slot_of(datetime.now(UTC) if now is None else pre_now)
        post_key = f"{ODIN_PREFIX}{odin.file_name(post_slot.date())}"
        odin_keys = tuple(
            dict.fromkeys(
                [
                    odin_key,
                    post_key,
                    next_day_key,
                    *(
                        f"{ODIN_PREFIX}{p.name}"
                        for p in sorted((data_dir / ODIN_PREFIX).glob("odin-*.parquet"))
                    ),
                ]
            )
        )
        sync_up(s3, config.state_bucket, odin_keys, data_dir, state)
        return 0

    if task not in ("nightly", "backfill"):
        raise ValueError(f"unknown cloud task: {task}")

    state = sync_down(s3, config.state_bucket, STATE_PREFIXES, data_dir)
    pub_state = sync_down(s3, config.public_bucket, PUBLIC_PREFIXES, site_dir, public=True)

    rc = (
        nightly(runner, resolved_root, env)
        if task == "nightly"
        else backfill(runner, resolved_root, env)
    )
    if rc != 0 and not (site_dir / "storms.json").exists():
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
    return rc
