Draft of 2026-10-27 for owner review. Nothing below is built. Live probes on 2026-10-27
give the facts in sections 3 and 4; each row names its probe. Where this draft and
`docs/DECISIONS.md` differ, DECISIONS wins until the owner adopts the rows in section 9.

---
title: Hailprint plan v6 (draft for review)
status: draft for review
supersedes: none (extends docs/plans/plan-v5.md; PRs A to H stand)
mode: one autonomous run, PRs I to N, after the owner answers section 13
date: 2026-10-27
---

# Hailprint plan v6 (draft)

## 1. Summary

Hailprint shows where radar estimates hail fell. It does not show what happened on the
ground next. Plan v6 adds three storm-impact layers to the one Storms map:

1. **Warning polygons**: the NWS Severe Thunderstorm, Tornado, and Flash Flood warnings
   from the Houston office, from the IEM archive.
2. **Power outages**: customers without power per county every 15 minutes, from EAGLE-I
   for storm dates up to 2025 and from ODIN snapshots for new storm dates.
3. **Internet reachability**: the IODA active-probe signal per county against its
   7-day baseline, for the storm dates that IODA covers.

A time slider runs over a 48-hour impact window. The map and a stacked storm timeline
follow it. The hail swath stays the daily max: it is the one layer with no time axis.

The power, internet, and warning layers cover Harris and its seven neighbour counties.
Hail, scoring, and parcels stay Harris only. Row 4 of `docs/DECISIONS.md` stands for
them; a new row 11 sets the scope of the impact layers.

The data is history, not real time. A storm date gets its impact layers on the first
nightly run after its impact window closes. That is one night after its hail layers. Six
PRs (I to N) build the work. The merge of PR N, the internet layer, waits for an answer
from IODA on reuse terms (section 4, V9).

## 2. What a viewer can do

| # | Action | Where | Result |
|---|---|---|---|
| B1 | Move the time slider, or press play | Map pane, below the map | The county fill, the active warnings, and the report points change to that 15-minute step. The storm stamp marks the hour. |
| B2 | Toggle a layer | Layers control on the map | Hail swath, SPC reports, and warning polygons each show or hide. The county fill takes one of three values: none, power, or internet. |
| B3 | Read the storm timeline | Below the slider | Four strips on one 48-hour axis: customers out, internet drop, warnings, and report times. A cursor line marks the slider step. A click on a strip moves the slider. |
| B4 | Click a county | Map | The inspector adds the county, its customers out and share out at the step, its internet drop, and the active warnings, each with a receipt chip. |
| B5 | Pick the county for the timeline | Inspector or timeline header | The power and internet strips follow that county. Harris is the default. |
| B6 | Download the data | Data pane | Three new rows: `power.json`, `internet.json`, `warnings.geojson`, each with its receipt. |
| B7 | Share a moment | Browser address bar | The path `/storms/<date>/map/<step>` opens the map at that step. |

A viewer reads the map as "what happened in the metro while this storm passed". The site
never says that hail caused an outage. Section 7.2 holds the wording rules.

## 3. Data sources

| Source | What | Period | Step | Access | Terms | Probe of 2026-10-27 |
|---|---|---|---|---|---|---|
| EAGLE-I (ORNL, figshare article 24237376) | Customers out per county, from utility outage maps | 2014 to 2025, one CSV per year | 15 min | `https://ndownloader.figshare.com/files/<id>`; the id comes from `api.figshare.com/v2/articles/24237376/files?page_size=100` by file name `eaglei_outages_<year>.csv` | CC BY 4.0 | The probe streams the 2024 file and keeps 242,153 rows for the 8 metro counties. A Range request on the 2025 file gives HTTP 206, and its last row is 2025-12-31 23:45 |
| EAGLE-I MCC | Customers per county | as of 2022 | none | `MCC.csv` in the same article; header `County_FIPS,Customers` after a UTF-8 BOM | CC BY 4.0 | 8 metro rows read; Harris 1,827,686 |
| ODIN (ORNL, opendatasoft) | Open outage incidents now, per county, with `metersaffected` and the utility in `name` | now only, no history | per fetch | `ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county/records` | licence field null | 7 metro counties hold open incidents; every `name` is `CENTERPOINT ENERGY,8901`. Liberty holds none. `group_by=communitydescriptor,name` with `sum(metersaffected)` returns one row per county and utility |
| IODA (Georgia Tech IIRL) | Active-probe reachability (`ping-slash24`): responsive /24 blocks per county | county level from about 2022-03 to 2024-05 | 600 s | `api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/county/<code>?from&until&datasource=ping-slash24` | response says "Copyright (c) 2021-2025 Georgia Tech Research Corporation. All Rights Reserved." | coverage scan in section 4, V8 |
| IEM storm-based warnings | NWS warning polygons with begin and end times | 2008 to now | per polygon | `mesonet.agron.iastate.edu/api/1/vtec/sbw_interval.geojson?begints&endts&wfo=HGX` | NWS data is public domain; credit IEM | 2024-05-28 window: 18 features; 2021-03-17 window: 3 features, two of them marine |
| Census `cb_2024_us_county_500k` | County outlines | 2024 | none | already at `data/raw/tiger/extracted/` | public domain | present on disk |

The 8 metro counties, with their IODA codes. All are in IODA region 4431 (Texas) and in
the NWS Houston/Galveston (HGX) warning area.

