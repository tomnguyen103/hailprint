"""Repo root and the data folders. Every other module takes its paths from here."""

from pathlib import Path

# shortcut: ROOT assumes an editable install; upgrade to a --root option or an env var
# if hailprint ships as a wheel
ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
DERIVED_DIR = ROOT / "data" / "derived"
OUT_DIR = ROOT / "out"
SITE_DATA_DIR = ROOT / "site" / "data"
