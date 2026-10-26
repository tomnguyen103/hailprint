# Week 4 — published files for the site (PR D)

Goal: write the static files that the site (PRs E to H) reads, with a receipt in every file, and let the browser re-score at any whole-kilometre radius from one `pairs.json`.

Oracle: `score.score_day` run once per whole radius 0 to 20 on two real fixture days and compared with `publish.rescore` on the pairs document (counts, metrics, `unverifiable_km2`); the golden counts of week 3 at R = 5; a brute-force shapely intersection per ZIP on the five-parcel fixture; the RFC 7946 ring-orientation rule; the known 2024-05-28 parcel totals of week 2.

## Method

- `hailprint publish [dates]` writes, per storm date under `site/data/storms/<date>/`, `swath.geojson` (one MultiPolygon per size class), `reports.geojson` (one Point per neighbourhood report), `pairs.json` (radius-free scoring input), and `zip-counts.json` (parcel counts per size class and per ZIP, where `parcels` ran). It then writes the index `site/data/storms.json`, newest storm date first.
- Every file validates against a JSON Schema in `src/hailprint/schemas/` before the write. The serialiser refuses `NaN`, `Infinity`, the forbidden word, and every owner field. A failed date is named on stderr and skipped; the index still lands and the run exits 1.
- Every file carries a receipt: `storm_date`, `sources` (each with `source`, `product`, `file`, copied from the input Parquet metadata, plus the SPC daily CSV name and the HCAD layer), the confidence band, `run_time` (one UTC second per run), and `package_version`.
- Radius rule. `pairs.json` holds, per report, the edge distance `edge_m` (metres to the swath crop edge) and the distance to each size class, with `null` for an absent class. A report is scored at radius R when `edge_m > R*1000 + edge_margin_m`. A class forecasts for it when its distance is at most `R*1000`. The unverifiable area per class is stored for each whole kilometre 0 to 20, so no geometry runs in the browser. `publish.rescore(pairs, R)` is the Python oracle for the browser scorer of PR F.
- ZIP counts come from the one parcel join of week 2: the highest class per parcel, grouped by the first five digits of the HCAD `zip` field, else `unknown`.
- Size classes in inches are rounded to the hundredth in every published file. The Parquet files still carry `threshold_mm / 25.4` (0.7500000000000001 for 19.05 mm); the rounding lives in `publish._inches`.

## Run

```bash
uv run hailprint parcels <each of the 25 storm dates>
uv run hailprint publish
```

| Item | Value |
|---|---|
| Storm dates | 25, every swath file on disk |
| Parcels wall time | 243 s for 25 dates (about 10 s per masked HCAD read) |
| Publish wall time | 4 s for 25 dates and the index |
| Files written | 100 per-date files and `storms.json` |
| Bytes under `site/data/` | 362,201 in the date folders, 52,511 in `storms.json` |
| Largest file | `swath.geojson` for 2021-06-15, 19,043 bytes |
| Test result | 292 passed (lint, format, and pyright clean), 2026-10-26 |

## Checks

- `publish.rescore` at R = 5 equals the week-3 `scores-<date>.parquet` table (hits, misses, false alarms, correct negatives, `unverifiable_km2`) on all 25 days. The `table` in `storms.json` equals the same counts. Zero mismatches.
- `tests/test_publish_real.py` compares `rescore` with `score.score_day` at every whole radius 0 to 20 on 2024-05-28 and 2023-06-23, and with the golden counts at R = 5.
- The 2024-05-28 ZIP counts sum per class to the week-2 totals: 361,418 / 217,634 / 120,194 / 59,209 / 23,515 / 1,208. The `classes` rows carry the same numbers. 79 ZIPs, 5 rows with ZIP `unknown`.
- `tests/test_outputs_clean.py` scans `site/data/` with `out/` and `data/derived/`: no owner field, no forbidden word, no `NaN`, no `Infinity`.
- Two `publish` runs with the same inputs and the same `run_time` write equal bytes (`tests/test_cli.py`).

## Files per storm date