| FIPS | County | IODA code | MCC customers |
|---|---|---|---|
| 48201 | Harris | 3082 | 1,827,686 |
| 48157 | Fort Bend | 3081 | 694,780 |
| 48339 | Montgomery | 3027 | 230,040 |
| 48039 | Brazoria | 3094 | 144,164 |
| 48167 | Galveston | 3100 | 144,421 |
| 48473 | Waller | 3052 | 18,532 |
| 48291 | Liberty | 3041 | 44,189 |
| 48071 | Chambers | 3085 | 26,381 |

## 4. Verified findings

Severity: High, Medium, Low. Confidence: how sure the probe is that the finding is real.

| # | Source | Finding | Sev | Conf | Plan answer |
|---|---|---|---|---|---|
| V1 | EAGLE-I | Timestamps are UTC. In the 2024 file, Harris goes from 452 customers out at 2024-05-16 22:45 to 41,847 at 23:15, 277,975 at 23:45, and a peak of 502,077 at 01:15 on 2024-05-17. The derecho crossed Houston between 18:00 and 19:30 CDT, which is 23:00 to 00:30 UTC. Read as local time, the rise would come 5 hours before the storm. | High | High | Read `run_start_time` as UTC. Oracle O1 in section 10 pins it. |
| V2 | EAGLE-I | The header changes by year. 2024 has 6 columns with `total_customers`. 2020 and 2025 have 5 columns without it. | Med | High | Read the columns by name. Keep `fips_code`, `customers_out`, `run_start_time` only. |
| V3 | EAGLE-I | An absent row is not always a zero. In 2024 Harris lacks 213 of 35,136 steps, and the longest gap is 17 hours. The small counties lack 1,838 to 10,286 steps. 77 to 88 percent of those gaps follow a step with 5 or fewer customers out, but some follow 52,086 (Chambers). Explicit zero rows also exist: 492 to 1,897 per county. | High | High | An absent step is null, never zero. The site draws a gap. Section 13, decision 2. |
| V4 | EAGLE-I | `customers_out` can be blank (2020 file). | Low | High | A blank value is null. |
| V5 | EAGLE-I | The 2024 `total_customers` for Harris is 1,344,930. The MCC value is 1,827,686. The 2024 Harris peak is 1,660,703 at 2024-07-08 19:15 UTC (Hurricane Beryl), above `total_customers` but below MCC. The metro sum peaks at 2,533,528 at 19:30. | Med | High | Share out uses MCC for every year. Oracle O3 asserts share out at most 1.0 on the 2024 data. The site clamps the colour, not the number. |
| V6 | EAGLE-I | The coverage history gives Texas a covered share of 0.63 in 2020 and about 0.9 or more in the other years read. | Low | High | No storm date falls in 2020. The Method page names the coverage history file. |
| V7 | EAGLE-I | The 2025 file is 1,402,347,695 bytes and ends at 2025-12-31 23:45. No 2026 file exists. The file host answers a Range request with HTTP 206. | Med | High | Stream each year once and keep only the metro rows (section 5.2). 2026 storm dates use ODIN or show no power data. |
| V8 | IODA | County signals exist only from about 2022-03 to 2024-05. Harris holds 288 `merit-nt`, 288 `bgp`, and 144 `ping-slash24` points per day in that period. All three are absent on 2019-05-01, 2020-06-01, 2021-03-17, 2021-06-01, and 2022-01-15. On 2024-06-01 and 2024-06-10 only `merit-nt` remains. From 2024-07-08 to 2026-10-20 no county signal exists. The Texas region signal continues to 2026-10-20. | High | High | 14 of the 25 storm dates have a county signal (section 4.1). The other dates show "no county signal". |
| V8a | IODA | The impact window of 2024-05-29 ends at 2024-05-31 12:00. The probes confirm `ping-slash24` on 2024-05-28 and its absence on 2024-06-01. No probe finds the end of the signal between those days. | Low | Med | The 192 steps take what IODA returns. Absent steps are gaps. PR N records the real count of storm dates with a signal. |
| V9 | IODA | Every response carries "All Rights Reserved". No public reuse terms are found. | High | Med | Collect and compute in PR N. Publish only after IODA answers in writing. Section 13, decision 3. |
| V10 | IODA | A search for "Harris" also returns Harrison County (1808). | Low | High | The codes are constants in the code, checked by a test against the table in section 3. |
| V11 | IEM | The HGX feed holds marine warnings (`MA.W`) beside `SV.W`. | Low | High | Keep phenomena `SV`, `TO`, `FF` with significance `W` only. |
| V12 | ODIN | ODIN gives open incidents now. It holds no history. In the metro, every open incident comes from CenterPoint Energy. Liberty, outside most of the CenterPoint area, holds none. | High | High | Snapshot every 15 minutes from cron. ODIN power data starts at the cron install and covers CenterPoint customers only. A county with no incident in any snapshot of the window is null, not 0 (section 5.3). |
| V13 | ODIN | ODIN publishes no licence. | Med | Med | Publish county totals with attribution. Email ORNL. Section 13, decision 4. |
| V14 | ODIN | The endpoint returns one record per incident. A large storm opens thousands of incidents, and the records endpoint pages them. | Med | High | Ask the API for one sum per county and utility (`select=sum(metersaffected)` with `group_by=communitydescriptor,name`). One request gives one row per county and utility at any storm size. |
| V15 | All | The derecho of 2024-05-16 is not one of the 25 storm dates. | Low | High | It stays a test oracle only. It gets no page. |

