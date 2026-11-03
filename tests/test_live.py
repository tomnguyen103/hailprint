"""The live view: newest MESH keys, the live swath, the live files, and `hailprint live`."""

import gzip
import json
from datetime import UTC, datetime
from pathlib import Path

import eccodes
import numpy as np
import pytest

from hailprint import __main__ as cli
from hailprint import county, live, mesh, publish, swath
from tests.conftest import RAW_12Z, RAW_DIR, STORM_DATE, needs_raw_mesh

DAY = "CONUS/MESH_Max_1440min_00.50"
HOUR = "CONUS/MESH_Max_60min_00.50"
NOW = datetime(2026, 11, 3, 14, 0, tzinfo=UTC)
NI, NJ = 140, 100
FIXTURES = Path(__file__).parent / "fixtures"


def _key(prefix: str, stamp: str) -> str:
    product = prefix.split("/")[1]
    return f"{prefix}/{stamp[:8]}/MRMS_{product}_{stamp}.grib2.gz"


def grib(values: np.ndarray) -> bytes:
    """A gzip GRIB2 message on the 0.01 degree MRMS grid around the Harris bbox."""
    min_lon, _, _, max_lat = county.bbox()
    lon0, lat0 = round(min_lon - 0.1, 2), round(max_lat + 0.1, 2)
    handle = eccodes.codes_grib_new_from_samples("regular_ll_sfc_grib2")
    try:
        for key, value in (
            ("Ni", NI),
            ("Nj", NJ),
            ("longitudeOfFirstGridPointInDegrees", lon0 % 360),
            ("latitudeOfFirstGridPointInDegrees", lat0),
            ("longitudeOfLastGridPointInDegrees", (lon0 + 0.01 * (NI - 1)) % 360),
            ("latitudeOfLastGridPointInDegrees", lat0 - 0.01 * (NJ - 1)),
            ("iDirectionIncrementInDegrees", 0.01),
            ("jDirectionIncrementInDegrees", 0.01),
            ("jScansPositively", 0),
            ("bitsPerValue", 16),
        ):
            eccodes.codes_set(handle, key, value)
        eccodes.codes_set_values(handle, values.ravel().astype(float))
        return gzip.compress(eccodes.codes_get_message(handle))
    finally:
        eccodes.codes_release(handle)


def field(peak: float, background: float = 0.0) -> np.ndarray:
    """A grid of `background` with one 10 x 20 cell block at `peak` inside the county."""
    values = np.full((NJ, NI), background)
    values[45:55, 60:80] = peak
    return values


class FakeMrms:
    """The noaa-mrms-pds boundary: a key listing and download_file from bytes in memory."""

    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.downloaded: list[str] = []

    def list_objects_v2(self, *, Bucket, Prefix="", ContinuationToken=None):
        assert Bucket == mesh.BUCKET
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        return {"Contents": [{"Key": k, "Size": len(self.objects[k])} for k in keys]}

    def download_file(self, Bucket, Key, Filename):
        assert Bucket == mesh.BUCKET
        self.downloaded.append(Key)
        Path(Filename).write_bytes(self.objects[Key])


def mrms(day_peak: float = 30.0, hour_peak: float = 20.0) -> FakeMrms:
    return FakeMrms(
        {
            _key(DAY, "20261103-130000"): grib(field(5.0)),
            _key(DAY, "20261103-133000"): grib(field(day_peak)),
            _key(HOUR, "20261103-135600"): grib(field(1.0)),
            _key(HOUR, "20261103-135800"): grib(field(hour_peak)),
        }
    )


def read(out: Path, name: str) -> dict:
    return json.loads((out / name).read_text(encoding="utf-8"))


SPC_HEADER = "Time,Size,Location,County,State,Lat,Lon,Comments\n"
EMPTY_SBW = '{"type": "FeatureCollection", "features": []}'
ODIN_GROUPED = (FIXTURES / "odin_grouped.json").read_text(encoding="utf-8")
# SPC answers with a header and no row, IEM with no feature, ODIN with the grouped fixture
QUIET = live.Fetchers(
    spc_today=lambda: SPC_HEADER,
    spc_yesterday=lambda: SPC_HEADER,
    warnings=lambda start, end: EMPTY_SBW,
    odin=lambda: ODIN_GROUPED,
)


