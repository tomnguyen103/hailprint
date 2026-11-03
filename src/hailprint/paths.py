"""Repo root and the data folders. Every other module takes its paths from here."""

import os
from collections.abc import Mapping
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]


def resolve_root(env: Mapping[str, str] = os.environ) -> Path:
    raw = env.get("HAILPRINT_ROOT", "")
    return Path(raw).resolve() if raw else _REPO_ROOT


def root_paths(root: Path) -> dict[str, Path]:
    raw = root / "data" / "raw"
    derived = root / "data" / "derived"
    return {
        "root": root,
        "raw": raw,
        "derived": derived,
        "out": root / "out",
        "site_data": root / "site" / "data",
        "mesh_raw": raw / "mesh",
        "swaths": derived / "swaths",
        "parcels_gdb": raw / "hcad" / "extracted" / "Parcels.gdb",
        "parcels": derived / "parcels",
        "scores": derived / "scores",
        "warnings": derived / "warnings",
        "eaglei": derived / "eaglei",
        "power": derived / "power",
        "odin": derived / "odin",
        "internet": derived / "internet",
        "archive_index": derived / "index" / "mesh-archive.parquet",
        "wcm": raw / "spc" / "1955-2025_hail.csv.zip",
        "candidates": derived / "index" / "candidate-days.csv",
        "daily": raw / "spc" / "daily",
    }


ROOT = resolve_root()
_ROOT_PATHS = root_paths(ROOT)
RAW_DIR = _ROOT_PATHS["raw"]
DERIVED_DIR = _ROOT_PATHS["derived"]
OUT_DIR = _ROOT_PATHS["out"]
SITE_DATA_DIR = _ROOT_PATHS["site_data"]
