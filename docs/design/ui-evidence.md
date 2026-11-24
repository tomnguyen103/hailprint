head: 510ef114115467de4013d4956e107ee9970b291d

# UI evidence

This file is the capture receipt for the shell standard (`docs/design/ui-update-plan.md`, T11).
Each row names one render state at 375, 1280, and 1920 px and the `design.md` section that it is compared with.
The captures sit under `docs/design/captures/batch-b/`. Batch A captures sit under `docs/design/captures/batch-a/`.
Line 1 names the commit that the captures show.

## Method

- Browser: Playwright Chromium against the Vite dev server with the local `site/data/`.
- Viewports: 375x812, 1280x800, and 1920x1080.
- Loading: every storm data request is held open, so the skeleton stays on screen.
- Error: `pairs.json` answers HTTP 500.
- Rail: `localStorage["hailprint-sidebar"]` is `collapsed`. The rail exists only at 768 px and wider.
- Drawer: the hamburger is clicked at 375 px.

## Captures

| State | Route | 375 | 1280 | 1920 | design.md section |
| --- | --- | --- | --- | --- | --- |
| live | `/live` | `batch-b/live-375.png`, pass | `batch-b/live-1280.png`, pass | `batch-b/live-1920.png`, pass | Shell; Signature elements; information budget 119/120 words |
| storms-map | `/storms/2024-05-28/map` | `batch-b/storms-map-375.png`, pass | `batch-b/storms-map-1280.png`, pass | `batch-b/storms-map-1920.png`, pass | Shell; Hail ramp; Impact tokens |
| storms-parcels | `/storms/2024-05-28/parcels` | `batch-b/storms-parcels-375.png`, pass | `batch-b/storms-parcels-1280.png`, pass | `batch-b/storms-parcels-1920.png`, pass | Shell; Shape and density |
| storms-score | `/storms/2024-05-28/score` | `batch-b/storms-score-375.png`, pass | `batch-b/storms-score-1280.png`, pass | `batch-b/storms-score-1920.png`, pass | Shell; Shape and density |
| storms-data | `/storms/2024-05-28/data` | `batch-b/storms-data-375.png`, pass | `batch-b/storms-data-1280.png`, pass | `batch-b/storms-data-1920.png`, pass | Shell; Copy and domain rules |
| scorecard-table | `/scorecard/table` | `batch-b/scorecard-table-375.png`, pass | `batch-b/scorecard-table-1280.png`, pass | `batch-b/scorecard-table-1920.png`, pass | Shell; Shape and density |
| scorecard-grid | `/scorecard/grid` | `batch-b/scorecard-grid-375.png`, pass | `batch-b/scorecard-grid-1280.png`, pass | `batch-b/scorecard-grid-1920.png`, pass | Shell; Shape and density |
| scorecard-curve | `/scorecard/curve` | `batch-b/scorecard-curve-375.png`, pass | `batch-b/scorecard-curve-1280.png`, pass | `batch-b/scorecard-curve-1920.png`, pass | Shell; Type |
| try-tune | `/try/tune` | `batch-b/try-tune-375.png`, pass | `batch-b/try-tune-1280.png`, pass | `batch-b/try-tune-1920.png`, pass | Shell; Type (stat values in Sans) |
| try-point | `/try/point` | `batch-b/try-point-375.png`, pass | `batch-b/try-point-1280.png`, pass | `batch-b/try-point-1920.png`, pass | Shell; Shape and density |
| try-compare | `/try/compare` | `batch-b/try-compare-375.png`, pass | `batch-b/try-compare-1280.png`, pass | `batch-b/try-compare-1920.png`, pass | Shell; Type (stat values in Sans) |
| try-run | `/try/run` | `batch-b/try-run-375.png`, pass | `batch-b/try-run-1280.png`, pass | `batch-b/try-run-1920.png`, pass | Shell; Shape and density |
| method-data | `/method/data` | `batch-b/method-data-375.png`, pass | `batch-b/method-data-1280.png`, pass | `batch-b/method-data-1920.png`, pass | Shell; Type (16 px reading column) |
| method-storm-date | `/method/storm-date` | `batch-b/method-storm-date-375.png`, pass | `batch-b/method-storm-date-1280.png`, pass | `batch-b/method-storm-date-1920.png`, pass | Shell; Type (16 px reading column) |
| method-size-classes | `/method/size-classes` | `batch-b/method-size-classes-375.png`, pass | `batch-b/method-size-classes-1280.png`, pass | `batch-b/method-size-classes-1920.png`, pass | Shell; Hail ramp |
| method-scoring | `/method/scoring` | `batch-b/method-scoring-375.png`, pass | `batch-b/method-scoring-1280.png`, pass | `batch-b/method-scoring-1920.png`, pass | Shell; Type (16 px reading column) |
| method-limits | `/method/limits` | `batch-b/method-limits-375.png`, pass | `batch-b/method-limits-1280.png`, pass | `batch-b/method-limits-1920.png`, pass | Shell; Copy and domain rules |
| method-impacts | `/method/impacts` | `batch-b/method-impacts-375.png`, pass | `batch-b/method-impacts-1280.png`, pass | `batch-b/method-impacts-1920.png`, pass | Shell; Impact tokens |
| pipeline-runs | `/pipeline/runs` | `batch-b/pipeline-runs-375.png`, pass | `batch-b/pipeline-runs-1280.png`, pass | `batch-b/pipeline-runs-1920.png`, pass | Shell; Shape and density |
| pipeline-archive | `/pipeline/archive` | `batch-b/pipeline-archive-375.png`, pass | `batch-b/pipeline-archive-1280.png`, pass | `batch-b/pipeline-archive-1920.png`, pass | Shell; Shape and density |
| pipeline-sources | `/pipeline/sources` | `batch-b/pipeline-sources-375.png`, pass | `batch-b/pipeline-sources-1280.png`, pass | `batch-b/pipeline-sources-1920.png`, pass | Shell; Shape and density |
| not-found | `/nope` | `batch-b/not-found-375.png`, pass | `batch-b/not-found-1280.png`, pass | `batch-b/not-found-1920.png`, pass | Shell; Copy and domain rules |
| loading | `/storms/2024-05-28/score (data held)` | `batch-b/loading-375.png`, pass | `batch-b/loading-1280.png`, pass | `batch-b/loading-1920.png`, pass | Shell; Shape and density (skeleton) |
| error | `/storms/2024-05-28/score (pairs.json 500)` | `batch-b/error-375.png`, pass | `batch-b/error-1280.png`, pass | `batch-b/error-1920.png`, pass | Shell; Copy and domain rules |
| rail | `/storms/2024-05-28/score` | not applicable | `batch-b/rail-1280.png`, pass | `batch-b/rail-1920.png`, pass | Shell; Sanctioned deviations (56 px rail) |
| drawer | `/storms/2024-05-28/score` | `batch-b/drawer-375.png`, pass | not applicable | not applicable | Shell (288 px modal drawer) |