def test_build_writes_four_valid_files(tmp_path):
    written = live.write(live.build(NOW, mrms(), QUIET), tmp_path)

    assert [p.name for p in written] == [
        "swath.geojson",
        "reports.geojson",
        "warnings.geojson",
        "now.json",
    ]
    for name, kind in live.KINDS.items():
        publish.validate(read(tmp_path, name), kind)
    now = read(tmp_path, "now.json")
    assert now["window"] == {"start": "2026-11-02T13:30:00Z", "end": "2026-11-03T13:30:00Z"}
    assert now["run_time"] == "2026-11-03T14:00:00Z"
    assert now["mesh"] == {
        "key": _key(DAY, "20261103-133000"),
        "valid_time": "2026-11-03T13:30:00Z",
        "max_mesh_mm": 30.0,
        "class_count": 2,
    }
    assert now["last_hour"] == {
        "key": _key(HOUR, "20261103-135800"),
        "valid_time": "2026-11-03T13:58:00Z",
        "max_mesh_mm": 20.0,
    }
    assert now["files"] == {
        "swath": "swath.geojson",
        "reports": "reports.geojson",
        "warnings": "warnings.geojson",
    }
    swath_doc = read(tmp_path, "swath.geojson")
    # 30 mm reaches the 19.05 and 25.4 mm classes and stays under 31.75 mm: two classes
    assert [f["properties"]["threshold_mm"] for f in swath_doc["features"]] == [19.05, 25.4]
    # the SPC convective day that holds the window end: 2026-11-03 13:30 - 12 h
    assert swath_doc["receipt"]["storm_date"] == "2026-11-03"


def test_empty_swath(tmp_path):
    live.write(live.build(NOW, mrms(day_peak=19.0), QUIET), tmp_path)

    assert read(tmp_path, "swath.geojson")["features"] == []
    now = read(tmp_path, "now.json")
    assert now["mesh"]["class_count"] == 0
    assert now["mesh"]["max_mesh_mm"] == 19.0


def test_every_class_nests(tmp_path):
    live.write(live.build(NOW, mrms(day_peak=70.0), QUIET), tmp_path)

    features = read(tmp_path, "swath.geojson")["features"]
    assert [f["properties"]["threshold_mm"] for f in features] == list(swath.SIZE_CLASSES_MM)
    assert read(tmp_path, "now.json")["mesh"]["class_count"] == 7


def test_newest_key_previous_day():
    client = FakeMrms(
        {
            _key(DAY, "20261102-233000"): b"",
            _key(DAY, "20261102-230000"): b"",
            _key(DAY, "20261101-233000"): b"",
        }
    )
    just_after_midnight = datetime(2026, 11, 3, 0, 5, tzinfo=UTC)

    assert live.newest_key(client, mesh.PRODUCT, just_after_midnight) == _key(
        DAY, "20261102-233000"
    )


def test_rerun_identical_layers(tmp_path):
    first, second = tmp_path / "a", tmp_path / "b"
    live.write(live.build(NOW, mrms(), QUIET), first)
    live.write(live.build(datetime(2026, 11, 3, 14, 5, tzinfo=UTC), mrms(), QUIET), second)

    for name in ("swath.geojson", "reports.geojson", "warnings.geojson"):
        assert (first / name).read_bytes() == (second / name).read_bytes()
    a, b = read(first, "now.json"), read(second, "now.json")
    assert a.pop("run_time") != b.pop("run_time")
    for doc in (a, b):
        for source in doc["sources"]:
            source.pop("fetched_at")
    assert a == b


def test_mesh_failure_writes_nothing(tmp_path):
    out = tmp_path / "live"
    out.mkdir()
    (out / "now.json").write_text("old", encoding="utf-8")
    empty = FakeMrms({_key(DAY, "20261031-133000"): b""})
    corrupt = mrms()
    corrupt.objects[_key(DAY, "20261103-133000")] = b"not a gzip stream"

    for client in (empty, corrupt):
        with pytest.raises(RuntimeError):
            live.write(live.build(NOW, client, QUIET), out)

    assert [p.name for p in out.iterdir()] == ["now.json"]
    assert (out / "now.json").read_text(encoding="utf-8") == "old"


def test_cli_live_exit_1_on_mesh_failure_keeps_old_files(tmp_path, monkeypatch, capsys):
    (tmp_path / "live").mkdir()
    (tmp_path / "live" / "now.json").write_text("old", encoding="utf-8")
    monkeypatch.setattr(cli, "SITE_DATA_DIR", tmp_path)
    monkeypatch.setattr(cli, "_utc_now", lambda: NOW)
    monkeypatch.setattr(live, "Fetchers", lambda: QUIET)
    monkeypatch.setattr(mesh, "s3_client", lambda: FakeMrms({}))

    assert cli.main(["live"]) == 1

    assert "no MESH_Max_1440min_00.50 key" in capsys.readouterr().err
    assert (tmp_path / "live" / "now.json").read_text(encoding="utf-8") == "old"


