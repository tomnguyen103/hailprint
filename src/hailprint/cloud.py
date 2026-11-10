"""Supabase S3 state and public bucket synchronization and cloud runners."""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import re
import sys
from collections.abc import Callable, Iterable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
import pandas as pd

from hailprint import candidates, files, net, odin, paths, publish_run

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
# The live task owns this public prefix; nightly and backfill never read, write, or delete it.
LIVE_PREFIX = "live/"
LIVE_INDEX = f"{LIVE_PREFIX}now.json"
BACKFILL_EAGLEI_YEARS: tuple[int, ...] = (2020, 2021, 2022, 2023, 2024, 2025)
MAX_BYTES = 64 * 1024 * 1024
SYNC_THREADS = 8
_PROJECT_REF_RE = re.compile(r"^[a-z0-9-]+$")
_PUBLIC_KEY_RE = re.compile(
    r"^(storms\.json|pipeline\.json|storms/\d{4}-\d{2}-\d{2}/"
    r"(swath\.geojson|reports\.geojson|pairs\.json|zip-counts\.json|"
    r"warnings\.geojson|power\.json|internet\.json)|"
    r"live/(now\.json|swath\.geojson|reports\.geojson|warnings\.geojson))$"
)


@dataclass(frozen=True)
class Config:
    endpoint: str
    region: str
    access_key_id: str = field(repr=False)
    secret_access_key: str = field(repr=False)
    state_bucket: str
    public_bucket: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> Config:
        missing = [name for name in ENV_VARS if not env.get(name, "").strip()]
        if missing:
            raise ValueError(f"missing environment variables: {', '.join(missing)}")
        endpoint = env["SUPABASE_S3_ENDPOINT"].strip()
        if not endpoint.startswith("https://"):
            raise ValueError("SUPABASE_S3_ENDPOINT must start with https://")
        return cls(
            endpoint=endpoint,
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
    raw = net.post(
        url,
        payload,
        {"apikey": anon_key, "Content-Type": "application/json"},
        timeout=30,
        max_bytes=65536,
    )
    data = json.loads(raw.decode("utf-8"))
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token:
        raise ValueError("missing access_token from Supabase auth")
    return token


def s3_client(config: Config) -> Any:
    if ":" in config.access_key_id:
        if config.access_key_id.count(":") < 2:
            raise ValueError(
                "SUPABASE_S3_ACCESS_KEY_ID with ':' must have format project_ref:email:password"
            )
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
        cur = local_base / key
        while cur != local_base and cur != cur.parent:
            if cur.is_symlink():
                raise ValueError("unsafe S3 key")
            cur = cur.parent
        base_resolved = local_base.resolve()
        dest_resolved = (local_base / key).resolve()
        if not dest_resolved.is_relative_to(base_resolved) or dest_resolved == base_resolved:
            raise ValueError("unsafe S3 key")


_SINGLE_PART_ETAG_RE = re.compile(r"^[0-9a-f]{32}$")


def _list_objects(
    client: Any, bucket: str, prefix: str, max_bytes: int = MAX_BYTES
) -> list[tuple[str, str | None]]:
    items: list[tuple[str, str | None]] = []
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
                raw_etag = obj.get("ETag")
                etag = raw_etag.strip('"').lower() if isinstance(raw_etag, str) else None
                items.append((key, etag if etag and _SINGLE_PART_ETAG_RE.fullmatch(etag) else None))
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
        if not token:
            break
    return items


def _fetch_s3_object(client: Any, bucket: str, key: str, max_bytes: int) -> bytes:
    resp = client.get_object(Bucket=bucket, Key=key)
    body: bytes = resp["Body"].read(max_bytes + 1)
    if len(body) > max_bytes:
        raise RuntimeError(f"S3 object {key} exceeds {max_bytes} bytes")
    return body


def sync_down(
    client: Any,
    bucket: str,
    prefixes: Iterable[str],
    local_base: Path,
    *,
    max_bytes: int = MAX_BYTES,
    public: bool = False,
    exclude_prefixes: Iterable[str] = (),
    prior_state: SyncState | None = None,
) -> SyncState:
    state = SyncState()
    seen: set[str] = set()
    prefix_tuple = tuple(prefixes)
    exclude_tuple = tuple(exclude_prefixes)
    to_fetch: list[tuple[str, Path]] = []
    for prefix in prefix_tuple:
        for key, etag in _list_objects(client, bucket, prefix, max_bytes=max_bytes):
            if key in seen or any(key.startswith(ex) for ex in exclude_tuple):
                continue
            seen.add(key)
            if not _matches_prefix(key, prefix_tuple):
                raise ValueError("unsafe S3 key")
            _validate_key(key, local_base, public=public)
            dest = local_base / key
            prior_sha = prior_state.digests.get((bucket, key)) if prior_state is not None else None
            has_digest = etag is not None or prior_sha is not None
            if has_digest and dest.is_file() and not dest.is_symlink():
                local_size = dest.stat().st_size
                if local_size <= max_bytes:
                    local_body = dest.read_bytes()
                    local_sha = hashlib.sha256(local_body).hexdigest()
                    etag_matches = (
                        etag is not None and hashlib.md5(local_body).hexdigest() == etag  # noqa: S324
                    )
                    sha_matches = etag is None and prior_sha is not None and local_sha == prior_sha
                    if etag_matches or sha_matches:
                        state.digests[(bucket, key)] = local_sha
                        state.remote_keys.add((bucket, key))
                        continue
            to_fetch.append((key, dest))
    if len(to_fetch) == 1:
        key, dest = to_fetch[0]
        body = _fetch_s3_object(client, bucket, key, max_bytes)
        files.write_bytes_atomic(body, dest)
        state.digests[(bucket, key)] = hashlib.sha256(body).hexdigest()
        state.remote_keys.add((bucket, key))
    elif len(to_fetch) > 1:

        def _download_and_write(item: tuple[str, Path]) -> tuple[str, str]:
            key, dest = item
            body = _fetch_s3_object(client, bucket, key, max_bytes)
            files.write_bytes_atomic(body, dest)
            return key, hashlib.sha256(body).hexdigest()

        with ThreadPoolExecutor(max_workers=min(SYNC_THREADS, len(to_fetch))) as pool:
            for key, digest in pool.map(_download_and_write, to_fetch):
                state.digests[(bucket, key)] = digest
                state.remote_keys.add((bucket, key))
    return state


def _matches_prefix(key: str, prefixes: tuple[str, ...]) -> bool:
    return any(prefix == "" or key.startswith(prefix) for prefix in prefixes)


def _is_reparse(path: Path) -> bool:
    return path.is_symlink() or path.is_junction()


def _has_symlink_ancestor(path: Path, stop: Path, stop_resolved: Path) -> bool:
    cur = path
    while cur != stop:
        if _is_reparse(cur):
            return True
        if cur.resolve() == stop_resolved or cur.parent == cur:
            return False
        cur = cur.parent
    return False


def _collect_local_keys(
    local_base: Path,
    prefixes: tuple[str, ...],
    exclude_prefixes: tuple[str, ...],
) -> list[str]:
    if not local_base.exists() or not prefixes:
        return []
    base_resolved = local_base.resolve()
    seen: set[str] = set()
    keys: list[str] = []

    def _add_candidate(path: Path) -> None:
        if _is_reparse(path) or not path.is_file():
            return
        if not path.resolve().is_relative_to(base_resolved):
            return
        if _has_symlink_ancestor(path, local_base, base_resolved):
            return
        if path.suffix in (".lock", ".tmp"):
            return
        rel = path.relative_to(local_base).as_posix()
        if rel in seen or not _matches_prefix(rel, prefixes):
            return
        if any(rel.startswith(ex) for ex in exclude_prefixes):
            return
        seen.add(rel)
        keys.append(rel)

    if "" in prefixes:
        for path in local_base.rglob("*"):
            _add_candidate(path)
        return sorted(keys)

    for prefix in prefixes:
        if prefix.startswith("/") or "\\" in prefix or ":" in prefix:
            continue
        dir_part, sep, name_prefix = prefix.rpartition("/")
        if sep and (not dir_part or any(seg in ("", ".", "..") for seg in dir_part.split("/"))):
            continue
        if name_prefix == "..":
            continue
        sub_dir = local_base.joinpath(*dir_part.split("/")) if dir_part else local_base
        if (
            not sub_dir.exists()
            or not sub_dir.resolve().is_relative_to(base_resolved)
            or _has_symlink_ancestor(sub_dir, local_base, base_resolved)
            or not sub_dir.is_dir()
        ):
            continue
        if not name_prefix:
            for path in sub_dir.rglob("*"):
                _add_candidate(path)
        else:
            for entry in sorted(sub_dir.iterdir(), key=lambda p: p.name):
                if not entry.name.startswith(name_prefix) or _is_reparse(entry):
                    continue
                if entry.is_file():
                    _add_candidate(entry)
                elif entry.is_dir() and entry.resolve().is_relative_to(base_resolved):
                    for path in entry.rglob("*"):
                        _add_candidate(path)
    return sorted(keys)


def _key_rank(key: str, *, public: bool) -> int:
    if not public or key.startswith("storms/"):
        return 0
    return 1 if key.startswith(LIVE_PREFIX) and key != LIVE_INDEX else 2


def _order_keys(keys: list[str], *, public: bool) -> list[str]:
    if not public:
        return sorted(keys)
    # Per-date files under storms/ and the live layers upload before the index files
    # (storms.json, pipeline.json, live/now.json) that name them
    return sorted(keys, key=lambda k: (_key_rank(k, public=True), k))


def _public_headers(key: str) -> dict[str, str]:
    content_type = "application/geo+json" if key.endswith(".geojson") else "application/json"
    return {
        "CacheControl": "max-age=60",
        "ContentType": content_type,
    }


def _sha256_file(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


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
        if (local_base / key).stat().st_size > MAX_BYTES:
            raise RuntimeError(f"local file {key} exceeds {MAX_BYTES} bytes")

    tiers: dict[int, list[str]] = {0: [], 1: [], 2: []}
    for key in local_keys:
        digest = _sha256_file(local_base / key)
        if state.digests.get((bucket, key)) == digest:
            continue
        tiers[_key_rank(key, public=public)].append(key)

    def _upload_key(key: str) -> tuple[str, str]:
        body = (local_base / key).read_bytes()
        if len(body) > MAX_BYTES:
            raise RuntimeError(f"local file {key} exceeds {MAX_BYTES} bytes")
        digest = hashlib.sha256(body).hexdigest()
        extra = _public_headers(key) if public else {}
        client.put_object(Bucket=bucket, Key=key, Body=body, **extra)
        return key, digest

    for rank in (0, 1, 2):
        tier = tiers[rank]
        if not tier:
            continue
        if rank == 0 and len(tier) > 1:
            pool = ThreadPoolExecutor(max_workers=min(SYNC_THREADS, len(tier)))
            try:
                futures = [pool.submit(_upload_key, key) for key in tier]
                completed = [fut.result() for fut in futures]
            except BaseException:
                pool.shutdown(wait=True, cancel_futures=True)
                raise
            else:
                pool.shutdown(wait=True)
        else:
            completed = [_upload_key(key) for key in tier]
        for key, digest in completed:
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


def _root_paths(root: Path) -> dict[str, Path]:
    return paths.root_paths(root)


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

    rp = _root_paths(root)
    cand_path = rp["candidates"]
    swaths_dir = rp["swaths"]
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
        gdb_dir = rp["parcels_gdb"]
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

    if run_cli(["score"]) != 0:
        _log("score failed; publish goes on")

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

    eaglei_dir = _root_paths(root)["eaglei"]
    missing_years = [
        str(y) for y in BACKFILL_EAGLEI_YEARS if not (eaglei_dir / f"eaglei-{y}.parquet").exists()
    ]
    if missing_years and run_cli(["eaglei", *missing_years]) != 0:
        _log("eaglei failed; publish goes on")

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

    rp = _root_paths(root)
    patches: list[tuple[Any, str, Any]] = [
        (paths, "ROOT", rp["root"]),
        (paths, "RAW_DIR", rp["raw"]),
        (paths, "DERIVED_DIR", rp["derived"]),
        (paths, "OUT_DIR", rp["out"]),
        (paths, "SITE_DATA_DIR", rp["site_data"]),
        (cli_mod, "RAW_DIR", rp["mesh_raw"]),
        (cli_mod, "DERIVED_DIR", rp["swaths"]),
        (cli_mod, "OUT_DIR", rp["out"]),
        (cli_mod, "PARCELS_GDB", rp["parcels_gdb"]),
        (cli_mod, "PARCELS_DIR", rp["parcels"]),
        (cli_mod, "SCORES_DIR", rp["scores"]),
        (cli_mod, "WARNINGS_DIR", rp["warnings"]),
        (cli_mod, "EAGLEI_DIR", rp["eaglei"]),
        (cli_mod, "POWER_DIR", rp["power"]),
        (cli_mod, "ODIN_DIR", rp["odin"]),
        (cli_mod, "INTERNET_DIR", rp["internet"]),
        (cli_mod, "SITE_DATA_DIR", rp["site_data"]),
        (archive, "INDEX_PATH", rp["archive_index"]),
        (candidates, "WCM_PATH", rp["wcm"]),
        (candidates, "CANDIDATES_PATH", rp["candidates"]),
        (candidates, "DAILY_DIR", rp["daily"]),
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
        state = sync_down(s3, config.state_bucket, (odin_key, next_day_key), data_dir)
        rc = odin_run(runner)
        if rc != 0:
            return rc
        post_slot = odin.slot_of(datetime.now(UTC) if now is None else pre_now)
        post_key = f"{ODIN_PREFIX}{odin.file_name(post_slot.date())}"
        # only the keys of this run: a stale local ODIN file never overwrites the bucket
        odin_keys = tuple(dict.fromkeys([odin_key, post_key, next_day_key]))
        sync_up(s3, config.state_bucket, odin_keys, data_dir, state)
        return 0

    if task == "live":
        # only live/ moves: the storm data and the state bucket stay untouched
        live_state = sync_down(s3, config.public_bucket, (LIVE_PREFIX,), site_dir, public=True)
        rc = runner(["live"])
        if rc != 0:
            return rc
        sync_up(s3, config.public_bucket, (LIVE_PREFIX,), site_dir, live_state, public=True)
        return 0

    if task not in ("nightly", "backfill"):
        raise ValueError(f"unknown cloud task: {task}")

    state = sync_down(s3, config.state_bucket, STATE_PREFIXES, data_dir)
    pub_state = sync_down(
        s3,
        config.public_bucket,
        PUBLIC_PREFIXES,
        site_dir,
        public=True,
        exclude_prefixes=(LIVE_PREFIX,),
    )

    rc = (
        nightly(runner, resolved_root, env)
        if task == "nightly"
        else backfill(runner, resolved_root, env)
    )
    # a partial publish still uploads the dates it built, then returns its exit code
    if rc not in (0, publish_run.PARTIAL_EXIT):
        return rc

    # a long run outlives the session token, so a client of our own is built again for upload
    if client is None:
        s3 = s3_client(config)
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
        exclude_prefixes=(LIVE_PREFIX,),
    )
    return rc
