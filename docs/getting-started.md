# Getting started

This guide sets up the pipeline and the site on one machine and runs one storm date end to end.

## Requirements

- Python 3.12 (`requires-python = ">=3.12,<3.13"` in `pyproject.toml`).
- [uv](https://docs.astral.sh/uv/) for the Python environment.
- Node.js and npm for the site under `site/`.
- `make` is optional. Each target in the `Makefile` is one command that you can run directly.

## Install

```bash
make setup                                  # uv sync
cd site && npm ci                           # site packages from the lockfile
```

## Data

Every data path hangs from the repo root (`src/hailprint/paths.py`), so a command writes under `data/` and `out/` from any working directory. `data/`, `out/`, and `site/data/` are gitignored.

| Data | Source | How it arrives |
|---|---|---|
| MESH 12Z files | NOAA MRMS bucket `noaa-mrms-pds` on S3 | `hailprint ingest` downloads them with anonymous access |
| SPC WCM hail database | `1955-2025_hail.csv.zip` from the SPC WCM page | `hailprint candidates` downloads it to `data/raw/spc/` |
| SPC daily hail CSVs | SPC storm report pages | `candidates`, `score`, and `publish` download them; days older than `FRESH_DAYS` stay cached in `data/raw/spc/daily/` |
| HCAD parcels | HCAD GIS downloads (hcad.org/pdata/pdata-gis-downloads.html) | Manual: extract `Parcels.gdb` to `data/raw/hcad/extracted/Parcels.gdb` |

The HCAD gdb is necessary only for `hailprint parcels`. Without it, `publish` writes the site files without ZIP counts.

## Commands

```bash
uv run hailprint ingest 2024-05-28          # swath file and PNG for one or more storm dates
uv run hailprint index                      # archive index from one S3 bucket listing
uv run hailprint candidates --top 20        # ranked candidate days; needs `index` first
uv run hailprint candidates --missing       # candidate days with a 12Z file and no swath file, newest first
uv run hailprint parcels 2024-05-28         # parcel count per size class; needs `ingest` for that date and the HCAD gdb
uv run hailprint score --radius-km 5        # scores every swath file against the SPC daily CSVs
uv run hailprint warnings 2024-05-28        # NWS warning polygons for one or more storm dates; `--missing` fills the gaps
uv run hailprint publish                    # writes site/data/ (ZIP counts only where `parcels` ran)
```

A first run for one storm date:

1. Run `uv run hailprint ingest 2024-05-28`.
2. Run `uv run hailprint score`.
3. Run `uv run hailprint publish`.
4. Run `cd site && npm run dev` and open http://localhost:5173.

## Checks

```bash
make lint                                   # ruff check . && ruff format --check . && pyright
make test                                   # uv run pytest -q
make site                                   # cd site && npm ci && npm run check
```

Tests that need downloaded data skip when the data is absent. The markers live in `tests/conftest.py`:

- `needs_raw_mesh` needs the 12Z GRIB2 file under `data/raw/mesh/`.
- `needs_wcm` needs the SPC WCM zip under `data/raw/spc/`.
- `needs_hcad` needs the HCAD gdb and the 2024-05-28 swath file.

`tests/test_parcels.py` uses the committed fixture `tests/fixtures/parcels_sample.gpkg`, so the parcel logic runs without HCAD data.

## Next

- [operations.md](operations.md) covers the nightly run, the cron entry, and the deploy.
- [site/README.md](../site/README.md) covers the site routes, the basemap, and the dev harness.
- [GLOSSARY.md](../GLOSSARY.md) defines the domain terms.
