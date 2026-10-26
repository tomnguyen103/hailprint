import time
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyarrow.parquet as pq
import pytest
import shapely

import hailprint.__main__ as cli
from hailprint import swath
from hailprint.__main__ import main
from hailprint.parcels import (
    ALLOWED,
    COUNT_COLUMNS,
    OWNER_FIELDS,
    ZIP_COLUMNS,
    count_parcels,
    load_parcels,
)
from tests.conftest import HCAD_GDB, SWATHS_0528, needs_hcad

FIXTURE = Path(__file__).parent / "fixtures" / "parcels_sample.gpkg"
ALLOW_LIST = {"hcad_num", "low_parcel_id", "zip", "city", "yr_impr", "stated_area", "stacked"}


def test_load_keeps_only_the_allow_list_in_the_layer_crs():
    gdf = load_parcels(FIXTURE)
    assert set(gdf.columns) == ALLOW_LIST | {"geometry"}
    assert gdf.crs.to_epsg() == 2278
    assert len(gdf) == 5


def test_load_with_a_mask_reads_the_covered_parcels_only():
    parcels = load_parcels(FIXTURE).to_crs("EPSG:4326")
    mask = shapely.box(*parcels.iloc[:2].total_bounds)

    masked = load_parcels(FIXTURE, mask=mask)

    assert sorted(masked["hcad_num"]) == ["0000000000001", "0000000000002"]
    assert masked.crs.to_epsg() == 2278


def test_written_parquet_has_no_owner_field(tmp_path):
    path = tmp_path / "parcels.parquet"
    load_parcels(FIXTURE).to_parquet(path)

    schema = pq.read_schema(path)
    text = " ".join(schema.names + [v.decode(errors="ignore") for v in schema.metadata.values()])
    for field in OWNER_FIELDS:
        assert field not in text


def _swath_frame(geoms, thresholds=(19.05, 25.4)):
    inches = [t / 25.4 for t in thresholds]
    return gpd.GeoDataFrame(
        {
            "storm_date": ["2024-05-28"] * len(geoms),
            "threshold_mm": list(thresholds),
            "threshold_in": inches,
            "label": [f"radar-estimated hail size >= {i:.2f} in" for i in inches],
        },
        geometry=[shapely.MultiPolygon([g]) for g in geoms],
        crs="EPSG:4326",
    )


def _swaths(parcels):
    """Class 19.05 covers parcels 1 and 2; class 25.4 sits in the gap between them."""
    two = shapely.box(*parcels.iloc[:2].total_bounds)
    gap = shapely.box(-95.43130, 29.78440, -95.43120, 29.78450)
    return _swath_frame([two, gap])


def _parcels_4326():
    return load_parcels(FIXTURE).to_crs("EPSG:4326")


def test_count_parcels_two_in_class_19_and_zero_in_class_25():
    parcels = _parcels_4326()

    counts = count_parcels(_swaths(parcels), FIXTURE).classes

    assert list(counts.columns) == COUNT_COLUMNS
    assert counts["threshold_mm"].tolist() == [19.05, 25.4]
    assert counts["parcel_count"].tolist() == [2, 0]
    assert counts["storm_date"].tolist() == ["2024-05-28", "2024-05-28"]
    assert counts["label"].iloc[0] == "radar-estimated hail size >= 0.75 in"


def test_count_parcels_nested_classes_count_a_parcel_in_every_class_at_or_below_its_highest():
    parcels = _parcels_4326()
    outer = shapely.box(*parcels.iloc[:2].total_bounds)
    inner = shapely.box(*parcels.iloc[0].geometry.bounds)

    counts = count_parcels(_swath_frame([outer, inner]), FIXTURE).classes

    assert counts["parcel_count"].tolist() == [2, 1]


def test_count_parcels_rejects_a_higher_class_outside_the_lower_class():
    parcels = _parcels_4326()
    first = shapely.box(*parcels.iloc[0].geometry.bounds)
    last = shapely.box(*parcels.iloc[4].geometry.bounds)

    with pytest.raises(ValueError, match="25.4"):
        count_parcels(_swath_frame([first, last]), FIXTURE)


def test_count_parcels_counts_stacked_polygons_with_one_hcad_num_once(tmp_path):
    parcels = load_parcels(FIXTURE)
    stacked = pd.concat([parcels.iloc[[0]], parcels.iloc[[0]]], ignore_index=True)
    path = tmp_path / "stacked.gpkg"
    stacked.rename(columns={v: k for k, v in ALLOWED.items()}).to_file(
        path, layer="Parcels", driver="GPKG"
    )
    swaths = _swath_frame(
        [shapely.box(*parcels.to_crs("EPSG:4326").iloc[0].geometry.bounds)], thresholds=(19.05,)
    )

    counts = count_parcels(swaths, path).classes

    assert counts["parcel_count"].tolist() == [1]


def test_count_parcels_empty_swaths_gives_empty_frame():
    empty = gpd.GeoDataFrame(columns=swath.COLUMNS, geometry="geometry", crs="EPSG:4326")

    result = count_parcels(empty, Path("missing.gpkg"))

    assert len(result.classes) == 0
    assert list(result.classes.columns) == COUNT_COLUMNS
    assert len(result.zips) == 0
    assert list(result.zips.columns) == ZIP_COLUMNS


