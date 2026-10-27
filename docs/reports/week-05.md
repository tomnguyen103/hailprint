# Week 5 — site shell and Storms workspace (PR E)

Goal: a static Preact site under `site/` that reads the published files of week 4, with the shell (top bar, scope sidebar, storm stamp, sub-tabs, footer with the appearance control) and the Storms workspace: the map pane with the swath fills, the county line, the ruler legend, and the inspector; the Parcels, Score, and Data panes; the empty, loading, and error states; and the dev harness.

Oracle: `publish.rescore(pairs, R)` for the browser scorer at every whole radius 0 to 20 (ticket 02); `hailprint.county.bbox()` for the padded bbox `(-96.010733, 29.44752, -94.858498, 30.220606)` (ticket 05); the `storms.json` and per-date schemas in `src/hailprint/schemas/` for the guards; the impeccable detector for the mechanical UI gate; `tsc --noEmit`, `vitest run`, and `vite build` for the gate.

## Method

- Six tickets, one commit each, on `feat/pr-e-site`: scaffold and tokens; data layer and rescore port; shell, router, and theme control; Storms workspace with the scope sidebar and the panes; MapLibre map pane; basemap script and docs.
- The data layer fetches `site/data/storms.json` first, then the per-date files, each through a guard that names the file and the first failing field in a `DataError`. The pane shows the file name and the HTTP status, with Retry; the legend and the storm stamp stay.
- `site/src/rescore.ts` is a line-for-line port of `publish.rescore`: scored when `edge_m > R*1000 + EDGE_M`; forecast when `dist_m <= R*1000`. The test fixtures carry values computed by the Python oracle, never by the port.
- The map pane loads MapLibre GL in a lazy chunk. The style holds seven fill layers (one per size class, `--hail-1..7`), the swath outline, the county line, and the report points; the basemap layers come from `@protomaps/basemaps` when `public/basemap.pmtiles` answers a HEAD probe. Without the file the map draws paper and the county outline and shows "No basemap file.". The MapLibre worker is served through a `?url` import, because the Vite dev server and the bundled chunk move the worker away from `import.meta.url`.
- The inspector opens on a map click: position, radar-estimated size (the highest size class under the point, else "below 0.75 in"), the nearest report with its distance, and the receipt chip of `swath.geojson`. Escape and Close return the focus to the map frame. At 1280 px and wider the inspector docks as a column; from 768 px it is a drawer; under 768 px it fills the screen.
- The theme control (System, Light, Dark) lives in the footer. The map re-paints every themed layer from the CSS tokens on a `data-theme` change, so one map instance survives a theme switch and a storm date switch.
- `site/scripts/basemap.sh` extracts the Harris bbox at maxzoom 12 from the Protomaps daily build with the `pmtiles` CLI into a temp sibling and renames it on success. The script exits 1 with one line on stderr when the CLI is absent or the extract fails. No partial file lands.
- `vercel.json` at the repo root: install `cd site && npm ci`, build `cd site && npm run build`, output `site/dist`, and a rewrite of every path without a dot to `/index.html`.

## Run

```bash
make site                 # cd site && npm ci && npm run check
cd site && npm run check  # tsc --noEmit && vitest run && vite build
node ~/.claude/skills/impeccable/scripts/detect.mjs --json site/index.html site/src
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run pytest -q
```

| Item | Value |
|---|---|
| Storm dates served | 25, from the week-4 `site/data/` |
| Site tests | 45 passed in 10 vitest files (rescore, guards, router, stamp, ruler, theme, county, geo) |
| Python tests | 302 passed; ruff, format, and pyright clean, 2026-10-26 |
| Type check | `tsc --noEmit` clean under `strict` with `noUncheckedIndexedAccess` |
| Impeccable detector | exit 0, `[]` findings on `site/index.html` and `site/src` |
| Bundle | `index` 47.86 kB (16.66 kB gzip); `create-map` chunk 1,122.59 kB (303.51 kB gzip); worker asset 519.37 kB; CSS 26.00 kB + 71.33 kB |
| Basemap script | `bash -n` exit 0; exit 1 with one line when `pmtiles` is absent |
| Dependencies | preact 10.29.8, vite 8.3.5, typescript 7.0.2, vitest 5.0.5, maplibre-gl 6.16.0, pmtiles 4.5.0, @protomaps/basemaps 5.7.2 |

The `create-map` chunk exceeds the Vite 500 kB warning. The chunk is lazy: the shell, the Score pane, the Parcels pane, and the Data pane load without it.

## Checks

- `rescore.test.ts` holds the oracle table from `publish.rescore` on the published pairs and matches counts, POD, FAR, CSI, HSS, and `unverifiable_km2`. The week-4 note stands: `skill(1, 1, 0, 0)` gives POD 0.5, CSI 0.5, HSS 0 in both scorers.
- `county.test.ts`: the committed `county.geojson` has more than 100 vertices, every vertex lies inside `HARRIS_BBOX`, and every vertex is at least `PAD_DEG` (0.05) from each bbox edge, which matches `hailprint.county.bbox()`.
- `geo.test.ts`: `nearestReport` and `coveringClass` on hand-built fixtures with known distances.
- Map smoke in Chrome on 2024-05-28: a click inside the quarter class reads `quarter, 1.00 in` with the nearest report `6 NE Jersey Village, 1.50 in, 13.7 km`; a click in the corner reads "below 0.75 in"; a legend toggle sets `aria-pressed` and hides the fill; the `swath-error` scenario shows `swath.geojson: HTTP 500 (harness)` with Retry while the legend and the stamp stay; the date switch to 2024-12-28 keeps one canvas and moves the receipt chip date; the dark theme re-paints the county line; no console error.
- Every published file reaches the browser through a guard; a guard failure names the file and the field. No `innerHTML` in `site/src`. No forbidden word in `site/` or under `docs/reports/evidence/week-05/`.
- `.hallmark/log.json` holds the one entry for this surface with the detector exit code.