| Storm date | Scored | Excluded | Parcels >= 0.75 in | swath.geojson | reports.geojson | pairs.json | zip-counts.json |
|---|---|---|---|---|---|---|---|
| 2026-08-28 | 1 | 0 | 49,532 | 4,999 | 536 | 3,085 | 3,106 |
| 2026-06-02 | 4 | 0 | 36,369 | 3,708 | 1,104 | 4,030 | 2,987 |
| 2026-04-30 | 10 | 0 | 15,318 | 7,071 | 2,223 | 4,272 | 2,314 |
| 2025-08-18 | 4 | 0 | 89,667 | 6,565 | 1,103 | 3,942 | 6,496 |
| 2025-06-08 | 0 | 0 | 0 | 373 | 356 | 1,968 | 436 |
| 2025-05-02 | 3 | 2 | 25,139 | 9,142 | 1,269 | 4,505 | 2,976 |
| 2024-12-28 | 1 | 1 | 6,373 | 4,462 | 726 | 2,515 | 1,268 |
| 2024-12-24 | 4 | 1 | 37,881 | 3,178 | 1,270 | 3,452 | 1,995 |
| 2024-05-29 | 1 | 0 | 11,995 | 1,790 | 546 | 2,924 | 1,646 |
| 2024-05-28 | 10 | 0 | 361,418 | 14,024 | 2,212 | 5,464 | 14,348 |
| 2024-05-13 | 0 | 0 | 11,884 | 5,157 | 356 | 2,936 | 1,157 |
| 2024-05-02 | 1 | 0 | 77,341 | 9,085 | 539 | 3,345 | 3,812 |
| 2024-03-21 | 8 | 1 | 47,076 | 5,713 | 2,034 | 4,520 | 2,765 |
| 2024-03-15 | 8 | 12 | 49,315 | 8,889 | 4,092 | 7,307 | 2,932 |
| 2023-12-09 | 1 | 0 | 15,510 | 2,808 | 538 | 3,053 | 2,367 |
| 2023-06-23 | 13 | 0 | 221,695 | 8,656 | 2,772 | 4,791 | 10,159 |
| 2023-06-08 | 2 | 2 | 90,718 | 8,747 | 1,100 | 4,507 | 5,752 |
| 2023-05-08 | 1 | 0 | 22,486 | 3,781 | 540 | 3,069 | 1,763 |
| 2023-04-26 | 1 | 0 | 4,399 | 1,084 | 542 | 2,406 | 880 |
| 2023-04-15 | 1 | 5 | 20,588 | 2,815 | 1,467 | 3,478 | 1,930 |
| 2023-04-05 | 8 | 1 | 26,220 | 2,537 | 2,000 | 3,698 | 2,095 |
| 2023-03-27 | 5 | 0 | 45,815 | 7,879 | 1,287 | 4,355 | 4,965 |
| 2021-06-15 | 7 | 0 | 115,193 | 19,043 | 1,665 | 5,003 | 8,948 |
| 2021-04-15 | 4 | 0 | 23,884 | 4,841 | 1,099 | 3,463 | 1,875 |
| 2021-03-17 | 1 | 0 | 0 | 373 | 546 | 2,063 | 436 |

Sizes in bytes, before any HTTP compression. The two days with 0 parcels (2021-03-17, 2025-06-08) have no cell at or above 0.75 in inside the crop: their swath file holds no feature, and their pairs document gives every class a null distance.

## Decisions

- The pairs document is radius-free. The week-3 `pairs-<date>.parquet` depends on the radius of the run; the published file does not, so the browser slider moves R from 0 to 20 without a server.
- The unverifiable area is precomputed per whole kilometre (21 numbers per class) rather than recomputed in the browser, which would need a geometry library.
- The receipt lives inside every file, never in a sidecar manifest: a copied file keeps its provenance.
- `site/data/` is gitignored. The publish step runs on the machine that holds the data, and the deploy step (PR H) uploads the folder with the site build.

## Handover to PR E

- The site reads `site/data/storms.json` first: one entry per storm date with `report_count`, `max_size_in`, `report_source`, `max_mesh_mm`, `scored_reports`, `excluded_reports`, the score `table` at R = 5, `parcel_total`, and the relative path of each file under `files`.
- `reports.geojson` holds every neighbourhood report; `pairs.json` joins on `id`, the row index of the reports file. Reports outside the scoring domain at the chosen R are present in both files and are excluded by the radius rule, never dropped.
- A `zip-counts.json` file exists only where `parcels` ran, which is every one of the 25 days; `storms.json` names it under `files.zip_counts` when present. The two empty-swath days have a file with `parcel_total` 0.
- The total payload is 415 KB uncompressed for 25 days. A per-day fetch stays under 20 KB.
- Follow-up outside PR D: the Parquet files carry `threshold_in` with float noise (`swath.py` and `score.py` divide by 25.4 without rounding). Rounding at the source changes the swath file format and needs a re-ingest of the 25 days.