def test_cli_live_writes_and_prints_the_window(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "SITE_DATA_DIR", tmp_path)
    monkeypatch.setattr(cli, "_utc_now", lambda: NOW)
    monkeypatch.setattr(live, "Fetchers", lambda: QUIET)
    monkeypatch.setattr(mesh, "s3_client", lambda: mrms())

    assert cli.main(["live"]) == 0

    out = capsys.readouterr().out
    assert "2026-11-02T13:30:00Z to 2026-11-03T13:30:00Z" in out
    assert "max 30.0 mm" in out
    assert sorted(p.name for p in (tmp_path / "live").iterdir()) == [
        "now.json",
        "reports.geojson",
        "swath.geojson",
        "warnings.geojson",
    ]


def test_valid_time_reads_the_key_stamp():
    assert live.valid_time(mesh.key_for(STORM_DATE)) == datetime(2024, 5, 29, 12, tzinfo=UTC)


@needs_raw_mesh
def test_live_swath_matches_archive():
    key = mesh.key_for(STORM_DATE)
    end = live.valid_time(key)
    storm_date = live.storm_date_of(end)
    assert storm_date == STORM_DATE

    got, max_mm = live.build_swath(RAW_12Z, storm_date)
    daily = mesh.daily_max(STORM_DATE, RAW_DIR)
    want = swath.build_swaths(daily, STORM_DATE)

    assert got["threshold_mm"].tolist() == want["threshold_mm"].tolist()
    for a, b in zip(got.geometry, want.geometry, strict=True):
        assert a.equals(b)
    # the archived 2024-05-28 swath file records 52.8 mm as its largest cell
    assert max_mm == 52.8 == round(float(daily.max()), 2)


# --- ticket 02: windowed SPC reports, HGX warnings, ODIN power, per-source status ---

START = datetime(2026, 11, 2, 13, 30, tzinfo=UTC)
YESTERDAY_CSV = SPC_HEADER + (
    "1329,100,Houston,Harris,TX,29.76,-95.37,one minute before the window\n"
    "1330,100,Houston,Harris,TX,29.76,-95.37,at the window start\n"
    "2200,175,Katy,Harris,TX,29.79,-95.82,inside\n"
    "0100,100,Dallas,Dallas,TX,32.78,-96.80,outside the 50 km buffer\n"
)
TODAY_CSV = SPC_HEADER + (
    "1330,100,Pasadena,Harris,TX,29.69,-95.21,at the window end\n"
    "1331,100,Houston,Harris,TX,29.76,-95.37,one minute after the window\n"
)
HOUSTON = [[[-95.41, 29.81], [-95.37, 29.81], [-95.37, 29.85], [-95.41, 29.85], [-95.41, 29.81]]]


def warning(eventid: int, kind: str, begin: str, end: str, geometry: dict | None = None) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "phenomena": kind,
            "significance": "W",
            "event_label": f"{kind} Warning",
            "eventid": eventid,
            "utc_polygon_begin": begin,
            "utc_polygon_end": end,
            "product_id": f"202611{eventid:03d}-KHGX",
        },
        "geometry": geometry or {"type": "Polygon", "coordinates": HOUSTON},
    }


SBW = json.dumps(
    {
        "type": "FeatureCollection",
        "features": [
            warning(1, "SV", "2026-11-03T13:40:00Z", "2026-11-03T14:30:00Z"),
            warning(2, "TO", "2026-11-02T20:00:00Z", "2026-11-02T20:45:00Z"),
            warning(3, "SV", "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z"),
            warning(4, "FF", "2026-11-03T14:10:00Z", "2026-11-03T15:00:00Z"),
        ],
    }
)


def busy(**overrides) -> live.Fetchers:
    fields = {
        "spc_today": lambda: TODAY_CSV,
        "spc_yesterday": lambda: YESTERDAY_CSV,
        "warnings": lambda start, end: SBW,
        "odin": lambda: ODIN_GROUPED,
    }
    return live.Fetchers(**{**fields, **overrides})


