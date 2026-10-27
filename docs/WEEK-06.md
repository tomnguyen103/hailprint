# Week 6 — Scorecard and Try it (PR F)

Goal: the two remaining areas of the site over the published files of week 4. Scorecard: the pooled table over every storm date at one scoring radius, in a Table view, a Grid view (contingency grid per size class), and a Curve view (threshold curve of one metric). Try it: four tools, Tune the scorer (scope, scoring radius slider, threshold slider, metric row, grid, curve), Check a point (point-in-polygon over every swath), Compare two storms (swipe compare over two synced maps), and Run it yourself (commands with Copy, file links, table CSV).

Oracle: `site/scripts/pool_golden.py` writes `site/data/pooled-golden.json`, the pooled table at every whole radius from `publish.rescore` and the Python `score.pool` rule; `src/pool.test.ts` matches the browser pool against it and against the `storms.json` tables at the default radius. Hand-built geometry in `geo.test.ts` for `containsPoint` and `coveringAt`. `HARRIS_BBOX` for the point hint literal. Spec literals for the CSV header, the file name, and the slider texts. The impeccable detector for the mechanical UI gate; `tsc --noEmit`, `vitest run`, and `vite build` for the gate.

## Method

- Eight tickets, one commit each, on `feat/pr-f-scorecard-try`: routes and sub-tabs; pool module and radius slider; Table and Grid views; threshold curve; Tune tool; Check a point; Compare two storms; Run it yourself with the CSV, the glossary, and the docs.
- Every per-date file reaches the browser through one module cache (`state/pairs-all.ts`): one fetch per path per session, `Promise.allSettled` over the set, and Retry refetches only the paths that failed. Scorecard pools the 25 `pairs.json`; Check a point and Compare read the 25 `swath.geojson` through the same cache.
- The pooled table sums hits, misses, false alarms, correct negatives, swath area, and unverifiable area across storm dates at one radius and recomputes POD, FAR, CSI, and HSS from the sums. `skill()` returns null on a zero denominator; the views print an en dash with a hidden sentence.
- The threshold curve is one SVG with pure scales in `scorecard/curve.ts`: y from 0 to 1, x over the seven size classes in inches, a 2 px ink line, 8 px accent markers with a sheet ring, one tooltip shared by hover and focus, markers reachable by Tab and the arrow keys, and the dashed literature line at HSS 0.38 on the HSS view only.
- Check a point: `containsPoint` is an even-odd ray cast with the half-open edge test, so a vertex gives one fixed answer; `coveringAt` returns the largest size class that holds the point. The point lives in state; the table derives from it with no async step. The map draws the newest swath and takes a click as a point.
- Compare: two MapLibre maps in one frame, the right one clipped at the split with `clip-path`. A native range labelled Swipe spans 22 px past each frame edge so the 44 px thumb centre sits on the 2 px split line at 0 % and 100 %. Each map follows the other through `jumpTo` under a syncing flag.
- Run it yourself: five commands with Copy through `navigator.clipboard.writeText`, "Copied" for 1.5 s with one shared polite live region, and the "Select and copy" fallback through `Range` when the API is absent or refuses. The table CSV comes from `pool([rescore(pairs, R)], [scoredCount(pairs, R)])` at the default radius as a Blob named `score-<date>-R<R>.csv`.

## Run

```bash
make site                 # cd site && npm ci && npm run check
cd site && npm run check  # tsc --noEmit && vitest run && vite build
uv run python site/scripts/pool_golden.py
node ~/.claude/skills/impeccable/scripts/detect.mjs --json site/index.html site/src
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest -q
```

| Item | Value |
|---|---|
| Storm dates served | 25, from the week-4 `site/data/` |
| Site tests | 139 passed in 14 vitest files (pool, curve, point-form, csv, geo, router, rescore, guards, stamp, ruler, theme, county, select, sub-tabs) |
| Python tests | 302 passed; ruff, format, and pyright clean, 2026-10-26 |
| Type check | `tsc --noEmit` clean under `strict` with `noUncheckedIndexedAccess` |
| Impeccable detector | exit 0, `[]` findings on `site/index.html` and `site/src` |
| Bundle | `index` 70.57 kB (23.10 kB gzip); `create-map` chunk 1,122.87 kB (303.61 kB gzip); worker asset 519.37 kB; CSS 30.80 kB + 71.33 kB |
| Dependencies | unchanged from week 5: preact 10.29.8, vite 8.3.5, typescript 7.0.2, vitest 5.0.5, maplibre-gl 6.16.0 |

## Checks

