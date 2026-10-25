from pathlib import Path

import pyarrow.parquet as pq

from hailprint.parcels import OWNER_FIELDS, load_parcels

FIXTURE = Path(__file__).parent / "fixtures" / "parcels_sample.gpkg"
ALLOW_LIST = {"hcad_num", "low_parcel_id", "zip", "city", "yr_impr", "stated_area", "stacked"}


def test_load_keeps_only_the_allow_list_in_4326():
    gdf = load_parcels(FIXTURE)
    assert set(gdf.columns) == ALLOW_LIST | {"geometry"}
    assert gdf.crs.to_epsg() == 4326
    assert len(gdf) == 5


def test_written_parquet_has_no_owner_field(tmp_path):
    path = tmp_path / "parcels.parquet"
    load_parcels(FIXTURE).to_parquet(path)

    schema = pq.read_schema(path)
    text = " ".join(schema.names + [v.decode(errors="ignore") for v in schema.metadata.values()])
    for field in OWNER_FIELDS:
        assert field not in text