### 4.1 Coverage by storm date

The site has 25 storm dates. Warnings cover all of them.

| Year | Storm dates | Power | Internet |
|---|---|---|---|
| 2021 | 3 | EAGLE-I | none (V8) |
| 2023 | 8 | EAGLE-I | IODA for all 8 |
| 2024 | 8 | EAGLE-I | IODA for 6 (March to May, 2024-05-29 partial by V8a); none for 2024-12-24 and 2024-12-28 |
| 2025 | 3 | EAGLE-I | none |
| 2026 | 3 | none until EAGLE-I publishes 2026, about early 2027 | none |

New storm dates after the ODIN cron install get ODIN power data.

## 5. Back-end architecture

### 5.1 New and changed modules

```
county.py   committed metro GeoJSON (8 counties) -> metro(); outline() selects 48201 from it
sbw.py      IEM storm-based warnings for one impact window -> allow-listed GeoParquet
power.py    EAGLE-I year stream -> metro Parquet; ODIN fetch -> snapshot rows;
            one storm date -> customers out per county per step, from one source
internet.py IODA ping-slash24 per county -> 15-minute medians -> ratio to the 7-day baseline
publish.py  + power_doc, internet_doc, warnings_doc; build_day takes the three optional inputs
__main__.py + eaglei, odin, power, internet, warnings commands
```

`county.py` keeps one data file. `metro_counties.geojson` replaces
`harris_county.geojson`, and `outline()` returns the 48201 row from it. The old file
moves to `tests/fixtures/harris_county.geojson`. Oracle O11 asserts that the new Harris
geometry equals that fixture, so the bbox, the crop, and every score stay the same.

The `shortcut:` comment in `county.py` names a second county as the trigger for "a
download". PR I takes a smaller step: one more extract from the TIGER file on disk. The
comment then reads: `shortcut: the 8 metro outlines are a committed GeoJSON extracted
once from cb_2024_us_county_500k on <date>, upgrade to a download when the scope leaves
the metro`.

Each new derived Parquet passes its own `metadata` to `write_atomic`. Without it, the
defaults credit MRMS.

| Parquet | `source` | `product` |
|---|---|---|
| `eaglei-<year>` and EAGLE-I `power-<date>` | `eaglei` | `eaglei_outages` |
| `odin-<day>` and ODIN `power-<date>` | `odin` | `odin-real-time-outages-county` |
| `warnings-<date>` | `iem` | `sbw` |
| `internet-<date>` | `ioda` | `ping-slash24` |

The MCC counts are a constant in `power.py`: the 8 values of the section 3 table, copied
from `MCC.csv`. A unit test checks them against that table.
`shortcut: MCC as a constant of 2022, upgrade to a read of MCC.csv when EAGLE-I publishes a new count`.

### 5.2 Commands

| Command | Reads | Writes | Notes |
|---|---|---|---|
| `hailprint eaglei <year>...` | figshare file list, the year CSV as a stream | `data/derived/eaglei/eaglei-<year>.parquet` | One pass per year: pandas `read_csv` with `chunksize` on the HTTP response. The pass keeps the rows whose `fips_code` is in the metro set. No full CSV touches the disk. A failed stream leaves no file; a rerun starts again. |
| `hailprint odin` | the ODIN records endpoint, grouped by county and utility and filtered to the 8 FIPS (V14) | `data/derived/odin/odin-<YYYY-MM-DD>.parquet`, one file per UTC day | One snapshot: `fips`, `utility`, `customers_out` per county and utility, all causes. The fetch time, floored to the quarter hour, stamps each row. `utility` is the text of `name` before the comma: `CENTERPOINT ENERGY,8901` gives `CENTERPOINT ENERGY`. A county with no open incident gets one row with 0 when the fetch succeeds. A failed fetch writes nothing, so that step is a gap. Each run reads the day file, adds its rows, and writes it back through `write_atomic`. |
| `hailprint warnings <date>...` or `--missing` | IEM for the impact window, `wfo=HGX` | `data/derived/warnings/warnings-<date>.parquet` | Keeps `SV`, `TO`, `FF` with significance `W` that intersect a metro outline. A window with no such warning writes a file with no rows: "checked, none". |
| `hailprint power <date>...` or `--missing` | the EAGLE-I year Parquets, else the ODIN day Parquets | `data/derived/power/power-<date>.parquet` | Long format: `fips`, `step_utc`, `customers_out` (nullable). `source` metadata is `eaglei` or `odin`. No file when no source covers the window. |
| `hailprint internet <date>...` or `--missing` | IODA for each county code, the window plus 7 days before it | `data/derived/internet/internet-<date>.parquet` | Long format: `fips`, `step_utc`, `value`, `baseline`, `ratio` (nullable). An empty IODA answer writes a file with null ratios, so `--missing` stops asking once the date is older than `candidates.FRESH_DAYS`. `publish` writes no `internet.json` for such a file (section 5.4). |

`--missing` means: a storm date with a swath file, a closed impact window (12Z D+2 has
passed), and no derived file of that kind. For `power` it also means an ODIN-sourced
file whose window an EAGLE-I year Parquet now covers. EAGLE-I then replaces ODIN for
that date, because it covers every utility.

Every write goes through `files.write_atomic`. `write_atomic` already takes a plain
DataFrame, so it needs no change.