### Evidence notes

Preview on port 4173, playwright, 1440x900.

- US-E2.4: tab A toggled dark; tab B loaded with `data-theme=dark`. A second write of `dark` changed nothing.
- US-E2.5: `index.html:33` holds a noscript that names Hailprint. The head script stamps `data-theme` before the bundle runs.
- US-E3.4: ArrowRight moved the focus to Parcels without a URL change. Enter activates the tab with one pushState. Back returned to the previous sub-tab.
- US-E4.4: two date clicks within 200 ms. The URL, the stamp, and the chip all show the last date. The page holds one canvas.
## Screenshots

A playwright-core script drives the installed Chrome against `vite preview` of the production build and saves every row under `docs/reports/evidence/week-05/`. The file name is `<viewport>-<theme>-<route>-<state>.png` with the route slashes as underscores. Three extra captures at 1920 and 390 wide carry the `audit` state for the audit loop. Every capture measured `scrollWidth == innerWidth` and logged no console error. The empty-parcels row comes from a preview copy of `storms.json` with `files.zip_counts` set to null for 2021-03-17; the published file is unchanged.

| Viewport | Theme | Route | State | What it shows |
|---|---|---|---|---|
| 1440 | light | `/storms/2024-05-28/map` | inspector open | docked inspector column, seven fills, county line, legend |
| 1440 | dark | `/storms/2024-05-28/map` | inspector open | the same with the dark tokens |
| 1440 | light | `/storms/2024-05-28/score` | default radius | contingency table and the four metrics |
| 1440 | dark | `/storms/2024-05-28/score` | default radius | the same with the dark tokens |
| 1440 | light | `/storms/2024-05-28/parcels` | counts | per-class and per-ZIP counts |
| 1440 | light | `/storms/2024-05-28/data` | files | the four files as links with their receipt |
| 1280 | light | `/storms/2024-05-28/map` | inspector open | the inspector docks and the map frame narrows |
| 768 | light | `/storms/2024-05-28/map` | inspector open | the scope rail and the drawer inspector |
| 414 | light | `/storms/2024-05-28/map` | legend | legend inside the frame, no horizontal scroll |
| 375 | dark | `/storms/2024-05-28/map` | inspector open | the full-screen inspector |
| 320 | light | `/storms/2024-05-28/score` | default radius | the table scrolls inside its container; the page has no horizontal scroll |
| 1440 | light | `/storms/1999-01-01/map` | not found | "No storm date 1999-01-01 is published." with the link to the newest date |
| 1440 | light | `/storms/<date without parcels>/parcels` | empty | the empty state for a date where `parcels` did not run |
| 1440 | light | `/storms/2024-05-28/map` | theme control | the footer appearance group with the three options |

Slop test on the shipped surface: no KPI card row; no eyebrow or kicker label; no gradient text; no emoji or Unicode icon; shadow only on the receipt pop and the inspector; monospace only on dates, numbers, and code; one authored motion (the fit on a date change, off under reduced motion); every control names its action; every error names the file and the recovery. Verdict: pass.

## Vercel (owner only)

1. Import the repository in the Vercel dashboard with the root directory at the repo root.
2. Keep the ignored build step `test ! -f site/package.json`; `vercel.json` supplies the install, build, and output fields.
3. Deploy from a machine that holds `site/data/` (PR H wires the data upload). Without the folder the deploy serves "No storm date is published yet."
4. Run `site/scripts/basemap.sh` once per deploy machine when the basemap is wanted; the file is gitignored.

## Decisions

- One map instance per workspace; a date or theme change updates sources and paint, never the instance.
- The inspector is a dialog with a labelled title, not a modal: the map stays interactive behind the docked column.
- The basemap is optional at every layer: probe, style, and script. The site never fails on its absence.
- `@types/node` entered the dev dependencies for the Vite config types. No other dependency beyond the ticket list.
- The pane viewport in the Claude desktop app freezes `requestAnimationFrame` while hidden, so the map smoke ran in Chrome. The screenshots in the table above come from the main session.

## Handover to PR F

- `/scorecard` and `/try` are placeholder areas in `site/src/areas/`. PR F builds the pooled scorecard and the radius slider over `rescore.ts` and the per-date `pairs.json`.
- `site/src/rescore.ts` exports the port of `publish.rescore`; the oracle fixtures live in `rescore.test.ts`.
- The scope sidebar lists every storm date from `storms.json`; PR F reads the same index for the pooled table.
- The `create-map` chunk size stands at 1.1 MB. A manual chunk split or a lighter basemap style is a PR G option.
