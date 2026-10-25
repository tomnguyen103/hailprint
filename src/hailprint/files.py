"""Atomic frame writes: a .tmp sibling, then one rename over the target."""

from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from hailprint.swath import CONFIDENCE, PRODUCT, SOURCE

METADATA = {
    b"source": SOURCE.encode(),
    b"product": PRODUCT.encode(),
    b"confidence": CONFIDENCE.encode(),
}


def write_atomic(frame: pd.DataFrame, path: Path) -> Path:
    """Write to a .tmp sibling, then rename over the target.

    CSV by suffix, else Parquet with the source, product, and confidence metadata.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    if path.suffix == ".csv":
        frame.to_csv(tmp, index=False)
    else:
        table = pa.Table.from_pandas(frame, preserve_index=False)
        pq.write_table(table.replace_schema_metadata({**table.schema.metadata, **METADATA}), tmp)
    tmp.replace(path)
    return path
