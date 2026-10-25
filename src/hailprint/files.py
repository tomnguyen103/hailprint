"""Atomic frame writes: a .tmp sibling, then one rename over the target."""

from pathlib import Path

import pandas as pd


def write_atomic(frame: pd.DataFrame, path: Path) -> Path:
    """Write to a .tmp sibling, then rename over the target. CSV by suffix, else Parquet."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    if path.suffix == ".csv":
        frame.to_csv(tmp, index=False)
    else:
        frame.to_parquet(tmp, index=False)
    tmp.replace(path)
    return path
