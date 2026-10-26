# Week 3 — verification scorer (PR C)

Goal: score the radar-estimated hail swaths against the SPC hail reports with a neighbourhood contingency table per size class.

Oracle: a hand count of two days (below) and a raster oracle that reads the raw MESH grid and shares no code with the polygon distance. The raster oracle checks the distances on 2 of 25 days. The golden JSON per day pins the counts of the code's own run, so it guards against drift and does not prove the counts. Synthetic tests with hand-built geometry cover the domain edge and the areas.

## Method

- The sample unit is the scored report. For a size class t and the scoring radius R, an event is a report of at least t. A forecast is a swath of class t at or within R of the report.
- R is 5 km. A report is scored when its radius disc lies inside the Harris bbox, shrunk by one cell.
- Reports come from the SPC preliminary daily CSV, inside the 50 km neighbourhood buffer.
- The sample holds reports only. A correct negative is therefore a report smaller than the class, not an empty place.
- The 25 days are the top-ranked candidate days, so every day has reports. `score` with no argument scores every swath file on disk, so ingesting more days changes the pooled numbers. The pooled numbers describe report-rich days, not a random sample of days.
- The exclusion removes 25 of 124 reports, 12 of them on one day. 18 of the 99 scored reports lie outside Harris County, TX by county and state name (the 50 km neighbourhood).

## Run

```bash
uv run hailprint index
uv run hailprint candidates --top 30
uv run hailprint ingest <the 25 candidate days>
uv run hailprint score
```

| Item | Value |
|---|---|
| Candidate days | 25, every one with a 12Z file |
| Ingest wall time | 24 s for 25 days, with the download |
| Score wall time | 6.4 s for 25 days |
| Scored reports | 99 |
| Excluded reports (near the crop edge) | 25 |
| Days with 0 scored reports | 2 (2024-05-13, 2025-06-08) |
| Test result | 180 passed (lint, format, and pyright clean), 2026-10-26 |

Largest exclusions: 2024-03-15 (12 of 20 reports), 2023-04-15 (5 of 6).

## Pooled table, 25 days, R = 5 km

| Class | Reports | Hits | Misses | False alarms | Correct negatives | POD | FAR | CSI | HSS |
|---|---|---|---|---|---|---|---|---|---|
| >= 0.75 in | 99 | 91 | 8 | 0 | 0 | 0.92 | 0.00 | 0.92 | 0.00 |
| >= 1.00 in | 99 | 83 | 16 | 0 | 0 | 0.84 | 0.00 | 0.84 | 0.00 |
| >= 1.25 in | 99 | 25 | 13 | 39 | 22 | 0.66 | 0.61 | 0.32 | 0.02 |
| >= 1.50 in | 99 | 16 | 9 | 36 | 38 | 0.64 | 0.69 | 0.26 | 0.11 |
| >= 1.75 in | 99 | 5 | 9 | 11 | 74 | 0.36 | 0.69 | 0.20 | 0.21 |
| >= 2.00 in | 99 | 0 | 8 | 4 | 87 | 0.00 | 1.00 | 0.00 | -0.06 |
| >= 2.50 in | 99 | 0 | 0 | 1 | 98 | n/a | 1.00 | 0.00 | 0.00 |

The 0.75 in and 1.00 in rows have 0 false alarms and 0 correct negatives, because no report is smaller than 1.00 in. With no non-event, FAR is 0.00 and CSI equals POD by construction. Read these two rows as POD only: their FAR, CSI, and HSS carry no information. The `score` command prints a note under the table when a row has no non-event (0 false alarms and 0 correct negatives).

The 2.50 in row rests on one report with no event: its FAR 1.00 and CSI 0.00 come from that single false alarm. The 2.00 in row holds 8 events. Treat any cell with a handful of reports as a count, not a rate.

### Unverifiable area

`unverifiable_km2` is the part of the swath farther than 5 km from every report. The pooled table prints it next to `swath_km2`.

| Class | swath_km2 | unverifiable_km2 |
|---|---|---|
| >= 0.75 in | 6675 | 4492 |
| >= 1.25 in | 1215 | 611 |