def test_sources_fill_the_layers(tmp_path):
    asked = []

    def warnings(start, end):
        asked.append((start, end))
        return SBW

    live.write(live.build(NOW, mrms(), busy(warnings=warnings)), tmp_path)

    for name, kind in live.KINDS.items():
        publish.validate(read(tmp_path, name), kind)
    # IEM gets the window start and the run time
    assert asked == [(START, NOW)]
    now = read(tmp_path, "now.json")
    assert now["reports"] == {"count": 3, "max_size_in": 1.75}
    # eventid 1 ends after the run time; 3 ends before the start, 4 begins after the run time
    assert now["warnings"] == {"count": 2, "active": 1}
    events = [f["properties"]["eventid"] for f in read(tmp_path, "warnings.geojson")["features"]]
    assert events == [2, 1]
    # tests/fixtures/odin_grouped.json: 13 + 1 + 1 + 3 + 714 + 1 + 2 customers out
    assert now["power"]["customers_out"] == 735
    harris = next(c for c in now["power"]["counties"] if c["fips"] == "48201")
    # 714 of the 1 827 686 MCC customers of Harris
    assert harris == {"fips": "48201", "name": "Harris", "customers_out": 714, "share_out": 0.0004}
    liberty = next(c for c in now["power"]["counties"] if c["fips"] == "48291")
    assert liberty["customers_out"] == 0 and liberty["share_out"] == 0
    assert len(now["power"]["counties"]) == 8
    assert [(s["source"], s["ok"]) for s in now["sources"]] == [
        ("noaa-mrms-pds", True),
        ("noaa-mrms-pds", True),
        ("spc-daily", True),
        ("iem", True),
        ("odin", True),
    ]
    odin_row = now["sources"][4]
    assert odin_row["valid_time"] == "2026-11-03T14:00:00Z"


def test_window_closed_interval(tmp_path):
    live.write(live.build(NOW, mrms(), busy()), tmp_path)

    features = read(tmp_path, "reports.geojson")["features"]
    assert [(f["properties"]["time"], f["properties"]["location"]) for f in features] == [
        ("1330", "Houston"),
        ("2200", "Katy"),
        ("1330", "Pasadena"),
    ]
    assert [f["properties"]["id"] for f in features] == [0, 1, 2]


def _bad_odin() -> str:
    return json.dumps(
        {
            "total_count": 1,
            "results": [
                {"communitydescriptor": "48201", "name": "CENTERPOINT", "customers_out": -5}
            ],
        }
    )


def _drop(*args):
    raise OSError("connection reset by peer")


def _long(*args):
    raise RuntimeError("x" * 500)


BAD_POINT = warning(9, "SV", "2026-11-03T13:40:00Z", "2026-11-03T14:30:00Z", {"type": "Point"})


@pytest.mark.parametrize(
    ("overrides", "failed", "text"),
    [
        (
            {"spc_today": lambda: TODAY_CSV + "1340,abc,Houston,Harris,TX,29.7,-95.3,x\n"},
            "spc-daily",
            "malformed row",
        ),
        ({"spc_yesterday": _drop}, "spc-daily", "connection reset"),
        (
            {
                "warnings": lambda s, e: json.dumps(
                    {"type": "FeatureCollection", "features": [BAD_POINT]}
                )
            },
            "iem",
            "not a polygon",
        ),
        ({"odin": _bad_odin}, "odin", "customers_out"),
        ({"odin": _long}, "odin", "xxx"),
    ],
)
def test_optional_source_failure_keeps_others(tmp_path, overrides, failed, text):
    live.write(live.build(NOW, mrms(), busy(**overrides)), tmp_path)

    for name, kind in live.KINDS.items():
        publish.validate(read(tmp_path, name), kind)
    now = read(tmp_path, "now.json")
    rows = {s["source"]: s for s in now["sources"]}
    assert rows[failed]["ok"] is False
    assert text in rows[failed]["message"]
    assert len(rows[failed]["message"]) <= 200
    assert all(s["ok"] for s in now["sources"] if s["source"] != failed)
    if failed == "spc-daily":
        assert read(tmp_path, "reports.geojson")["features"] == []
        assert now["reports"] == {"count": 0, "max_size_in": None}
        assert now["warnings"]["count"] == 2
    elif failed == "iem":
        assert read(tmp_path, "warnings.geojson")["features"] == []
        assert now["warnings"] == {"count": 0, "active": 0}
        assert now["reports"]["count"] == 3
    else:
        assert now["power"] is None
        assert now["reports"]["count"] == 3
