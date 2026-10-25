from datetime import date
from pathlib import Path

import geopandas as gpd
import pyarrow.parquet as pq
import shapely

import hailprint.__main__ as cli
from hailprint import swath
from hailprint.__main__ import main
from hailprint.parcels import COUNT_COLUMNS, OWNER_FIELDS, count_parcels, load_parcels

FIXTURE = Path(__file__).parent / "fixtures" / "parcels_sample.gpkg"
ALLOW_LIST = {"hcad_num", "low_parcel_id", "zip", "city", "yr_impr", "stated_area", "stacked"}


def test_load_keeps_only_the_allow_list_in_4326():
    gdf = load_parcels(FIXTURE)
    assert set(gdf.columns) == ALLOW_LIST | {"geometry"}
    assert gdf.crs.to_epsg() == 4326
    assert len(gdf) == 5


def test_load_with_a_mask_reads_the_covered_parcels_only():
    parcels = load_parcels(FIXTURE)
    mask = shapely.box(*parcels.iloc[:2].total_bounds)

    masked = load_parcels(FIXTURE, mask=mask)

    assert sorted(masked["hcad_num"]) == ["0000000000001", "0000000000002"]
    assert masked.crs.to_epsg() == 4326


def test_written_parquet_has_no_owner_field(tmp_path):
    path = tmp_path / "parcels.parquet"
    load_parcels(FIXTURE).to_parquet(path)

    schema = pq.read_schema(path)
    text = " ".join(schema.names + [v.decode(errors="ignore") for v in schema.metadata.values()])
    for field in OWNER_FIELDS:
        assert field not in text


def _swaths(parcels):
    two = shapely.box(*parcels.iloc[:2].total_bounds)
    none = shapely.box(-95.0, 29.0, -94.99, 29.01)
    return gpd.GeoDataFrame(
        {
            "storm_date": ["2024-05-28", "2024-05-28"],
            "threshold_mm": [19.05, 25.4],
            "threshold_in": [0.75, 1.0],
            "label": [
                "radar-estimated hail size >= 0.75 in",
                "radar-estimated hail size >= 1.00 in",
            ],
        },
        geometry=[shapely.MultiPolygon([two]), shapely.MultiPolygon([none])],
        crs="EPSG:4326",
    )


def test_count_parcels_two_in_class_19_and_zero_in_class_25():
    parcels = load_parcels(FIXTURE)

    counts = count_parcels(_swaths(parcels), FIXTURE)

    assert list(counts.columns) == COUNT_COLUMNS
    assert counts["threshold_mm"].tolist() == [19.05, 25.4]
    assert counts["parcel_count"].tolist() == [2, 0]
    assert counts["storm_date"].tolist() == ["2024-05-28", "2024-05-28"]
    assert counts["label"].iloc[0] == "radar-estimated hail size >= 0.75 in"


def test_count_parcels_empty_swaths_gives_empty_frame():
    empty = gpd.GeoDataFrame(columns=swath.COLUMNS, geometry="geometry", crs="EPSG:4326")

    counts = count_parcels(empty, Path("missing.gpkg"))

    assert len(counts) == 0
    assert list(counts.columns) == COUNT_COLUMNS


def test_parcels_command_without_swath_file_exits_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "swaths")
    assert main(["parcels", "2024-05-28"]) == 1
    assert "hailprint ingest" in capsys.readouterr().err


def test_parcels_command_counts_the_fixture(tmp_path, monkeypatch, capsys):
    parcels = load_parcels(FIXTURE)
    swaths_dir = tmp_path / "swaths"
    swath.write_swaths(_swaths(parcels), swaths_dir / "swaths-2024-05-28.parquet", 1, 30.0)
    monkeypatch.setattr(cli, "DERIVED_DIR", swaths_dir)
    monkeypatch.setattr(cli, "PARCELS_GDB", FIXTURE)
    monkeypatch.setattr(cli, "PARCELS_DIR", tmp_path / "parcels")

    assert main(["parcels", "2024-05-28"]) == 0

    assert capsys.readouterr().out.splitlines() == [
        ">= 0.75 in: 2 parcels",
        ">= 1.00 in: 0 parcels",
        f"confidence: {swath.CONFIDENCE}",
    ]
    table = pq.read_table(tmp_path / "parcels" / "parcel-counts-2024-05-28.parquet")
    assert table.schema.metadata[b"confidence"] == swath.CONFIDENCE.encode()
    assert table.schema.metadata[b"source"] == b"noaa-mrms-pds"
    out = table.to_pandas()
    assert out["parcel_count"].tolist() == [2, 0]
    assert date.fromisoformat(out["storm_date"].iloc[0]) == date(2024, 5, 28)
