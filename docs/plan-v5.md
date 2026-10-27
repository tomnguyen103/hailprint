Copied from the planning scratch on 2026-10-27; the plan of record for PRs A to H. The text below is the approved draft of 2026-10-26. The owner approved item 5 after that draft, and the run built PRs A to H (`docs/WEEK-08.md`). The deploy moved to the prebuilt flow (`scripts/deploy.sh`, `docs/DECISIONS.md` row 10). Where this copy and `docs/DECISIONS.md` differ, DECISIONS wins.

---
title: Hailprint plan v5 (draft for review)
status: approved on 2026-10-26; built as PRs A to H (see the note above).
supersedes: docs/plan-v4.md (all work after week 2; weeks 1 and 2 stand)
mode: one autonomous run, PRs A to H, no weekly cadence
date: 2026-10-26
---

# Hailprint plan v5 (draft)

## 1. Summary

Weeks 1 and 2 prove the core: one 12Z file per storm date, seven nested size classes,
an archive index, 22 candidate days, and parcel counts. The back end is sound. Six
defects and four design gaps need work before the web site. The site becomes a static
workspace with five areas and seven viewer actions. It needs no server and no database.
One autonomous run builds all of it as eight PRs (section 6). The run stops only for
the owner-only steps in section 6.3.

## 2. Audit findings

Severity: High, Medium, Low. Confidence: how sure the audit is that the finding is real.

| # | Area | Finding | Sev | Conf | Proposed fix |
|---|---|---|---|---|---|
| F1 | plot.py | The colour comes from the index of the classes present on the date. The same size class gets a different colour on different dates. | Med | High | Give each `SIZE_CLASSES_MM` index one fixed colour from the hail ramp. Add a test. |
| F2 | swath.py | `write_swaths` calls `to_parquet` and rewrites the metadata in place. It bypasses `files.write_atomic`. A crash can leave a partial file. | Med | High | Route the write through `write_atomic`. Delete the duplicate metadata code. |
| F3 | data/derived | The parcel-count file for 2024-05-28 has no `source`, `product`, or `confidence` keys. It predates the metadata fix. No test checks for the keys. | Low-Med | High | Add a metadata assert to `test_outputs_clean.py`. Run `parcels 2024-05-28` again. |
| F4 | parcels.py | `load_parcels` reprojects every masked parcel to EPSG:4326. The mask is the union of all classes, and the join runs against seven classes. | Med (perf) | Med | Reproject the seven swath rows to EPSG:2278. Use the 0.75 in class as the mask, because the classes nest. Compute the max class per parcel in one join. |
| F5 | reports.py | The report filter uses the county name. Verification with a neighbourhood radius needs reports from nearby counties inside the bbox plus the radius. | Med (design) | High | Filter by a buffer of the county outline, not by name. Keep a `county` column. |
| F6 | candidates.py | The WCM database ends in 2025. No 2026 storm date can become a candidate day. | Med | High | Fill dates after the WCM end from the SPC daily CSVs. Keep the `shortcut:` comment until SPC publishes 2026 WCM data. |
| F7 | mesh.py | `decode` does not check `bitmapPresent`. The current files have no bitmap and missing value 9999. A future file with a bitmap puts 9999 into the top class. | Low | Med | Assert `bitmapPresent == 0`, or mask `missingValue`. Add the check to the decode test. |
| F8 | candidates.py | `harris_days` ignores the WCM `tz` column. All 414,481 rows use tz 3 (CST) today. | Low | High | Assert that all rows use tz 3. Fail loudly on any other value. |
| F9 | tooling | No type checker. | Low | High | Add pyright in basic mode to `make lint`. |
| F10 | __main__.py | Paths depend on the working directory. A run from another folder writes to the wrong place. | Low | High | Resolve paths from the repo root, or add a `--root` option. |
| F11 | __main__.py | A `ValueError` from `decode` shows a raw traceback. | Low | High | Catch `ValueError` in `main` and print one line. |
| F12 | mesh.py | `daily_max` sets attrs two times. | Low | High | Delete the duplicate. |
| F13 | network | S3 and SPC fetches have no retry. | Low | Med | Add a bounded retry with backoff in one helper. |
| F14 | tests | The real-day ingest test fetches SPC over the network. Only `needs_raw_mesh` gates it. | Low | High | Add a `needs_network` marker, or use a cached CSV fixture. |
| F15 | README | README says "live map". No map exists yet. | Low | High | Change the text until the site ships. |
| F16 | legal | The HCAD reuse email is a draft. The reuse terms are unknown. | Med (risk) | High | Publish ZIP-level aggregates only. Publish no parcel geometry until HCAD replies. |
| F17 | legal | The employer IP clause is an open item. | Med (risk) | Med | Close it before the public launch. |

Research notes:

- MRMS v12.1 to v12.3.1 makes no change to the MESH algorithm (NWS SCN 26-07, NSSL).
- Static sites with GeoParquet, DuckDB-WASM, and MapLibre are a documented pattern
  (Development Seed, October 2025). Hailprint needs less: one per-storm swath file is
  about 14 KB, so the swaths need no tile build.

## 3. Site architecture

- Vite, TypeScript, and MapLibre GL. Static files only.
- A new command `hailprint publish` writes `site/data/`:
  - `storms.json`: one row per storm date with report count, max size, and receipts.
  - `storms/<date>/swath.geojson`: the seven size classes.
  - `storms/<date>/reports.geojson`: SPC reports inside the bbox plus the radius.
  - `storms/<date>/zip-counts.json`: parcel counts per ZIP code and size class.
  - `storms/<date>/pairs.json`: each report with its distance to each size class.
    The browser recomputes POD, FAR, CSI, and HSS from this file.
- The basemap is one PMTiles file. Parcel tiles wait for the HCAD reply (F16).
- The local cron job deploys `dist/` to Vercel with `vercel deploy dist --prod`. GitHub
  Actions stay disabled.
- The site URL is `hailprint.tomnguyen.me`. A CNAME record in Netlify DNS points it to
  Vercel.
- The Vercel project `hailprint` links to the GitHub repo `tomnguyen103/hailprint`. A push to
  `main` starts a Vercel build. The ignored build step `test ! -f site/package.json` skips
  the build until PR E adds `site/`. PR E sets the root directory to `site`.
- Open decision: a Git build does not have `site/data/`, because the cron job makes it. A Git
  build can replace a production deployment that has data. PR H chooses one data path.
- Every published number carries a receipt: source, product, file name, run time, and
  confidence band.

## 4. Information architecture

Top bar: wordmark, five route tabs, theme toggle, source link. Mobile below 768 px:
a bottom bar with five labelled icons.

| Area | Archetype | Purpose | Sub-routes |
|---|---|---|---|
| Storms | analytics | Look at one storm date. | Map, Parcels, Score, Data |
| Scorecard | analytics | Compare skill across all storm dates. | Table, Contingency, Threshold curve |
| Try it | editor | Test the method yourself. | Seven actions (section 5) |
| Method | editor | Read how the method works. | Data, Storm date, Size classes, Scoring, Limits |
| Pipeline | monitoring | See the last runs and the archive coverage. | Runs, Archive, Sources |

Storms uses a page-tree scope sidebar (storm dates by year, with a report-count badge)
and an inspector drawer on map click. Each page shows at most 120 words of prose above
the fold. All copy follows ASD-STE100.

Signature elements (`design.md` gives the details): size ruler, storm stamp,
contingency grid, receipt chip, caveat line.

## 5. Viewer actions ("Try it")

| # | Action | What the viewer does | What the viewer learns |
|---|---|---|---|
| A1 | Tune the scorer | Moves the threshold and radius sliders. | POD, FAR, CSI, and HSS change live. A line shows the 0.38 literature ceiling. |
| A2 | Check a point | Clicks the map, or types a lat/lon or a ZIP code. | The radar-estimated size at that point on every storm date. |
| A3 | Guess, then reveal | Places five reports on a blank swath, or guesses the HSS. | The real reports and the real score appear. |
| A4 | Compare two storms | Drags a swipe bar between two storm dates. | How the swath shape and size differ. |
| A5 | Replay a storm | Moves a timeline of the 2-minute MESH frames. | How the daily max builds up. Needs a frame export (PR G). |
| A6 | Run it yourself | Copies the commands. Downloads GeoJSON, CSV, and metadata. | The result is reproducible. |
| A7 | Read the receipt | Opens the chip after any number. | The source, product, file, and confidence band. |

A3 and A5 are stretch items. The run cuts them first if their ticket reaches a recovery
bound.

## 6. Autonomous programme

One go-ahead starts one run. The run builds PRs A to H in order and merges each one.
It stops only on a `feature-pipeline` STOP LIST item. Section 6.3 lists the stops that
this plan expects.

### 6.1 PR sequence

