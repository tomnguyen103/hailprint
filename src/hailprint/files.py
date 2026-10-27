"""Atomic frame writes: a .tmp sibling, then one rename over the target."""

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

SOURCE = "noaa-mrms-pds"
PRODUCT = "MESH_Max_1440min_00.50"
CONFIDENCE = (
    "radar-estimated hail size; literature skill HSS about 0.38 at 30 mm "
    "against dense ground truth (Ortega 2018)"
)
METADATA = {"source": SOURCE, "product": PRODUCT, "confidence": CONFIDENCE}
FORBIDDEN_WORD = "damage"


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


@contextmanager
def lock(path: Path) -> Iterator[None]:
    """Hold one run lock; a second run stops instead of a silent last-write-wins merge.

    The lock file holds the pid of the run. A run that finds the file stops with RuntimeError
    and leaves the file in place. The run that made the file removes it on exit.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise RuntimeError(
            f"{path} exists: another run holds it, or delete it after a crash"
        ) from None
    os.write(fd, str(os.getpid()).encode())
    os.close(fd)
    try:
        yield
    finally:
        path.unlink(missing_ok=True)


def write_text_atomic(text: str, path: Path) -> Path:
    """Write UTF-8 text through a .tmp sibling; a failed write leaves the old target intact."""
    path = Path(path)
    with _atomic(path) as tmp:
        tmp.write_bytes(text.encode("utf-8"))
    return path


def write_atomic(frame: pd.DataFrame, path: Path, metadata: dict[str, str] | None = None) -> Path:
    """Write to a per-process .tmp sibling, then rename over the target.

    CSV by suffix, else Parquet (GeoParquet for a GeoDataFrame) with the source, product, and
    confidence metadata. The optional metadata adds keys or overrides these defaults.
    A metadata key or value that holds the forbidden word raises ValueError before any write.
    A failed write removes the .tmp file and leaves the old target intact.
    """
    path = Path(path)
    merged = {**METADATA, **(metadata or {})}
    for text in [*merged, *merged.values()]:
        if FORBIDDEN_WORD in text.lower():
            raise ValueError(f"forbidden word in metadata: {text!r}")
    with _atomic(path) as tmp:
        if path.suffix == ".csv":
            frame.to_csv(tmp, index=False)
        else:
            if isinstance(frame, gpd.GeoDataFrame):
                frame.to_parquet(tmp)
                table = pq.read_table(tmp)
            else:
                table = pa.Table.from_pandas(frame, preserve_index=False)
            extra = {k.encode(): v.encode() for k, v in merged.items()}
            pq.write_table(table.replace_schema_metadata({**table.schema.metadata, **extra}), tmp)
    return path
