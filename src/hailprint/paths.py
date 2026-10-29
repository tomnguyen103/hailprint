"""Repo root and the data folders. Every other module takes its paths from here."""

import os
from collections.abc import Mapping
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]


def resolve_root(env: Mapping[str, str] = os.environ) -> Path:
    raw = env.get("HAILPRINT_ROOT", "")
    return Path(raw).resolve() if raw else _REPO_ROOT


ROOT = resolve_root()
RAW_DIR = ROOT / "data" / "raw"
DERIVED_DIR = ROOT / "data" / "derived"
OUT_DIR = ROOT / "out"
SITE_DATA_DIR = ROOT / "site" / "data"
