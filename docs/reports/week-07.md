# Week 7 — Method and Pipeline (PR G)

Goal: the last two areas of the site. Method: five reading pages (Data, Storm date, Size classes, Scoring, Limits) from one typed content file, each with one signature figure, and the guess-then-reveal widget for the pooled HSS on the Scoring page. Pipeline: `publish` writes `pipeline.json`; the site shows the run log, the archive coverage per year, and the source list, with three services and the last-run age in the scope sidebar. Plan v5 A5 (replay frames) is cut and recorded.

Oracle: `tests/test_publish.py` validates `pipeline.json` against `src/hailprint/schemas/pipeline.schema.json` and checks `archive_summary` on a hand-built frame, `sources_of` on a list of entries, and `merge_runs` for order, dedupe, and the cap of 50. `src/data/guard.test.ts` runs `guardPipeline` on the same shape. `src/method/prose.test.ts` checks the prose budget on fixed strings at 120 and 121 words and at 25 and 26 words; `src/method/content.test.ts` runs the budget over the shipped content. `src/pipeline/coverage.test.ts` checks the year rows and the total row. `src/method/guess-reveal.test.ts` checks the signed difference. `src/router.test.ts` holds the route literals. The impeccable detector for the mechanical UI gate; `tsc --noEmit`, `vitest run`, and `vite build` for the gate. The browser oracle for the widget is the Scorecard Table HSS of the same class at the default radius.

## Method

- Eight tickets, one commit each, on `feat/pr-g-method-pipeline`: routes and app; the pipeline file; pipeline types, guard, loader, and coverage rows; Method content and the prose budget; the Method page and block renderer; the guess-then-reveal widget; the Pipeline page with the Runs, Archive, and Sources views; docs and evidence.
- `publish` writes `site/data/pipeline.json` after `storms.json` through `validate` and `dumps`. `runs` is newest first, merged with the old file by `run_time`, at most 50. `archive` is `null` without the archive index. `sources` holds one row per source and product with its sorted storm dates. The file carries file names only, never a directory.
- The Method content is one TypeScript file of typed blocks: heading, prose, list, code, figure, caveat. `proseFindings` names every page over 120 words above the fold, every sentence over 25 words, every sentence that starts with an `-ing` form, and every forbidden word. The content test fails on one finding.
- The Method page reuses the Storms workspace and scope classes (`styles/scope.css`, imported by the shared `ScopeDrawer`): the page list in the sidebar with `aria-current="page"`, ArrowDown and ArrowUp focus cycling, Escape to close the drawer, and a 680 px reading column. The figure block renders the receipt chip, the storm stamp, the size ruler, the contingency grid, or the widget; only the figures depend on `storms.json`.
- Guess-then-reveal: seven class picks, a native range from 0 to 1 at step 0.01, and a Reveal button. The actual comes from the shared `usePairsAll` cache through `pooledRows` at the default radius, so the pairs load once per session. A class change returns the widget to the guess state. A null HSS prints an en dash with the hidden sentence.
- Pipeline: the sidebar reads presence in the published file (archive present, a source with "hail", a source with "hcad") and shows the age of `run_time` in minutes, hours, or days. Runs is a table of row buttons with `aria-pressed`, ArrowDown and ArrowUp between rows, and an inspector of the pressed run. Archive is a table per year with a share bar capped at 96 px and a total row in `tfoot`, or the `uv run hailprint index` command when the archive is absent. Sources is one section per row with its storm dates as links.

## Run

```bash
make site                 # cd site && npm ci && npm run check
cd site && npm run check  # tsc --noEmit && vitest run && vite build
uv run hailprint publish  # writes site/data/pipeline.json beside storms.json
node ~/.claude/skills/impeccable/scripts/detect.mjs --json site/index.html site/src
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest -q
```

| Item | Value |
|---|---|
| Storm dates served | 25, from the week-4 `site/data/` |
| Site tests | 197 passed in 21 vitest files (age, content, county, coverage, csv, curve, fetch, format, geo, guard, guess-reveal, pipeline, point-form, pool, prose, rescore, router, ruler, select, stamp, theme) |
| Python tests | 327 passed; ruff, format, and pyright clean, 2026-10-27 |
| Type check | `tsc --noEmit` clean under `strict` with `noUncheckedIndexedAccess` |
| Impeccable detector | exit 0, `[]` findings on `site/index.html` and `site/src` |
| Prose budget | 5 pages, 0 findings at 120 words above the fold and 25 words per sentence |
| Dependencies | unchanged from week 6: preact 10.29.8, vite 8.3.5, typescript 7.0.2, vitest 5.0.5, maplibre-gl 6.16.0 |

## Checks