More than half of the 0.75 in swath area and about half of the 1.25 in swath area has no report within 5 km. POD and FAR say nothing about that area.

## Hand check

Two days, two classes each, counted from the printed report-to-swath distances (km).

2024-05-28, >= 1.25 in. Events are the 4 reports of 1.50 in or more, at 0.00, 1.11, 0.00, and 0.00 km: 4 hits, 0 misses. The 6 reports of 1.00 in lie at 3.33, 0.97, 1.11, 2.95, 0.00, and 1.11 km: 6 false alarms, 0 correct negatives. The table reads 4, 0, 6, 0.

2024-05-28, >= 1.75 in. Events are the 3 reports of 1.75 in, at 12.52, 31.14, and 30.08 km: 0 hits, 3 misses. The 7 other reports lie at 0.00, 5.63, 27.61, 33.49, 30.31, 33.85, and 33.49 km: 1 false alarm, 6 correct negatives. The table reads 0, 3, 1, 6.

2023-06-23, >= 1.25 in. Events are the 7 reports of 1.50 in or more, all within 3.65 km: 7 hits. The 6 reports of 1.00 in lie within 1.93 km: 6 false alarms. The table reads 7, 0, 6, 0.

2023-06-23, >= 1.75 in. Events are the 5 reports of 2.00 in, at 2.90, 3.11, 11.15, 35.47, and 37.23 km: 2 hits, 3 misses. The 8 other reports lie at 2.42, 3.33, 2.23, 6.21, 7.74, 34.62, 36.79, and 38.11 km: 3 false alarms, 5 correct negatives. The table reads 2, 3, 3, 5.

All four hand counts equal the written tables.

## Raster oracle

For each scored report and class, the oracle finds the nearest raw MESH cell centre at or above the class threshold (pyproj metres, numpy distance). The polygon union holds whole cells, so the polygon distance must lie between the centre distance minus 800 m and the centre distance. A report with a hot cell centre inside the radius disc must be a forecast in the polygon table. Both days pass for all 7 classes (`tests/test_score_real.py`, 2 tests, skipped when the raw 12Z file is absent).

## HSS at 1.25 in against the literature band

Measured pooled HSS at 1.25 in: 0.02. The literature band is 0.25 to 0.45 (Ortega 2018, against dense ground truth). The value falls outside the band. No parameter was tuned.

Reason found:

- The sample has no null points. A correct negative at 1.25 in is a report below 1.25 in that has no 1.25 in swath within 5 km.
- 61 of the 99 reports are exactly 1.00 in. SPC reports hail in coarse size steps, and 1.00 in is the most common step.
- All 39 false alarms at 1.25 in are reports of exactly 1.00 in. 20 of them lie within 1 km of the 1.25 in swath. A false alarm here means real severe hail one size step below the class, near the swath.
- The table scores the size step between two reports, so it cannot reach the skill of a dense ground truth. The band does not apply to this sample.
- The HSS rises with the class, to 0.21 at 1.75 in, as more reports fall below the class and outside the swath. It stays below 0.25 at every class.

The value 0.02 describes this sample design. It does not bound the true skill: the 5 km radius moves hits and false alarms together, and the data do not show the direction of the bias. A dense null sample (NCEI Storm Events or a hail-pad network) is the upgrade named in the `shortcut:` comment in `score.py`.

## Decisions

- Pooling sums counts, then recomputes the metrics. A mean of daily HSS would weight a 1-report day like a 13-report day.
- The command writes no pooled file. The pooled table prints to the terminal only.
- `score` reads the SPC daily CSV, not the WCM final record. The `report_source` metadata reads `spc-daily`, the same name `candidate-days.csv` uses.

## Handover to PR D

- `pairs-<date>.parquet` holds distances, so the pair set depends on the scoring radius R: the domain edge shrinks with R. A browser radius slider (A1) can only move R down from the radius of the run, and the publish step must say which R it used.
- `pairs` carries no `storm_date` column. The publish step takes the date from the file name.
- A missing distance (absent class) is stored as NaN. JSON has no NaN, so the publish step writes null.