`net.get` returns the whole body, which is wrong for a 1.4 GB file. PR K adds
`net.open_stream(url, timeout)`: the same retry rule for the connect, then the open
response for the caller to read. The retry covers the connect only. A break during the
body read raises, and the command fails for that year. The host supports Range (V7), so
a resume is possible, but the plan does not build it: four years run once each.
`shortcut: no Range resume, add one if a year fails twice`.

### 5.3 Impact window and the 15-minute grid

- Impact window: 12:00 UTC on D to 12:00 UTC on D+2. That is 48 hours, 192 steps.
- The first 96 steps are the convective day. The site shades them.
- Step k starts at 12:00 UTC on D plus 15k minutes. Every published file stores the
  window start and the step length, not 192 timestamps.
- Power: the EAGLE-I value at the step start. A window step in a year with no EAGLE-I
  Parquet is null. ODIN: the sum over utilities of the last snapshot inside the step;
  none means null. A county with no incident in any snapshot of the window is null at
  every step, because ODIN cannot show that its utility reports to ODIN.
- Report step: an SPC report time `HHMM` is UTC inside the convective day, as
  `site/src/stamp.ts` reads it. Its step is `((HH + 12) % 24) * 4 + floor(MM / 15)`.
  Hours 00 to 11 fall on D+1. Every report step is below 96.
- Internet: the median of the `ping-slash24` points inside the step. IODA reports every
  600 s, so a step holds one or two points. No point means null.
- Baseline: the median of the county signal over the 7 days before the window start. A
  baseline with fewer than half its points present is null, and so is every ratio of that
  window. The flat baseline ignores the daily cycle of the signal.
  `shortcut: flat 7-day median, upgrade to a time-of-day baseline if a quiet day shows a
  drop above 5 percent`.
- Ratio: value divided by baseline. The file stores the ratio. The site shows the drop:
  `max(0, 1 - ratio)` as a percent.
- A window that crosses a year boundary reads two EAGLE-I year files.

### 5.4 Published files

Three new files per storm date under `site/data/storms/<date>/`. Each has a schema in
`src/hailprint/schemas/`, passes `publish.validate` and `publish.dumps`, and carries a
receipt.

`power.json` (about 10 KB):

```json
{
  "receipt": { "...": "..." },
  "window": { "start": "2024-05-28T12:00:00Z", "step_minutes": 15, "steps": 192 },
  "source": "eaglei",
  "utilities": null,
  "counties": [
    { "fips": "48201", "name": "Harris", "customers": 1827686,
      "out": [82, 95, null, "... 192 values, integer or null"] }
  ]
}
```

- `source` is `eaglei` or `odin`. One file never mixes the two.
- `utilities` is null for EAGLE-I. For ODIN it lists the `utility` values in the
  snapshots of the window, today `["CENTERPOINT ENERGY"]`. The site then labels every
  value a lower bound.
- `customers` is the MCC count. Share out is `out / customers`, computed in the browser.

`internet.json` (about 14 KB): the same `window`, `"signal": "ping-slash24"`,
`"baseline_days": 7`, and per county `fips`, `name`, `baseline` (number or null), and
`ratio` (192 values, number with 3 decimals or null).

`warnings.geojson`: one feature per warning polygon. The property allow-list is
`phenomena`, `significance`, `event_label`, `eventid`, `polygon_begin`, `polygon_end`,
`product_id`. Geometry rounds to 4 decimals (about 10 m). The IEM text fields stay out.

Index changes in `storms.json`: `files` gains `power`, `internet`, and `warnings`, each
`oneOf` a file path or null, like `zip_counts`. A `warnings` path ends in `.geojson`, so
the existing `geojson_file` pattern holds.

The first run after PR I meets an old index. `_publish_days` reads the old `storms.json`
through `read_published` before any write, and the old entries lack the three keys. Two
rules keep that read whole:

- The schema lists the three keys under `properties` but not under `required`. The old
  index validates, and `additionalProperties: false` still refuses any other key.
- `merge_entries` reads each new key with a null default, and writes all three keys on
  every entry it returns. After one run, every entry holds them.

No migration script is needed. `merge_entries` keeps an entry whose new file is absent,
as it does for `zip_counts`, and sets that key to null. `RECEIPT_FILES` gains
`("power", "power")`, `("internet", "internet")`, and `("warnings", "warnings")`.
`index_receipts` skips a null key and reads every other receipt in that tuple. The
Pipeline Sources view then lists EAGLE-I, ODIN, IODA, and IEM rows with no other change.

On the site, `StormFiles` in `site/src/data/types.ts` gains the three keys as
`string | null`, and `guardIndex` requires them. The site build ships with the
`storms.json` of the same publish run, so the site never reads an old index.

The outline file is `site/public/county.geojson` today. It is committed with no receipt,
and `guardOutline` reads it. PR I replaces it with `site/public/counties.geojson`. A
script in `site/scripts/` writes it once from the package metro file. Each feature is a
`MultiPolygon` with a `fips` and a `name` property, so `fetchCounty` keeps its
`FeatureCollection<MultiPolygon>` type. `site/src/county.ts` loads the new file, and
`county.test.ts` checks the Harris feature against `HARRIS_BBOX` as it does today. The
old file goes.

`site/src/county.ts` gains `METRO_BBOX`, the bounds of the 8 outlines padded by 0.05
degree. A test checks it against `counties.geojson`. The map still opens on
`HARRIS_BBOX`, because the hail swath is the subject. The basemap extract in
`site/scripts/basemap.sh` widens from the Harris bbox to `METRO_BBOX`, so the county fill
has a basemap under it. The owner reruns the script once (section 11.3).