def _gpkg_with_zips(tmp_path, zips):
    """The sample parcels with the zip column replaced; returns the new gpkg path."""
    parcels = load_parcels(FIXTURE)
    parcels["zip"] = zips
    path = tmp_path / "zips.gpkg"
    parcels.rename(columns={v: k for k, v in ALLOWED.items()}).to_file(
        path, layer="Parcels", driver="GPKG"
    )
    return path


def _zip_rows(result):
    return {(row.zip, row.threshold_mm): row.parcel_count for row in result.zips.itertuples()}


def test_count_parcels_zip_counts_sum_to_the_class_counts_and_match_a_brute_force_count():
    parcels = _parcels_4326()
    outer = shapely.box(*parcels.iloc[:3].total_bounds)
    inner = shapely.box(*parcels.iloc[:2].total_bounds)
    swaths = _swath_frame([outer, inner])

    result = count_parcels(swaths, FIXTURE)

    native = load_parcels(FIXTURE)
    swaths_native = swaths.to_crs(native.crs)
    brute = {}
    for parcel in native.itertuples():
        for mm, geom in zip(swaths["threshold_mm"], swaths_native.geometry, strict=True):
            if parcel.geometry.intersects(geom):
                brute[(parcel.zip, mm)] = brute.get((parcel.zip, mm), 0) + 1
    assert _zip_rows(result) == brute == {("77001", 19.05): 3, ("77001", 25.4): 2}
    by_class = result.zips.groupby("threshold_mm")["parcel_count"].sum()
    assert by_class.tolist() == result.classes["parcel_count"].tolist() == [3, 2]
    assert list(result.zips.columns) == ZIP_COLUMNS


def test_count_parcels_zip_is_the_first_five_digits_and_else_unknown(tmp_path):
    path = _gpkg_with_zips(tmp_path, ["77002-1234", "77002", None, "0", "7700"])
    swaths = _swath_frame([shapely.box(*_parcels_4326().total_bounds)], thresholds=(19.05,))

    result = count_parcels(swaths, path)

    assert _zip_rows(result) == {("77002", 19.05): 2, ("unknown", 19.05): 3}
    assert result.classes["parcel_count"].tolist() == [5]


def test_count_parcels_a_parcel_in_two_classes_counts_once_in_each_class_and_zip(tmp_path):
    path = _gpkg_with_zips(tmp_path, ["77002"] * 5)
    parcels = _parcels_4326()
    outer = shapely.box(*parcels.iloc[:2].total_bounds)
    inner = shapely.box(*parcels.iloc[0].geometry.bounds)

    result = count_parcels(_swath_frame([outer, inner]), path)

    assert result.classes["parcel_count"].tolist() == [2, 1]
    assert _zip_rows(result) == {("77002", 19.05): 2, ("77002", 25.4): 1}


def test_parcels_command_without_swath_file_exits_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "DERIVED_DIR", tmp_path / "swaths")
    assert main(["parcels", "2024-05-28"]) == 1
    assert "hailprint ingest" in capsys.readouterr().err


def test_parcels_command_counts_the_fixture(tmp_path, monkeypatch, capsys):
    parcels = _parcels_4326()
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
    zip_table = pq.read_table(tmp_path / "parcels" / "zip-counts-2024-05-28.parquet")
    assert zip_table.schema.metadata[b"confidence"] == swath.CONFIDENCE.encode()
    assert zip_table.schema.metadata[b"source"] == b"noaa-mrms-pds"
    assert zip_table.to_pandas()[["zip", "threshold_mm", "parcel_count"]].values.tolist() == [
        ["77001", 19.05, 2]
    ]


@needs_hcad
def test_count_parcels_on_the_real_day_keeps_the_pre_change_counts_inside_the_time_budget():
    swaths = gpd.read_parquet(SWATHS_0528)

    started = time.perf_counter()
    counts = count_parcels(swaths, HCAD_GDB).classes
    elapsed = time.perf_counter() - started

    # counts measured with the pre-change per-class join on 2026-10-26
    assert counts["parcel_count"].tolist() == [361418, 217634, 120194, 59209, 23515, 1208]
    assert elapsed < 32, f"{elapsed:.1f} s"


def test_count_parcels_rejects_swaths_outside_epsg_4326():
    swaths = gpd.GeoDataFrame(
        {"threshold_mm": [19.05]},
        geometry=[shapely.box(0, 0, 1, 1)],
        crs="EPSG:2278",
    )

    with pytest.raises(ValueError, match="EPSG:4326"):
        count_parcels(swaths, FIXTURE)


def test_count_parcels_accepts_lon_lat_order_crs84_and_rejects_no_crs():
    box = shapely.box(0, 0, 1, 1)
    row = {
        "storm_date": [date(2024, 5, 28)],
        "threshold_mm": [19.05],
        "threshold_in": [0.75],
        "label": ["0.75 in"],
    }
    crs84 = gpd.GeoDataFrame(row, geometry=[box], crs="OGC:CRS84")
    bare = gpd.GeoDataFrame(row, geometry=[box])

    assert count_parcels(crs84, FIXTURE).classes["parcel_count"].tolist() == [0]
    with pytest.raises(ValueError, match="EPSG:4326"):
        count_parcels(bare, FIXTURE)
