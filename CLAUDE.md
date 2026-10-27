# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hailprint draws the MRMS MESH hail swath over Harris County parcels and scores it against SPC
hail reports. Python 3.12 only (`requires-python = ">=3.12,<3.13"`), managed by `uv`.
Read `GLOSSARY.md` first and use its terms (storm date, daily max, 12Z file, size class, swath,
archive index, candidate day, parcel count) in code, tests, commits, and chat.

## Commands

```bash
make setup                                  # uv sync
make lint                                   # ruff check . && ruff format --check . && pyright
uv run pyright                              # type check src (basic mode); part of make lint
make test                                   # uv run pytest -q
uv run pytest tests/test_swath.py -q        # one file
uv run pytest tests/test_swath.py::test_name -q   # one test
uv run hailprint ingest 2024-05-28          # swath file + PNG for one or more storm dates
uv run hailprint index                      # archive index from one S3 bucket listing
uv run hailprint candidates --top 20        # needs `index` first
uv run hailprint parcels 2024-05-28         # needs `ingest` for that date and the HCAD gdb
uv run hailprint score --radius-km 5        # needs `ingest`; scores every swath file against SPC daily CSVs
uv run hailprint publish                    # needs `ingest`; writes site/data/ (ZIP counts only where `parcels` ran)
make site                                   # cd site && npm ci && npm run check
cd site && npm run dev                      # Vite dev server at http://localhost:5173
cd site && npm run check                    # tsc --noEmit && vitest run && vite build
```

Tests that need downloaded data self-skip: `needs_raw_mesh` (the 12Z GRIB2 under
`data/raw/mesh/`), `needs_wcm` (the SPC WCM zip under `data/raw/spc/`), and `needs_hcad` (the
HCAD gdb and the 2024-05-28 swath file), all in `tests/conftest.py`. `tests/test_parcels.py` uses the committed fixture
`tests/fixtures/parcels_sample.gpkg`, so parcel logic is testable without HCAD data.
`tests/test_outputs_clean.py` scans every file in `out/`, `data/derived/`, and `site/data/` for owner
fields and the word "damage", and every published file for `NaN` and `Infinity`.

## Architecture

Data flow, one module per step (`src/hailprint/`):

```
mesh.py       S3 (noaa-mrms-pds, anonymous) -> gz GRIB2 -> eccodes decode -> xarray cropped to Harris bbox
   |          key_for(storm_date) picks the single D+1 12:00 UTC MESH_Max_1440min file; sentinels -3/-1 masked to NaN
swath.py      daily max raster -> one dissolved polygon per size class (7 nested thresholds) -> GeoParquet
reports.py    SPC preliminary hail CSV for the day -> points with county and state; nearby_reports keeps BUFFER_KM = 50 km around the outline (buffer only), harris_reports keeps
              Harris, TX by county and state name (name only, as the WCM count does)
plot.py       swaths + county outline + report points -> PNG (Agg backend)
archive.py    one bucket listing -> one row per archive day (storm_date, file_count, bytes, has_12z)
candidates.py SPC WCM hail database -> Harris County days (FIPS 201); all_days adds the days after the WCM end from SPC daily CSVs -> ranked, joined with the index
parcels.py    HCAD Parcels.gdb -> allow-listed columns only, layer CRS -> one sjoin -> distinct hcad_num per size class and per ZIP
score.py      swaths + nearby_reports -> per scored report, metre distance to each size class -> contingency table (hits, misses, false alarms, correct negatives) -> POD, FAR, CSI, HSS;
              scoring radius 5 km default, 20 km max; reports within radius + 1 km of the crop edge are excluded (scoring domain); unverifiable area = swath farther than the radius from every report;
              pool() sums counts and areas across days and recomputes the metrics; edge_m() is the signed metre distance to the crop edge
publish.py    swaths + nearby_reports + ZIP counts -> validated JSON with a receipt under site/data/storms/<date>/ (swath.geojson, reports.geojson,
              radius-free pairs.json with edge_m and per-class distances, zip-counts.json) and the storms.json index; rescore(pairs, R) recomputes
              the contingency table in Python for any whole-km radius; dumps() refuses NaN, the forbidden word, and owner fields
county.py     committed Harris County GeoJSON (package data) -> outline() and bbox()
files.py      write_atomic() and write_text_atomic(): <name>.<pid>.tmp sibling then rename; owns SOURCE/PRODUCT/CONFIDENCE; stamps them as metadata
paths.py      ROOT (the repo root) and RAW_DIR, DERIVED_DIR, OUT_DIR, SITE_DATA_DIR; every data path hangs from it
net.py        get(url, timeout): urllib GET, 3 tries, backoff 0.5 s then 1 s; no retry on a 4xx
__main__.py   argparse CLI wiring the six commands and the fixed paths under data/, out/, and site/data/
```