Null and empty mean different things:

| State | `storms.json` key | File |
|---|---|---|
| Not fetched yet, or no source covers the window | null | none |
| Fetched, no event (no warning, every step 0) | path | written: an empty FeatureCollection, or 192 zeros |
| Fetched, some steps without a value | path | written, with null steps |
| Internet fetched, every ratio null (no county signal) | null | none |

The publish run for a date with no derived power file writes no `power.json`. The same
holds for internet and warnings. An internet Parquet with no ratio at any step and county
gives no `internet.json`, so the site shows "no county signal". The Parquet stays, so
`internet --missing` does not ask IODA again. Thus 14 storm dates get `internet.json`.

## 6. Site architecture

### 6.1 Map layers

Layer order, bottom to top:

1. Basemap, or paper when the PMTiles file is absent.
2. County fill: power or internet, at 0.6 opacity. One at a time.
3. Hail swath fills, the size ruler ramp, and the `swath-outline` line. Unchanged.
4. Warning polygons: outline only, 2 px, dashed for `SV`, solid for `TO`, dotted for
   `FF`, with a label at the polygon centroid at zoom 9 and up.
5. County lines: the 8 outlines, Harris heavier.
6. Report points: full at or before the slider step, 30 percent opacity after it.
7. Point check marker. Unchanged.

All new layers live in `site/src/storms/map/layers.ts` and `create-map.ts`. `MapHandle`
gains `setCounties`, `setFill(kind, values)`, `setWarnings(features, stepIso)`, and
`setReportCutoff(iso)`. The theme switch re-adds the basemap below the county fill
instead of below the first hail fill.

### 6.2 Colour

- Power uses a 5-step sequential ramp, `--out-1` to `--out-5`, over share out. Each bin
  holds its lower bound and excludes its upper bound:

  | Token | Share out |
  |---|---|
  | none | 0 |
  | `--out-1` | above 0, under 1 percent |
  | `--out-2` | 1 to under 5 percent |
  | `--out-3` | 5 to under 15 percent |
  | `--out-4` | 15 to under 30 percent |
  | `--out-5` | 30 percent and up |

  Null gets a 45-degree hatch.
- Internet uses `--net-1` to `--net-5` over the drop, with the same bound rule: above 0
  and under 2, then 2, 5, 10, and 20 percent as lower bounds. A drop of 0 gets no fill.
- Both ramps are cool hues, so no step reads as a hail class. `design.md` gains the
  tokens for light and dark. The impeccable detector and a contrast check run on both
  themes.
- Warning outlines use `--warn-sv`, `--warn-to`, `--warn-ff`. The line style carries the
  type too, so colour is never the only cue.

### 6.3 Time slider

- A native `input type=range`, 0 to 191, step 1. Arrow keys move 15 minutes; Page Up and
  Page Down move 1 hour; Home and End go to the window ends.
- The readout shows the step in UTC and in Houston local time (`America/Chicago` through
  `Intl.DateTimeFormat`). Each time carries its own date, because the two dates can
  differ: `01:00 UTC Wed 29 May · 20:00 CDT Tue 28 May`.
- `aria-valuetext` reads the same text plus the customers out of the picked county at the
  step.
- The step comes from the path when the path holds one. Else the default is the Harris
  power peak when `power.json` exists, else 00:00 UTC on D+1.
- A play button advances 1 hour every 400 ms and stops at the end. It never starts on
  its own. With `prefers-reduced-motion`, it advances on each press instead.
- The step lives in the path, `/storms/<date>/map/<step>`, so a link opens the same
  moment. `router.ts` holds the rule "zero query strings", so the step is a path part.
  `match` accepts an integer from 0 to 191 on the `map` tab only, and `href()` builds the
  path. An out-of-range or non-integer step gives the default step, not a not-found page.
  A slider move calls `replace`, not `navigate`, so the back button skips the steps.
- The storm stamp marks the slider hour when the step is inside the convective day.

### 6.4 Storm timeline

One SVG chart, 48 hours wide, under the slider. Four strips share the x axis:

1. Customers out for the picked county, a step line, with gaps at nulls. The y axis is
   linear from 0. ODIN data gets the label "CenterPoint customers only".
2. Internet drop for the picked county, as a percent, with gaps at nulls. "No county
   signal" replaces the strip when `internet.json` is absent.
3. Warnings: one bar per polygon from begin to end, by type.
4. Reports: one tick per SPC report, at its report step (section 5.3).

A cursor line marks the slider step across all strips. A click or a tap on any strip sets
the slider. The chart has a `<title>`, and the Data pane holds a table of the same
numbers for screen readers. Below 768 px, strips 1, 3, and 4 stay; the internet strip
moves into the inspector.

### 6.5 Inspector, Data pane, and Method

- Inspector: a county section under the point section. It names the county and gives
  customers out, share out, and the internet drop at the step, plus the active warnings.
  Each number has a receipt chip.
- Data pane: three rows for the new files, with the same download links and receipt
  chips as the current rows.
- Method: a sixth page, `/method/impacts`: what each source measures, its period, the
  gap rule, the baseline rule, and the wording rule. It passes the prose budget test.

### 6.6 Data guards

`site/src/data/guard.ts` gains `guardPower`, `guardInternet`, and `guardWarnings`. Each
checks the window, 192 values per county, the FIPS set, and the receipt. A failed guard
hides that layer and shows one line in the layers control. The hail map still works.
`guardIndex` requires the three new `files` keys (section 5.4).

