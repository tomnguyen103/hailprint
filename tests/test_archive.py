from datetime import date

import pandas as pd
import pytest

from hailprint import archive
from hailprint.__main__ import main

PRODUCT = "CONUS/MESH_Max_1440min_00.50"
PREFIX = f"{PRODUCT}/"


def _key(folder, stamp):
    return f"{PRODUCT}/{folder}/MRMS_MESH_Max_1440min_00.50_{folder}-{stamp}.grib2.gz"


def _stamps(count):
    return [f"{h:02d}{m:02d}00" for h in range(24) for m in (0, 30)][:count]


class FakePaginator:
    def __init__(self, objects, page_size=1000):
        self.objects = objects
        self.page_size = page_size

    def paginate(self, Bucket, Prefix):
        assert Bucket == "noaa-mrms-pds"
        assert Prefix == PREFIX
        for start in range(0, len(self.objects), self.page_size):
            page = self.objects[start : start + self.page_size]
            yield {"Contents": [{"Key": k, "Size": s} for k, s in page]} if page else {}
        if not self.objects:
            yield {}


class FakeS3:
    def __init__(self, objects, page_size=1000):
        self.paginator = FakePaginator(objects, page_size)

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return self.paginator


def test_build_index_one_row_per_folder_day():
    objects = [(_key("20240529", s), 1000) for s in _stamps(48)]
    objects += [(_key("20240530", s), 10) for s in ("000000", "003000", "010000")]

    df = archive.build_index(client=FakeS3(objects))

    assert list(df.columns) == archive.COLUMNS
    assert df["storm_date"].tolist() == [date(2024, 5, 28), date(2024, 5, 29)]
    assert df["file_count"].tolist() == [48, 3]
    assert df["bytes"].tolist() == [48000, 30]
    assert df["has_12z"].tolist() == [True, False]


def test_build_index_counts_the_key_on_page_two():
    objects = [(_key("20240529", f"{i:06d}"), 1) for i in range(1000)]
    objects.append((_key("20240530", "120000"), 7))

    df = archive.build_index(client=FakeS3(objects, page_size=1000))

    assert df["file_count"].tolist() == [1000, 1]
    assert df["has_12z"].tolist() == [False, True]


def test_build_index_empty_listing_raises():
    with pytest.raises(RuntimeError, match=PREFIX):
        archive.build_index(client=FakeS3([]))


def test_write_index_replaces_the_old_file(tmp_path):
    path = tmp_path / "index" / "mesh-archive.parquet"
    old = pd.DataFrame(
        {"storm_date": [date(2020, 10, 13)], "file_count": [1], "bytes": [1], "has_12z": [False]}
    )
    new = pd.DataFrame(
        {
            "storm_date": [date(2020, 10, 13), date(2020, 10, 14)],
            "file_count": [48, 48],
            "bytes": [10, 20],
            "has_12z": [True, True],
        }
    )

    archive.write_index(old, path)
    archive.write_index(new, path)

    assert len(pd.read_parquet(path)) == 2
    assert not path.with_suffix(".parquet.tmp").exists()


def test_index_command_prints_counts(tmp_path, monkeypatch, capsys):
    objects = [(_key("20240529", s), 1) for s in _stamps(48)]
    objects += [(_key("20240530", "000000"), 1)]
    monkeypatch.setattr(archive, "_client", lambda: FakeS3(objects))
    monkeypatch.setattr(archive, "INDEX_PATH", tmp_path / "mesh-archive.parquet")

    assert main(["index"]) == 0

    lines = capsys.readouterr().out.splitlines()
    assert lines == [
        "archive days: 2",
        "first storm date: 2024-05-28",
        "last storm date: 2024-05-29",
        "days without 12Z file: 1",
    ]
    assert (tmp_path / "mesh-archive.parquet").exists()