`site/` is the static site (Preact 10, Vite 8, TypeScript strict, MapLibre GL 6). Routes:
`/storms/<date>/map|parcels|score|data`, `/scorecard`, `/try`, `/method`, `/pipeline`; `/` redirects
to the newest storm date. It reads `storms.json` first, then the four per-date files, each through
a guard in `site/src/data/guard.ts`, and re-scores `pairs.json` in `site/src/rescore.ts` with the
same radius rule as `publish.rescore`. Every MapLibre import lives under `site/src/storms/map/`.
`site/README.md` holds the commands, the data path, the basemap step, and the Vercel fields.

Data paths hang from `paths.ROOT`, so a command writes under the repo `data/` and `out/` from any
working directory. `data/`, `out/`, and `site/data/` are gitignored. No module holds a relative `Path("data...")`.

Conventions that span modules:

- **Every derived Parquet goes through `files.write_atomic`.** It is the one place that attaches
  the `source`, `product`, and `confidence` schema metadata. It takes a GeoDataFrame and an
  optional `metadata` dict; `swath.write_swaths` uses both. `test_outputs_clean` checks the keys
  on every Parquet under `data/derived/`. A new command that writes a table
  uses it; never call `to_parquet` directly. CSV has no metadata slot, so the candidate CSV names
  its source in README and in the `report_source` column (`wcm` or `spc-daily`).
- **Storm date = SPC convective day** (12Z D to 12Z D+1). The raster for storm date D lives in the
  D+1 folder with a `-120000` stamp. A CST report time minus 6 hours gives its storm date
  (`candidates.convective_day`).
- **Size classes** are the tuple `swath.SIZE_CLASSES_MM`; `parcels.COUNT_COLUMNS` and the swath
  file share `threshold_mm`, `threshold_in`, `label`.
- **CRS**: parcels arrive in EPSG:2278 (US survey feet) and `load_parcels` keeps that CRS. Use it
  for the parcel join and square-feet area. Reproject to EPSG:32615 before any metre distance, as
  `reports.nearby_reports` does. See `docs/solutions/geo/`.
- **Report frames** carry `time, location, county, state, size_in, geometry`. `reports.BUFFER_KM`
  is the neighbourhood buffer. `candidates.all_days` caches each daily CSV older than
  `FRESH_DAYS` at `data/raw/spc/daily/<yymmdd>.csv`. `candidate-days.csv` columns are
  `storm_date, report_count, max_size_in, has_12z, report_source`.
- **Published files**: every file under `site/data/` goes through `publish.validate`, which checks the
  schema in `src/hailprint/schemas/`, then `publish.dumps`, which scans the text. The receipt copies
  `source` and `product` from the input Parquet metadata into `sources`, and carries the one
  confidence band
  `swath.CONFIDENCE`. `pairs.json` is radius-free: the browser and `publish.rescore` apply the
  radius rule (scored when `edge_m > R*1000 + EDGE_M`; forecast when `dist_m <= R*1000`) at read
  time, so `score` and `publish` agree at every whole km.
- **Scoring**: the sample unit is the scored report. A class is a forecast for a report when the swath
  lies within the scoring radius (distance 0 inside). `score` outputs (`pairs-<date>.parquet`,
  `scores-<date>.parquet` under `data/derived/scores/`) carry `radius_km` and `report_source`
  metadata. The pooled table sums counts across days and refuses mixed radii.
- **`shortcut:` comments** mark known limits and their upgrade condition (ponytail convention).
  Keep them when editing nearby code.

## Rules that never change

- Outputs say "radar-estimated hail size" with the confidence band `swath.CONFIDENCE`. The word
  "damage" (`swath.FORBIDDEN_WORD`) never appears in any output, title, column, or metadata.
- HCAD owner fields (`parcels.OWNER_FIELDS`) are dropped at load via the `parcels.ALLOWED`
  allow-list and never written. Do not widen the allow-list without a decision in
  `docs/DECISIONS.md`.
- Harris County only, HCAD footprints only (v1 scope, `docs/DECISIONS.md`). The scorer reads
  SPC reports within the 50 km buffer, so it sees reports from outside the county.
- GitHub Actions stay disabled on this repo. Scheduling is a local or VPS cron job.

## Documents

- `docs/plan-v4.md` approved plan; `docs/DECISIONS.md` adopted answers and standing constraints.
- `docs/WEEK-NN.md` per-week evidence reports; `docs/KICKOFF.md` the week-1 prompt.
- `docs/solutions/<category>/` learn-loop entries. Read before debugging; the Parquet metadata,
  EPSG:2278 feet, and Windows file-write lessons live there.
- `.scratch/<feature>/` holds specs and tickets for pipeline runs (gitignored).