## 7. Domain language and wording

### 7.1 New glossary terms

| Term | Meaning |
|---|---|
| Metro counties | Harris and its seven neighbours: Fort Bend, Montgomery, Brazoria, Galveston, Waller, Liberty, Chambers. The scope of the impact layers only. |
| Impact window | 12:00 UTC on storm date D to 12:00 UTC on D+2: 192 steps of 15 minutes. The first 96 steps are the convective day. |
| Step | One 15-minute slot of the impact window, named by its start time in UTC. |
| Customers out | Utility customers without power in one county at one step, from EAGLE-I or ODIN. Null when no row exists. |
| Share out | Customers out divided by the MCC customer count of the county. |
| MCC | Modelled County Customers: the EAGLE-I customer count per county, as of 2022. |
| ODIN snapshot | One fetch of open ODIN incidents for the metro counties, summed per county. The `hailprint odin` cron entry takes one every 15 minutes. |
| Reachability ratio | The IODA `ping-slash24` value of a county at one step divided by its 7-day baseline. |
| Internet drop | `max(0, 1 - reachability ratio)`, shown as a percent. |
| Baseline | The median `ping-slash24` value of a county over the 7 days before the impact window. |
| Warning polygon | One NWS storm-based warning polygon (`SV`, `TO`, or `FF`, significance `W`) from WFO HGX, with its begin and end time. |
| Impact layer | A map layer with a time axis: power, internet, or warnings. |
| Time slider | The native range over the 192 steps of the impact window. |
| Storm timeline | The four-strip chart under the slider: customers out, internet drop, warnings, report times. |
| Gap | A step with no source value. Stored as null and drawn as a break, never as zero. |
| Metro outlines | The 8 county polygons of the metro counties, from `cb_2024_us_county_500k`. `county.metro()` returns them. |

`County outline` keeps its meaning: the Harris polygon. Every current use in the code
means Harris, so `outline()` stays and `metro()` is new. The Harris bbox and the crop do
not change.

Changed glossary rows: `Method page` counts six pages and adds Impacts. `Nightly run`
adds warnings, power, and internet before publish. `Cron entry` names two lines: the
nightly run at 14:00 UTC and the ODIN snapshot every 15 minutes. `Basemap` names the
metro bbox. `Published file` adds the three new files.

Other documents: `CLAUDE.md` gains the new modules in its architecture block, the
`/method/impacts` route, and the `/storms/<date>/map/<step>` path. The header comment
of `scripts/hailprint.cron` names the ODIN line. Each change lands in the PR that makes
it true.

### 7.2 Wording rules

- The site says "customers without power during the impact window". It never says that
  hail caused an outage.
- The site says "internet reachability below baseline". It never says "internet down".
- The forbidden word stays forbidden. `publish.dumps` scans the new files, and
  `tests/test_outputs_clean.py` already scans every file under `site/data/`.
- Every impact layer names its source on the map, in the timeline, and in the receipt.

## 8. Nightly run and cron

`scripts/nightly.sh` adds three steps after `score` and before `publish`:

```
log "warnings --missing";  uv run hailprint warnings --missing || log "warnings failed; publish goes on"
log "power --missing";     uv run hailprint power --missing    || log "power failed; publish goes on"
log "internet --missing";  uv run hailprint internet --missing || log "internet failed; publish goes on"
```

A failed impact step never stops the hail publish. That follows the current rule for a
failed ingest. Each PR adds its own line: PR I adds warnings, PR K adds power, and PR N
adds internet.

`scripts/hailprint.cron` gains one line, with the same `CRON_TZ` and `PATH`:

```
*/15 * * * * cd /path/to/hailprint && uv run hailprint odin >> data/odin.log 2>&1
```

The ODIN command takes the lock `data/derived/odin/odin.lock` around the read, merge, and
write of the day file. It writes only `data/derived/odin/`, through `write_atomic`, and no
other command writes there. A manual run that overlaps a cron run exits 1 instead of
replacing the day file from a stale copy. `power` reads a day file only after the window
closes, and the rename in `write_atomic` keeps a read whole. One year of snapshots is
about 280,000 rows across 365 small files.

`hailprint eaglei` is not a nightly step. The run executes it once for 2021, 2023, 2024,
and 2025. A new EAGLE-I year needs one manual run. Then `power --missing` replaces the
ODIN files of that year (section 5.2). A `shortcut:` comment on the command reads:
`shortcut: manual run per EAGLE-I year, upgrade to a figshare version check when a second
new year arrives`.

## 9. Proposed DECISIONS rows

| # | Decision | Proposed answer | Open item |
|---|---|---|---|
| 11 | Impact layer scope | Warnings, power, and internet cover the 8 metro counties. Hail, scoring, and parcels stay Harris only (row 4 stands for them). | Revisit row 4 as a whole for the v2 nine-county metro |
| 12 | Power sources | EAGLE-I for storm dates up to its last published year; ODIN snapshots after the cron install. One file never mixes them. Share out uses MCC 2022. | ODIN covers CenterPoint only (V12) |
| 13 | Gap rule | A step with no source row is null and draws as a gap. No fill, no interpolation. | Revisit if EAGLE-I documents that an absent row means zero |
| 14 | Internet layer | Publish IODA-derived ratios only after IODA answers in writing. Until then PR N stays unmerged. | IODA reply |
| 15 | ODIN terms | Publish ODIN county totals with attribution; ask ORNL in writing. | ORNL reply |