- `test_publish.py`: `archive_summary` counts the days per year and the days without a 12Z file, and `archive_summary` of an empty archive index is None; `sources_of` groups by source and product with sorted dates; `merge_runs` replaces the same `run_time`, sorts newest first, and caps at 50; the pipeline document validates and carries the confidence band, with and without an archive; the schema refuses a directory in a file name, a missing archive key, and a bad date; `dumps` refuses the forbidden word; the run cap of `pipeline.schema.json` equals `publish.MAX_RUNS`; the SPC product holds "hail" and the HCAD source is `hcad`, the names the site service rule reads.
- `test_publish.py`, audit round 2: `merge_entries` nulls `zip_counts` and `parcel_total` when the ZIP file of an old entry is gone; `index_receipts` reads the pairs receipt and the ZIP receipt of every entry; `read_published` names a file that is not JSON and one that breaks its schema, with the file path before the schema message; the storms schema refuses a file path outside the storm date folder.
- `test_cli.py`: `publish` writes `archive: null` without an archive index and counts the days of a small index; a failed date is absent from the run and from every sources row; a one-date run keeps the sources of every published date; a corrupt `pairs.json` of an earlier run stops the run before the index write with exit 1; a corrupt archive index stops the run before any write with exit 1 and names the file; a deleted `zip-counts.json` of an earlier date nulls its entry and keeps exit 0; a pipeline document that fails its schema keeps the old index and the old pipeline file; a second run that finds `publish.lock` stops with exit 1 and leaves the index and the lock file in place.
- `test_files.py`: `lock` refuses a second holder with RuntimeError and removes the lock file after an exception.
- `guard.test.ts`: `guardPipeline` rejects more than 50 runs, a storm date that is not a date, a `run_time` with a fraction or a word, a negative or fractional count, and a document without the archive key; it accepts `archive: null`; the run cap equals the schema `maxItems`; `GEOJSON_PATH` and `JSON_PATH` accept and reject the same paths as the `$defs` patterns of `storms.schema.json`, and `guardIndex` refuses a pairs path with the geojson extension.
- `pipeline.test.ts`: every service reads missing on an empty file; SPC reads from the product and HCAD from the source. `age.test.ts`: a time that does not parse reads "unknown".
- `prose.test.ts`: 120 words pass and 121 fail; 25 words pass and 26 fail; an `-ing` opener fails; the forbidden word fails in any case and in a code block.
- `content.test.ts`: the shipped content has zero findings; the figures per page are receipt, stamp, ruler, grid plus guess, and none; the Limits page ends with the caveat line.
- `coverage.test.ts`: one year gives one row plus the total; twelve years stay in ascending order before the total; the share is 0 without a 12Z file, 1 for a full year, and 0 for a year without days.
- `guess-reveal.test.ts`: `difference(0.5, 0.38)` is `+0.12`, `difference(0.33, 0.38)` is `-0.05`, the same values give `+0.00`, and a null actual gives an en dash.
- No forbidden word in the `.ts`, `.tsx`, and `.css` files under `site/src` (`tests/test_outputs_clean.py`); the content test covers the Method prose.
- Browser checks for the main session: the widget actual equals the Scorecard Table HSS for the same class at the default radius; the network panel shows each `pairs.json` once across `/scorecard/table` and `/method/scoring`; ArrowDown then Enter in the Runs table presses the next row; `archive: null` shows the index command and the MESH archive dot reads "missing".

## Screenshots

The main session captures every row under `docs/reports/evidence/week-07/` with the file name `<viewport>-<theme>-<route>-<state>.png`, the route slashes as underscores. Every capture checks `scrollWidth == innerWidth` and the console.

| Viewport | Theme | Route | State | File |
|---|---|---|---|---|
| 1920 | light | `/method` | Data page, receipt chip | `1920-light-method-data.png` |
| 1920 | dark | `/method` | Data page | `1920-dark-method-data.png` |
| 1920 | light | `/method/scoring` | revealed, guess and actual | `1920-light-method_scoring-revealed.png` |
| 390 | light | `/method/scoring` | revealed, sidebar as a sheet | `390-light-method_scoring-revealed.png` |
| 1920 | light | `/pipeline` | Runs, newest row pressed | `1920-light-pipeline-runs.png` |
| 1920 | dark | `/pipeline` | Runs | `1920-dark-pipeline-runs.png` |
| 1920 | light | `/pipeline/archive` | coverage table with the total row | `1920-light-pipeline_archive-coverage.png` |
| 390 | light | `/pipeline/archive` | table scrolls inside its container | `390-light-pipeline_archive-coverage.png` |

Slop test on the shipped surface: no KPI card row; no eyebrow or kicker label; no gradient text; no icon-card grid; no nested card; no emoji or Unicode icon; monospace only on dates, numbers, versions, and code; every control names its action; every error names the file and the recovery. Verdict: pass by the detector and the code review; the eight captures above confirm it in the main session.

## Decisions

- A5 replay frames are cut (`docs/DECISIONS.md` row 8): about 720 CONUS GRIB2 files, about 1 GB per storm date. Open item: a cropped tile source.
- `publish` is the one writer of `pipeline.json` (`docs/DECISIONS.md` row 9); `index` stays a Parquet writer.
- The Method content stays one TypeScript file; a Markdown renderer waits for a second author (`shortcut:` in `content.ts`).
- The services dot reads presence in the published file; a freshness rule waits for a cron (`shortcut:` in `pipeline.tsx`).

## Handover

- The `create-map` chunk stands at 1.1 MB over three surfaces; the manual chunk split is still open.
- `point.tsx` and `compare.tsx` each hold a map lifecycle effect; one shared hook is a cleanup candidate.
- The Tune radius slider falls back to 20 km until the first `pairs.json` arrives; `storms.json` could carry `radius_km_max`.
- The Pipeline services read presence only; a cron run can add a freshness rule from `run_time`.