## Measurements

| Check | Rule | Result |
| --- | --- | --- |
| Tap targets | 24x24 px at 1280; 44x44 px at 375; inline prose links exempt (WCAG 2.5.8) | 0 offenders on 21 routes at both widths |
| Primary region | one `[data-primary-region]` per area, top edge above 40 % of the viewport at 1280x800 | 7 of 7 areas pass: live 205 px, storms score 299 px, storms map 299 px, scorecard 295 px, try 183 px, method 80 px, pipeline 121 px |
| Information budget | under 120 words above the fold on `/live` at 1280x800 | 119 words; the "radar-estimated hail size" wording is present |
| Stale age copy | ages of 60 min and more in hours, 24 h and more in days | the badge reads "stale 21 d ago" |
| Focus ring | 2 px solid primary outline, 2 px offset | `a` on `/scorecard/table`: 2px solid, offset 2px, rgb(30, 58, 138) |
| Tune curve targets | each marker centre on `/try/tune` hits its own marker (`elementFromPoint`) at 1024, 1100, 1279, 1280, 1440, and 1920 px | 7 of 7 markers at all 6 widths; the panes stack below 1280 px (`batch-b/try-tune-1024.png`) |
| Impeccable detector | exit 0 on `site/src` | exit 0 |

Computed fonts at 1280x800 (`getComputedStyle`, first family):

| Route | Selector | Count | Font | Numeric |
| --- | --- | --- | --- | --- |
| `/live` | `.live-stat-value` | 5 | IBM Plex Sans | tabular-nums |
| `/live` | `.live-freshness` | 1 | IBM Plex Sans | tabular-nums |
| `/try/tune` | `.stat` | 8 | IBM Plex Sans | tabular-nums |
| `/try/compare` | `.metric-cell strong` | 5 | IBM Plex Sans | tabular-nums |
| `/storms/2024-05-28/score` | `.outcome-badge` | 10 | IBM Plex Sans | tabular-nums |
| `/storms/2024-05-28/map` | `.badge` | 25 | IBM Plex Sans | tabular-nums |
| `/storms/2024-05-28/map` | `.county-tag` | 8 | IBM Plex Sans | tabular-nums |
| `/storms/2024-05-28/map` | `.warning-tag` | 1 | IBM Plex Sans | tabular-nums |
| `/scorecard/table` | numeric table cells | 21 | IBM Plex Mono | tabular-nums |

## Known gaps

- At 1920 px, the per-class score table on `/storms/<date>/score` spreads its 4 columns across the pane. The table keeps `width: 100%`. A column cap is a recorded follow-up.
- At 375 px, the run log on `/pipeline/runs` scrolls sideways inside `.table-scroll`. The page itself does not scroll sideways.
- The compare map on `/try/compare` draws no tiles and no swath in the capture: each MapLibre canvas stays 300 px tall inside the 640 px frame. Main d83bee6 shows the same result, so batch B did not cause it. It is a recorded follow-up.
