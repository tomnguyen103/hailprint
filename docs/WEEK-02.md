# Week 2 — aligned ingest, archive index, candidate days, parcel counts

Goal: one swath file per SPC convective day from one MRMS file, an index of every archive day, a ranked list of Harris County hail days, and a parcel count per size class.

Oracle: the WCM database gives 9 Harris County reports for convective day 2024-05-28 and 1 for 2024-05-29. The SPC daily CSV gives 10 for 2024-05-28; the daily CSV is the preliminary product and the WCM file is the final record. Both tests pass.

## Result

| Item | Value |
|---|---|
| Storm date | 2024-05-28 |
| Files read for the daily max | 1 (`MRMS_MESH_Max_1440min_00.50_20240529-120000.grib2.gz`, 1,128,653 bytes) |
| Max MESH in bbox | 52.8 mm (week 1 measured 52.8 mm over the 47-hour window) |
| SPC hail reports in Harris County (daily CSV) | 10; at least 7 fall inside the 19.05 mm swath buffered 5 km |
| PNG | `out/ingest-2024-05-28.png` |
| Archive index | 2203 days, first storm date 2020-10-13, last storm date 2026-10-24, 2 days without a 12Z file; 25.6 s |
| Candidate days in the archive era | 22 |
| Top 3 candidate days | 2023-06-23 (13 reports, 2.00 in), 2024-03-21 (10, 1.25 in), 2024-05-28 (9, 1.75 in); every one has a 12Z file |
| Parcels per size class, 2024-05-28 | >= 0.75 in: 361,418; >= 1.00 in: 217,634; >= 1.25 in: 120,194; >= 1.50 in: 59,209; >= 1.75 in: 23,515; >= 2.00 in: 1,208 |
| Parcel run time | 32 s with the masked read of the 1,546,850-row GDB |
| Test result | 49 passed (lint and format clean), 2026-10-25 |

Run it:

```bash
make setup
uv run hailprint ingest 2024-05-28
uv run hailprint index
uv run hailprint candidates --top 20
uv run hailprint parcels 2024-05-28
```

## Decisions

- Window: a `MESH_Max_1440min` file stamped T holds the max over the 24 hours before T. The file stamped D+1 12:00 UTC is therefore the SPC convective day D. `ingest` reads that one file per storm date; the 48-file reduce of week 1 is removed. The swath file carries `file_count=1`.
- Ranking source: the WCM database (one 8 MB zip, 414,481 rows) replaces about 1,900 daily CSV fetches. WCM times are CST; the convective day is the CST stamp minus 6 hours.
- Harris filter: `st == "TX"` and FIPS 201 in any of `f1..f4`.
- Parcel read: pyogrio filters by the swath mask at the driver, so the 1.5 M-row GDB never loads in full. The parcel count is the number of distinct `hcad_num` per class. Owner fields are never requested.
- Downloads of several dates run in a thread pool of 8. One `RuntimeError` names every missing key after the pool drains.
- The `spike` command is removed. Week-1 evidence stays in `docs/WEEK-01.md` and `docs/evidence/`.

## Ponytail debt

- `shortcut: candidates reads the 1955-2025 database, 2026 days are absent; upgrade when SPC publishes the 2026 file or when the backtest needs 2026 days`
- `shortcut: a missing 12Z file is an error, no neighbour-timestamp fallback; upgrade if the index shows gaps on candidate days` (the index shows 2 such days out of 2203)

## Week 3 proposal (needs approval)

M4 verification: for every candidate day with a 12Z file, run `ingest`, buffer the 19.05 mm swath 5 km, and score the WCM reports as hits or misses. Store POD, FAR, CSI, and HSS per storm date in one table and compare them with the published ceiling (HSS about 0.38).

## Carried rules

- No homeowner names, mailing addresses, or contact data in any file.
- No secrets in the repo. Name the environment variable, never its value.
- `data/` and `out/` stay out of git.