| PR | Scope | Items | Exit check |
|---|---|---|---|
| A | Back-end fixes | F1, F2, F3, F7, F8, F9, F10, F11, F12, F13, F14 | `make lint` (ruff and pyright) and `make test` green. The metadata assert passes on every derived file. |
| B | Data scope | F4, F5, F6 | Parcel run on 2024-05-28 under 32 s, with the same counts as before. Reports carry a `county` column. 2026 dates appear as candidate days. |
| C | Verification (M4) | New `score.py` and `hailprint score`: contingency counts, neighbourhood radius, "unverifiable" class | POD, FAR, CSI, and HSS for all candidate days. A hand check matches on 2 days. A golden-file test holds the counts. |
| D | Publish | `hailprint publish` writes `site/data/` (section 3) | A schema test passes on every file. No owner field and no forbidden word. Every number has a receipt. |
| E | Site shell and Storms | Stitch round S1 to S7, then the other screens and mobile. Vite, TypeScript, MapLibre, PMTiles. Storms with Map, Parcels, Score, Data | `npm run build`, `tsc`, and `vitest` green. Impeccable detector clean. Screenshots at 320, 375, 414, 768, and 1440 px. |
| F | Scorecard and Try it | Scorecard area. A1, A2, A4, A6, A7 | Each action works with the keyboard only. The browser score equals the Python score from the same `pairs.json`. |
| G | Method, Pipeline, stretch | Method and Pipeline areas. A5 frame export. A3 | Prose budget and STE check pass. A5 frames stay inside the size budget. |
| H | Ship preparation | Deploy script (`vercel deploy`), cron entry file, F15 README, final evidence report | A deploy dry run builds `dist/`. The README matches the site. |

Eight PRs use eight CodeRabbit reviews. The free plan allows one review per hour, so
the review budget does not limit the run.

### 6.2 Per-PR loop

Each PR runs the full pipeline: grill, spec, tickets, implement with a red-to-green test
per ticket, audit loop, local gate with both engines, CodeRabbit, squash merge, and
branch delete. The next PR branches from fresh `main` after the merge. The run prints
one receipt line at each PR boundary and continues in the same turn.

### 6.3 Owner-only steps

The run cannot do these steps. It does all other work first, then asks.

1. A one-time `vercel login` on the cron host, or a `VERCEL_TOKEN` environment variable
   (STOP item 1). PR H ends with a dry run. The live deploy waits for the login.
2. Cron install on the host. This is a standing configuration change. PR H writes the
   entry file. The owner installs it.
3. F16 HCAD reply and F17 employer IP clause. These are legal items. The site shows ZIP
   totals only until F16 closes.
4. Public launch. The owner makes the URL public.

### 6.4 Definition of done

- **Done**: PRs A to H merged. The site runs locally on every candidate day. The deploy
  dry run passes.
- **Live**: done, plus owner steps 1, 2, and 4.

### 6.5 Known risks

| Risk | Bounded answer |
|---|---|
| The Stitch API returns no screen ID. | Generate each screen in a new call and read the ID from the response. If that fails, build from `design.md` alone and record it in the PR E receipt. |
| CodeRabbit rate limit. | Follow `pr-workflow`: a refill over 30 minutes lets the local review substitute. |
| A ticket fails three recovery cycles. | STOP item 6. A3 and A5 are cut before that point. |
| Real-data downloads fail. | The F13 retry helper. Tests that need data keep their skip markers. |

## 7. Stitch screen review

Stitch project `6567773575427554988` holds one desktop screen: Storms, Map sub-tab
(`stitch-storms-desktop.jpg`). The layout matches the IA: top bar with five tabs, a
page-tree sidebar by year, a storm stamp, sub-tabs, the map, the size ruler, the
inspector, and the caveat line.

Hallmark and accuracy check. The next edit round fixes these items:

| # | Issue | Fix |
|---|---|---|
| S1 | Stitch invents data that Hailprint does not have: "HOU-SUPERCELL-9528", "Dual-pol runs", "0.5 Tilt" and "1.4 Tilt" tabs, reflectivity, ZDR, CC, KDP. | Remove all of them. MESH is one 2D product per storm date. |
| S2 | "Ground truth delta" and "-7.4% error" overstate what one report shows. | Remove. The Score sub-tab holds verification. |
| S3 | "LSR #4029" and "ALGO v4.2" receipts are not real identifiers. | Use real receipts: "MESH 12Z", "SPC CSV". |
| S4 | The "tennis ball" circle renders as a rounded square. | Draw every ruler mark as a circle. |
| S5 | The caveat line carries extra source text. | Use the exact caveat line from `design.md`. |
| S6 | "Documentation" and "Calibration" links duplicate the Method tab. | Remove them from the sidebar. |
| S7 | The "Sweeps" mini-bar implies radar sweeps. | Show the 24-cell 12Z-to-12Z window only. |

The Stitch API timed out and did not list the screen ID, so the edit round and the
other screens (Scorecard, Try it, Method, Pipeline, mobile) are still to do.

## 8. Decisions for the owner

1. Approve the findings to fix (all, or a subset).
2. Approve the static-site stack and Vercel hosting.
3. Approve the seven viewer actions, and the stretch status of A3 and A5.
4. Approve the design direction in `design.md` and the Stitch screens.
5. Approve the autonomous programme (PRs A to H) and the owner-only steps.

Status: the owner approved items 1 to 5 on 2026-10-26. The run built PRs A to H (`docs/WEEK-08.md`).
