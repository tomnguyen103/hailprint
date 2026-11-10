"""Atomic frame writes: a .tmp sibling, then one rename over the target."""

import ctypes
import io
import os
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

STALE_LOCK_S = 3600.0
SOURCE = "noaa-mrms-pds"
PRODUCT = "MESH_Max_1440min_00.50"
CONFIDENCE = (
    "radar-estimated hail size; literature skill HSS about 0.38 at 30 mm "
    "against dense ground truth (Ortega 2018)"
)
METADATA = {"source": SOURCE, "product": PRODUCT, "confidence": CONFIDENCE}
FORBIDDEN_WORD = "damage"
OWNER_FIELDS: tuple[str, ...] = (
    "CurrOwner",
    "mail_addr_1",
    "mail_addr_2",
    "mail_city",
    "mail_state",
    "mail_zip",
    "LocAddr",
    "LocNum",
    "LocName",
)


@contextmanager
def _atomic(path: Path) -> Iterator[Path]:
    """Yield a per-process .tmp sibling; rename it over the path on success, drop it on failure."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # the pid keeps two concurrent runs (cron and a manual run) off one .tmp file
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        yield tmp
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


_WIN32_PROCS: tuple[object, object, object] | None = None


def _win32_procs() -> tuple[object, object, object]:
    """Return cached `(OpenProcess, GetExitCodeProcess, CloseHandle)` ctypes callables."""
    global _WIN32_PROCS  # noqa: PLW0603
    if _WIN32_PROCS is None:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined]
        open_proc = kernel32.OpenProcess
        open_proc.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        open_proc.restype = ctypes.c_void_p
        get_exit = kernel32.GetExitCodeProcess
        get_exit.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        get_exit.restype = ctypes.c_int
        close_handle = kernel32.CloseHandle
        close_handle.argtypes = [ctypes.c_void_p]
        close_handle.restype = ctypes.c_int
        _WIN32_PROCS = (open_proc, get_exit, close_handle)
    return _WIN32_PROCS


def _pid_alive(pid: int) -> bool:
    """Return True when `pid` refers to a running operating-system process."""
    if pid <= 0:
        return False
    if pid == os.getpid() or (os.name != "nt" and pid == 1):
        return True
    if os.name == "nt":
        open_proc, get_exit, close_handle = _win32_procs()
        handle = open_proc(0x1000, 0, pid)  # type: ignore[operator]
        if not handle:
            return bool(ctypes.get_last_error() == 5)  # type: ignore[attr-defined]
        try:
            code = ctypes.c_ulong()
            if not get_exit(handle, ctypes.byref(code)):  # type: ignore[operator]
                return True
            return bool(code.value == 259)
        finally:
            close_handle(handle)  # type: ignore[operator]
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _is_stale_lock(path: Path) -> bool:
    """Return True when `path` is older than STALE_LOCK_S or holds a dead process PID."""
    try:
        raw = path.read_text(encoding="utf-8").strip()
        stat = path.stat()
    except OSError:
        return False
    if (time.time() - stat.st_mtime) > STALE_LOCK_S:
        return True
    if raw == "1":
        return False
    if raw.isdigit():
        return not _pid_alive(int(raw))
    return False


def _evict_stale_lock(path: Path) -> bool:
    """Atomically claim and remove a stale lock at `path`; return True if evicted."""
    if not _is_stale_lock(path):
        return False
    claim = path.with_name(f".{path.name}.stale.{os.getpid()}.{time.time_ns()}")
    try:
        os.replace(path, claim)
    except OSError:
        return False
    if not _is_stale_lock(claim):
        try:
            os.link(claim, path)
        except FileExistsError:
            pass
        except OSError:
            try:
                data = claim.read_bytes()
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                try:
                    os.write(fd, data)
                finally:
                    os.close(fd)
            except OSError:
                pass
        finally:
            claim.unlink(missing_ok=True)
        return False
    claim.unlink(missing_ok=True)
    return True


@contextmanager
def lock(path: Path) -> Iterator[None]:
    """Hold one run lock; a second run stops instead of a silent last-write-wins merge.

    The lock file holds the pid of the run. A stale lock from a dead pid is evicted once;
    an active lock raises RuntimeError and leaves the file in place.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        if _evict_stale_lock(path):
            try:
                fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError:
                raise RuntimeError(
                    f"{path} exists: another run holds it, or delete it after a crash"
                ) from None
        else:
            raise RuntimeError(
                f"{path} exists: another run holds it, or delete it after a crash"
            ) from None
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def write_bytes_atomic(data: bytes, path: Path) -> Path:
    """Write raw bytes through a .tmp sibling; a failed write leaves the old target intact."""
    path = Path(path)
    with _atomic(path) as tmp:
        tmp.write_bytes(data)
    return path


def write_text_atomic(text: str, path: Path) -> Path:
    """Write UTF-8 text through a .tmp sibling; a failed write leaves the old target intact."""
    return write_bytes_atomic(text.encode("utf-8"), path)


def write_atomic(frame: pd.DataFrame, path: Path, metadata: dict[str, str] | None = None) -> Path:
    """Write to a per-process .tmp sibling, then rename over the target.

    CSV by suffix, else Parquet (GeoParquet for a GeoDataFrame) with the source, product, and
    confidence metadata. The optional metadata adds keys or overrides these defaults.
    A metadata key or value or frame column that holds the forbidden word or an owner field
    raises ValueError before any write.
    A failed write removes the .tmp file and leaves the old target intact.
    """
    path = Path(path)
    merged = {**METADATA, **(metadata or {})}
    for text in [*merged, *merged.values()]:
        lowered = text.lower()
        if FORBIDDEN_WORD in lowered:
            raise ValueError(f"forbidden word in metadata: {text!r}")
        for field in OWNER_FIELDS:
            if field.lower() in lowered:
                raise ValueError(f"owner field {field!r} in {text!r}")
    for col in (str(c) for c in frame.columns):
        lowered = col.lower()
        if FORBIDDEN_WORD in lowered:
            raise ValueError(f"forbidden word in column: {col!r}")
        for field in OWNER_FIELDS:
            if field.lower() in lowered:
                raise ValueError(f"owner field {field!r} in {col!r}")
    for col_name in frame.select_dtypes(include=["object", "string"]).columns:
        for cell in frame[col_name].dropna():
            if not isinstance(cell, str):
                continue
            lowered = cell.lower()
            if FORBIDDEN_WORD in lowered:
                raise ValueError(f"forbidden word in cell of {col_name!r}: {cell!r}")
            for field in OWNER_FIELDS:
                if field.lower() in lowered:
                    raise ValueError(f"owner field {field!r} in cell of {col_name!r}")
    with _atomic(path) as tmp:
        if path.suffix == ".csv":
            frame.to_csv(tmp, index=False)
        else:
            if isinstance(frame, gpd.GeoDataFrame):
                buf = io.BytesIO()
                frame.to_parquet(buf)
                buf.seek(0)
                table = pq.read_table(buf)
            else:
                table = pa.Table.from_pandas(frame, preserve_index=False)
            extra = {k.encode(): v.encode() for k, v in merged.items()}
            pq.write_table(table.replace_schema_metadata({**table.schema.metadata, **extra}), tmp)
    return path