## 10. Testing and oracles

| # | Oracle | Kind | Marker |
|---|---|---|---|
| O1 | Derecho: Harris customers out below 1,000 at 2024-05-16 22:45 UTC and above 200,000 at 23:45 UTC (the probe gives 452 and 277,975). This pins UTC (V1). | real data | `needs_eaglei` (the 2024 Parquet) |
| O2 | Storm date 2024-05-28: Harris peak 251,830 at 2024-05-28 20:00 UTC. | golden value | `needs_eaglei` |
| O3 | Harris 2024 peak 1,660,703 at 2024-07-08 19:15 UTC, and share out at most 1.0 for every county and step of 2024. | real data | `needs_eaglei` |
| O4 | IODA: the Harris reachability ratio is below 0.9 at 2024-05-17 01:00 UTC. | real data | `needs_network` |
| O5 | Gap rule: a fixture with an absent step gives null; an explicit 0 row gives 0. | unit | none |
| O6 | Header drift: a 5-column and a 6-column fixture give the same frame. | unit | none |
| O7 | IEM: a fixture with `MA.W` and `SV.W` keeps only `SV.W`; no text field survives. | unit | none |
| O8 | ODIN: a fixture snapshot sums `metersaffected` per county and utility, keeps planned outages, gives one 0 row to a county with no incident, and cuts `name` at the comma. A window where a county has no incident in any snapshot gives null at every step. | unit | none |
| O9 | Python and TypeScript agree: share out and internet drop from one fixture match to 1e-9. | cross-language | none |
| O10a | Warnings schema and the `storms.json` change: the property allow-list, 4-decimal geometry, an empty collection, an old index without the three keys still reads. | unit | none |
| O10b | Power schema: 192 values per county, integers or null, no NaN, FIPS set fixed. | unit | none |
| O10c | Internet schema: 192 ratios per county, numbers or null, no NaN, FIPS set fixed; an all-null file gives no `internet.json`. | unit | none |
| O11 | Harris outline from the metro file equals `tests/fixtures/harris_county.geojson`, the old committed file. | unit | none |
| O12 | Site: slider keys, `aria-valuetext`, the `/map/<step>` path and its out-of-range default, report steps, guards, and layer toggles. | vitest | none |
| O13 | Screens at 375, 768, and 1440 px, light and dark, through the Claude browser preview. | visual | none |

`needs_eaglei` and `needs_network` go into `tests/conftest.py` beside the current
markers. The real-data oracles run on the owner machine; the default `make test` skips
them when the data is absent.

## 11. Autonomous programme

### 11.1 PR sequence

| PR | Scope | Exit check |
|---|---|---|
| I | Metro counties and warnings (back end): `metro_counties.geojson`, `county.metro()`, the Harris fixture, `sbw.py`, `hailprint warnings`, `warnings.geojson` schema and publish, the three `storms.json` file keys with the null default, `site/public/counties.geojson`, `METRO_BBOX`, the basemap bbox, the warnings nightly line, GLOSSARY and DECISIONS rows. | O7, O10a, O11 green. `publish` over the current `site/data/` reads the old index and writes `warnings.geojson` for all 25 storm dates; a date with no warning gets an empty collection. |
| J | Time on the map (site): time slider, the `/map/<step>` path, warnings layer, reports by time, storm timeline with the warnings and reports strips, layers control, stamp hour mark. | O12 and O13 green. Impeccable detector clean. Keyboard-only walk of B1 to B3 and B7. |
| K | Power history (back end): `net.open_stream`, `hailprint eaglei` for 2021, 2023, 2024, 2025, `power.MCC`, `hailprint power`, `power.json`, the power nightly line. | O1, O2, O3, O5, O6, O10b green. 22 storm dates get `power.json`. |
| L | Power on the map (site): county fill, power strip, county inspector, Data pane rows, `/method/impacts`. | O9, O12, O13 green. Impeccable detector clean. Prose budget passes. |
| M | ODIN snapshots: `hailprint odin`, the cron line, the source switch and the EAGLE-I replace rule in `power`, the lower-bound label. | O8 green. 96 snapshots in one test day on the owner machine. |
| N | Internet (gated): `internet.py`, `hailprint internet`, `internet.json`, the internet nightly line, internet fill and strip. | O4, O9, O10c, O12, O13 green. Impeccable detector clean. 14 storm dates get `internet.json`. Merge waits for decision 3. |

Six PRs use six CodeRabbit reviews, one per hour on the free plan.

### 11.2 Per-PR loop

Each PR runs the full pipeline: grill, spec, tickets, implement with a red-to-green test
per ticket, audit loop, local gate with both engines, CodeRabbit, squash merge, and
branch delete. UI PRs (J, L, and N) run the Stitch pipeline and the UI gate first. The
next PR branches from fresh `main`.

### 11.3 Owner-only steps

1. Answer section 13.
2. Send the IODA email and the ORNL email. Section 14 holds drafts. The sender address
   stays out of the repo.
3. Install the ODIN cron line on the cron host.
4. Run the real-data oracles O1 to O4 once on the owner machine, or let the run do it on
   this machine.
5. Rerun `site/scripts/basemap.sh` once after PR I, for the metro extract. The basemap
   is optional, so the site works before this step.

### 11.4 Definition of done

- **Done**: PRs I to M merged. Every storm date shows warnings. 22 storm dates show power.
  The site passes `make site` and the deploy dry run.