- `pool.test.ts`: the browser pool equals the Python golden at every whole radius and sums to the `storms.json` tables at the default radius; one table pools to itself with the given report count.
- `curve.test.ts`: `xOf` and `yOf` hit the margins at the domain ends; `pathOf` breaks the line at a null metric and gives an empty path when every metric is null.
- `geo.test.ts`: a square with a hole (centre outside, between hole and ring inside, far point outside), a MultiPolygon of two squares, the unit-square vertex (0,0) inside under the half-open test, and `coveringAt` over two nested classes.
- `point-form.test.ts`: `parsePoint("29.76", "-95.37")` gives `[-95.37, 29.76]`; out-of-bbox, non-numeric, and empty text give null; `POINT_HINT` equals the spec literal.
- `csv.test.ts`: the header literal, a null metric as an empty cell, LF line ends with a trailing newline, and a quoted label with a comma or a quote.
- No forbidden word under `site/src`, `GLOSSARY.md`, or this file. Every table and metric row in Scorecard and Try it carries a receipt chip: Table view (one per row), Grid view, Curve view, Tune metric row, Check a point (one per storm date), Run it yourself (beside the CSV button).
- Browser checks ran in the main session with playwright-core 1.60 and the installed Chrome against the Vite dev server on port 5173. Results: the console on `/try/compare` holds no MapLibre error; the compare stage holds two canvases and zero after a route change to Run, so both maps are destroyed; the swipe is the seventh Tab stop after the Storm date B select (the eighth with the error overlay's Retry); Home and End move the swipe to 0 and 100 and the clip to `inset(0 0 0 0%)` and `inset(0 0 0 100%)`; Enter on Copy writes `uv run hailprint ingest 2026-08-28` to the clipboard, flips the label to Copied, and the live region announces Copied once; with no clipboard API the label reads Select and copy and the command text is selected; End on the threshold slider reads 2.50 in; a zero-scored date in Tune draws an en dash per metric with the hidden sentence `undefined, zero denominator`; the point form marks an out-of-county point `aria-invalid` with the hint; a map click fills lat 29.8360 and lon -95.4346. The only console line across every route is one `404 (Not Found)` on the first Scorecard load from the basemap HEAD probe (carried PR E item, no basemap file in dev).

## Screenshots

The main session captured every row under `docs/evidence/week-06/` with the file name `<viewport>-<theme>-<route>-<state>.png`, the route slashes as underscores. Every capture checked `scrollWidth == innerWidth` (27 of 27 pass) and the console (empty except the one basemap probe line above).

| Viewport | Theme | Route | State | File |
|---|---|---|---|---|
| 1920 | light | `/scorecard/table` | R 5 | `1920-light-scorecard_table-r5.png` |
| 1920 | dark | `/scorecard/table` | R 5 | `1920-dark-scorecard_table-r5.png` |
| 1920 | light | `/scorecard/grid` | quarter | `1920-light-scorecard_grid-quarter.png` |
| 1920 | light | `/scorecard/curve` | HSS, literature line | `1920-light-scorecard_curve-hss.png` |
| 1920 | dark | `/scorecard/curve` | tooltip open | `1920-dark-scorecard_curve-tooltip.png` |
| 390 | light | `/scorecard/table` | table scrolls inside its container | `390-light-scorecard_table-r5.png` |
| 1920 | light | `/try/tune` | All storm dates, R 5, 1.00 in | `1920-light-try_tune-all.png` |
| 1920 | light | `/try/tune` | threshold End, 2.50 in | `1920-light-try_tune-end.png` |
| 1920 | light | `/try/tune` | a date with zero scored reports | `1920-light-try_tune-zero.png` |
| 1920 | light | `/try/tune` | harness one-pairs-error | `1920-light-try_tune-error.png` |
| 390 | dark | `/try/tune` | metric row in two columns | `390-dark-try_tune-all.png` |
| 1920 | light | `/try/point` | 29.76 / -95.37 after Enter | `1920-light-try_point-typed.png` |
| 1920 | light | `/try/point` | after a map click | `1920-light-try_point-click.png` |
| 1920 | light | `/try/point` | invalid point, hint | `1920-light-try_point-invalid.png` |
| 1920 | dark | `/try/point` | harness one-swath-error, marker on the map | `1920-dark-try_point-error.png` |
| 390 | light | `/try/point` | form wraps | `390-light-try_point-typed.png` |
| 1920 | light | `/try/compare` | 50 % | `1920-light-try_compare-50.png` |
| 1920 | light | `/try/compare` | 0 % by Home | `1920-light-try_compare-0.png` |
| 1920 | light | `/try/compare` | 100 % by End | `1920-light-try_compare-100.png` |
| 1920 | light | `/try/compare` | after a pan of A | `1920-light-try_compare-pan.png` |
| 1920 | light | `/try/compare` | same date on both sides | `1920-light-try_compare-same.png` |
| 1920 | dark | `/try/compare` | harness one-swath-error on one half | `1920-dark-try_compare-error.png` |
| 390 | light | `/try/compare` | 50 % | `390-light-try_compare-50.png` |
| 1920 | light | `/try/run` | before Copy | `1920-light-try_run-copy.png` |
| 1920 | light | `/try/run` | after Copy, "Copied" | `1920-light-try_run-copied.png` |
| 1920 | dark | `/try/run` | fallback "Select and copy" | `1920-dark-try_run-fallback.png` |
| 390 | light | `/try/run` | commands wrap | `390-light-try_run-copy.png` |

Slop test on the shipped surface: no KPI card row; no eyebrow or kicker label; no gradient text; no emoji or Unicode icon; shadow only on the receipt pop; monospace only on dates, numbers, and code; motion only on the marker move, the map fit, and the fly to a point, off under reduced motion; every control names its action; every error names the file and the recovery. Verdict: pass, on the 27 captures above.

## Decisions

- `pairs.json` stays radius-free; the pooled table and the CSV re-score in the browser at read time, so `score`, `publish`, and the site agree at every whole kilometre.
- One module cache for every per-date file; Retry refetches only the failed paths.
- The Compare swipe is a native range over the frame with a transparent track and pointer events on the thumb only, so the maps stay pannable outside the handle.
- The Scorecard receipt chip opens the newest `pairs.json` receipt; a pooled receipt is a publish change (`shortcut:` in `scorecard.tsx`).

## Handover to PR G

- The `create-map` chunk stands at 1.1 MB and now serves three surfaces (Map pane, Check a point, Compare); a manual chunk split is the PR G option from week 5.
- `point.tsx` and `compare.tsx` each hold a map lifecycle effect in the `map-pane.tsx` shape; one shared hook is a cleanup candidate.
- The Tune radius slider falls back to 20 km until the first `pairs.json` arrives; `storms.json` could carry `radius_km_max`.