- **Done with internet**: done, plus PR N merged after the IODA reply.
- **Live**: done, plus the cron line installed and one ODIN-sourced storm date published.

## 12. Risks

| Risk | Bounded answer |
|---|---|
| An EAGLE-I stream breaks after 1 GB. | The year fails cleanly; a rerun starts again. Four years, one time only. The host supports Range, so the `shortcut:` upgrade is small. |
| EAGLE-I changes the header again. | Columns by name; an absent column raises one line that names the year and the column. |
| An absent EAGLE-I row means zero after all. | DECISIONS row 13 says null. A changed rule needs one function and a re-run of `power`; no schema change. |
| The first publish after PR I meets an old `storms.json`. | The three keys are optional in the schema, and `merge_entries` defaults them to null (section 5.4). O10a pins it. |
| A cron host on Windows renames over an open file. | `write_atomic` already holds the Windows rule from `docs/solutions/`. The ODIN day file has one writer. |
| IODA never answers, or says no. | PR N stays unmerged. The other five PRs carry the feature. |
| IODA restores county signals after 2024. | `--missing` asks again only when no file exists. A manual `internet <date>` rerun picks them up. |
| ODIN changes its schema or goes offline. | The snapshot fails, logs one line, and the next one tries again. A storm date with snapshot gaps shows gaps. |
| ODIN covers more utilities later. | `utilities` lists what each snapshot held; the label follows the data. |
| The cron host misses snapshots during a storm. | Gaps, by the gap rule. The timeline shows them. |
| Warning polygons cross the bbox. | The map shows them whole; MapLibre clips at the viewport. |
| Two choropleths confuse the reader. | One county fill at a time, by design. |
| `county.geojson` rename breaks a cached client. | The outline file is part of the site build, so the build and the file ship together. |

## 13. Decisions for the owner

1. **Scope.** Widen the impact layers to the 8 metro counties (row 11)? Recommended: yes.
   With Harris alone, the county fill is one polygon, and the map says little. Hail,
   scoring, and parcels stay Harris only.
2. **Gap rule.** Draw an absent EAGLE-I step as a gap (row 13)? Recommended: yes. The
   other choice fills zero when the step before a gap holds 5 or fewer customers out.
   That fill fits most small-county gaps: 77 to 88 percent follow such a step. But a gap
   can hide a rise, and Harris has one gap of 17 hours (V3). A gap shows the reader what
   the source holds.
3. **Internet layer** (row 14). Recommended: build PR N, and merge it only after IODA
   answers in writing. Other choices: publish now with attribution, or drop the layer.
   Only 14 of 25 storm dates have a county signal (V8).
4. **ODIN** (row 15). Recommended: publish county totals with attribution and ask ORNL.
   ODIN states no licence, and the totals are sums of the numbers ODIN shows in public.
   This matches the HCAD approach: aggregates while the email is open. The other choice
   holds ODIN data until ORNL answers.
5. **Cron.** Approve the 15-minute ODIN cron line on the cron host?
6. **Programme.** Approve PRs I to N and the owner steps in section 11.3?

### Adopted answers

The autonomous run adopts every recommendation above.

1. Scope: the impact layers cover the 8 metro counties (row 11).
2. Gap rule: an absent step is a gap, never a zero (row 13).
3. Internet layer: PR N is built and merged behind `publish --with-internet`. The nightly run
   passes the flag only when `.env` sets `PUBLISH_INTERNET=1` (row 14). This replaces "hold the
   merge until IODA answers": the default publish ships no IODA data, so the merge is safe, and
   the owner opts in when IODA replies.
4. ODIN: county totals are published with attribution, and the ORNL email stays open (row 15).
5. Cron: the 15-minute ODIN line sits in `scripts/hailprint.cron`. The owner installs it.
6. Programme: PRs I to N are built. The owner steps in section 11.3 stay with the owner.

## 14. Email drafts

IODA (to the contact on the IODA site):

> Subject: Reuse of IODA county signals in a portfolio site
>
> Hello. I build Hailprint, a non-commercial site that maps radar-estimated hail over
> Houston. I want to show the `ping-slash24` signal for 8 Texas counties. The site shows
> it as a ratio to a 7-day baseline, for 14 storm dates in 2023 and 2024. The site
> credits IODA and links to it. It publishes no raw IODA values. Do you permit this use?
> Also, do you plan to restore county signals after mid-2024?

ORNL ODIN (to the ODIN contact on the ORNL opendatasoft portal):

> Subject: Reuse terms for ODIN county outage records
>
> Hello. Hailprint, a non-commercial portfolio site, takes one ODIN snapshot every 15
> minutes for 8 Houston-area counties. It publishes the sum of `metersaffected` per
> county per 15 minutes, with credit to ORNL ODIN. What terms apply to this reuse?

## 15. Out of scope

| Item | Reason |
|---|---|
| IEM local storm report remarks | Free text that holds the forbidden word, and no QC. |
| Warning verification scores | A second scoring system beside the hail score. A v7 candidate. |
| Texas-wide IODA signal for dates without a county signal | A state signal dilutes a metro event. It could mislead. |
| FCC DIRS cell-site outages | Published only for activated events, and not per 15 minutes. |
| Houston 311 calls, road closures, flood gauges | More sources, each with its own terms. v7 candidates. |
| Any claim that hail caused an outage | The data cannot show cause. |
| Replay frames | Still cut (DECISIONS row 8). The time slider moves the impact layers only. |
