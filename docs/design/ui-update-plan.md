# UI update plan

Audit date: 2026-11-24. Standard: `app-ui-shell` (A1–A12 shell rules, B visual language, C evidence and gates), `default-theme.md` (Corporate Standard v1), and `feature-audit/references/app-ui-review.md` (severity scale). Project contract: `design.md`.

## Summary

The Hailprint site matches the Corporate Standard v1 tokens, and text contrast passes in light mode on 6 routes and in dark mode on 4 routes. No measured route has page-level horizontal scroll, and the impeccable detector reports zero findings. The audit records 34 deviations: 2 HIGH, 12 MEDIUM, and 20 LOW. The HIGH items are tap targets under 24 px: the date links in the `/try/point` table (18 px tall) and the threshold-curve markers (22 px pointer hit circle, 5–8 px focus target). The largest structural gap is the top bar: `design.md` places the brand and the hamburger in the top bar, which the standard reserves for the sidebar header, so several shell findings wait on one owner decision (Open question 1).

## Surface inventory

Evidence method:

- Live measurement in the in-app browser at 375x812 and 1280x800 over 18 routes (storm date 2024-05-28). At 1920x1080, only the `/scorecard/table` scroll width was read; the 1920 captures cover 6 more routes.
- Text contrast through the real theme menu. Light mode: `/live`, `/scorecard/table`, `/storms/2024-05-28/score`, `/try/tune`, `/pipeline/runs`, and `/method/data`. Dark mode: the first 4 of those routes. Zero text pairs under 4.5:1.
- Captures at 1280 and 1920 px under `docs/design/captures/` (6 routes x 2 widths). The 375 px captures are absent: headless Chromium clamps the window to a minimum width wider than 375 px, so its 375 px images clip. The 375 px evidence comes from the in-app browser measurement. The map canvas is blank in the captures; the cause is not verified.
- Source read of `site/src/shell/`, `site/src/styles/`, `site/src/theme.ts`, and `site/public/theme-init.js`.

| Surface | Route | Archetype | Exempt? | Audited via |
|---|---|---|---|---|
| App shell (top bar, route sidebar, main, footer) | all routes | three-pane shell | No | measured + source |
| Live | `/live` | monitoring | No | measured + capture + source |
| Storms map | `/storms/<date>/map`, `/storms/<date>/map/<step>` | analytics | No | measured + capture |
| Storms parcels | `/storms/<date>/parcels` | analytics | No | measured |
| Storms score | `/storms/<date>/score` | analytics | No | measured |
| Storms data | `/storms/<date>/data` | analytics | No | measured |
| Scorecard table, grid, curve | `/scorecard/<table\|grid\|curve>` | analytics | No | measured + capture (table) |
| Try tune, point, compare, run | `/try/<tune\|point\|compare\|run>` | analytics | No | measured + capture (tune) |
| Method pages | `/method/<data\|storm-date\|size-classes\|scoring\|limits\|impacts>` | editor | No | measured (data, scoring) + capture (data) |
| Pipeline runs, archive, sources | `/pipeline/<runs\|archive\|sources>` | monitoring | No | measured + capture (runs) |
| Not found | any unknown path | none | No | measured |
| Root redirect | `/` | none | Yes: redirect only, no UI | note only |
| MapLibre canvas content (basemap, swath fill) | map routes | data rendering | Yes: data visualization, governed by the hail ramp in `design.md` | note only |

## Findings

Severity follows `app-ui-review.md`. Confidence: High = measured, Medium = read from code, Low = inferred. "design.md sanctions" marks a deviation from the standard that `design.md` writes down. A ticket for such a finding waits on the open question that the finding names.

| ID | Rule | Surface | Evidence | Severity | Confidence | Proposed change |
|---|---|---|---|---|---|---|
| F01 | B tap target | `/try/point` | At 375 px, 25 table date links (`a.mono`, for example `/storms/2026-08-28/map/39`) measure 78x18 px. Not inline prose, so the WCAG 2.5.8 inline exception does not apply. | HIGH | High | Give the date-cell links a 24 px minimum height on desktop and 44 px below 768 px (padding or `min-height` with `display: inline-flex`). |
| F02 | B tap target | `/try/tune`, `/scorecard/curve` | The focusable marker is `<circle class="marker" r={MARKER_R}>` with `MARKER_R = 4` (`scorecard/threshold-curve.tsx:7`, `:161`). The marker measures 5x5 px on `/try/tune` and 8x8 px on `/scorecard/curve`. The pointer hit circle `HIT_R = 20` (`:8`) renders at 22x22 px in a 1212 px pane, also under 24 px. The keyboard focus target and its focus ring stay on the 4-unit circle. | HIGH | High | Scale `HIT_R` so the hit circle renders at 24 px or more at every pane width. Move `tabIndex`, `aria-label`, and the focus handlers to that circle, and draw the focus ring on it. Keep the 4-unit circle as the visual marker. |
| F03 | A11 primary region | all 18 routes | `document.querySelector('[data-primary-region]')` returns null on every route; a source search finds zero uses. | MEDIUM | High | Add `data-primary-region` to the main data region of each area (map pane, table, curve, live stats, reading column, run log). |
| F04 | A12 information budget | `/live` | 120 words above the fold at 1280x800. The budget is under 120 words. | MEDIUM | High | Cut the fold copy by at least 10 words, for example the per-county strip labels or the window line. |
| F05 | A1/A5 header links | top bar, all routes | Two links in the header sit outside a breadcrumb: the wordmark (`href="/"`) and the source-code link (`a.icon-button`). design.md sanctions the wordmark. | MEDIUM | High | Move the wordmark to the sidebar header (Open question 1). Move the source link out of the header (Open question 4). |
| F06 | A3 hamburger placement | top bar | `top-bar.tsx` renders the hamburger in the top bar left zone. The standard places it in the sidebar header, left of the brand. design.md sanctions this ("far-left single hamburger toggle"). | MEDIUM | Medium | Move the hamburger and the brand into a sidebar header row (Open question 1). |
| F07 | B tap target (<768 px) | `/try/point` | At 375 px, `.button-primary` measures 69x40, `.button` 105x40 and 86x40, and six `.button-small` presets 103–168x40. The shell rule at `shell.css` (`width < 768px`) sets 44 px, but a more specific rule under `.point-form` / `.point-presets` wins. | MEDIUM | High | Make the `try.css` point rules keep the 44 px minimum below 768 px. |
| F08 | B tap target (<768 px) | top bar, all routes | At 375 px, the wordmark link measures 101x40. | MEDIUM | High | Give the wordmark link a 44 px minimum height below 768 px, or move it per Open question 1. |
| F09 | B tap target (<768 px) | `/pipeline/runs`, `/pipeline/sources`, `/storms/<date>/map`, `/method/*`, not found | At 375 px: `.row-pick` 158x40 (x10), source `a.mono` 78x40, `.inspector-try-link` 125x40, method page-list links 343x40 (x6), not-found link 45x40. | MEDIUM | High | Set a 44 px minimum height below 768 px on these controls. |
| F10 | B tap target (<768 px) | sub-tabs on storms, scorecard, try, pipeline | At 375 px, sub-tab links are 44 px tall but 29–41 px wide (for example "Run" 29x44, "Map" 31x44). | MEDIUM | High | Give `.sub-tabs a` a 44 px minimum width below 768 px. |
| F11 | A4 L3 route tabs | storms, scorecard, try, pipeline | `shell/sub-tabs.tsx` renders `role="tablist"` with `role="tab"` links, `aria-selected`, and `aria-controls`. Route-level tabs need `<nav aria-label>` with links and `aria-current="page"`; tab roles are for L4 in-page tabs only. | MEDIUM | Medium | Render `SubTabs` as `<nav aria-label="…">` with `aria-current="page"` on the active link. Remove the `tabpanel` wiring that only serves the tab roles. Update the shell tests. |
| F12 | A7 theme default | theme | `theme.ts` and `public/theme-init.js` resolve an unset value to light. The standard default is System. Commit #51 made light an owner choice. | MEDIUM | Medium | Per Open question 2: keep light and record it in `design.md`, or switch the unset value to System. |
| F13 | A9 loading state | all data views | `shell/states.tsx` `LoadingState` renders a text line ("Load {file}…"), not a skeleton of the target layout. | MEDIUM | Medium | Render a skeleton block that matches the target region (table rows, stat cells, map frame). Keep the text for screen readers. |
| F14 | C1 evidence receipt | repo | No `docs/design/ui-evidence.md` exists, so no UI diff has a capture receipt. | MEDIUM | High | Add `docs/design/ui-evidence.md` with the 375/1280/1920 capture table and the `design.md` comparison per render state. |
| F15 | A2 sidebar header | route sidebar | `route-sidebar.tsx` has no header row and no brand; the first child is the route nav. Linked to F06. | LOW | Medium | Add a sidebar header row with the hamburger and the brand (Open question 1). |
| F16 | A3 hamburger label | top bar | `aria-label` is "Collapse navigation" / "Expand navigation" (desktop) and "Open navigation" / "Close navigation" (mobile). The standard label is "Collapse sidebar" / "Expand sidebar". | LOW | High | Change the desktop labels to "Collapse sidebar" / "Expand sidebar". |
| F17 | A2 nav landmark name | route sidebar | `aside` has `aria-label="Primary navigation"` and the inner `nav` has `aria-label="Workspace areas"`. The standard names the nav "Primary". | LOW | Medium | Name the `nav` "Primary" and remove the duplicate name from the `aside`. |
| F18 | A2 nav source | route sidebar | The nav renders from a flat `AREAS` array. The standard asks for one nav config tree that the sidebar and search share. | LOW | Low | No change while the site has one level of areas. Record the flat array as sufficient in `design.md`. |
| F19 | A5 cluster order | top bar | The tools zone renders the theme control, then the source link. The standard order puts a secondary action first, before the theme control. | LOW | High | Remove the source link from the cluster (Open question 4) or put it before the theme control. |
| F20 | A5 page title zone | top bar | `span.top-bar-area` shows the area name as a muted chip. It repeats the page `h1` and the active sidebar row and is not a breadcrumb. | LOW | Medium | Replace the chip with a breadcrumb (area > page), or remove it. |
| F21 | A5 search trigger | top bar | The trigger has `aria-label="Search"`, `aria-expanded`, and `aria-haspopup="dialog"`, but no `role="combobox"`, which `search.md` asks for. | LOW | Medium | Follow `search.md`: put `role="combobox"` on the trigger, or record the dialog pattern as the project choice in `design.md`. |
| F22 | A9 not-found heading | not found | The unknown-route view renders `EmptyState` with no `h1`. | LOW | High | Add a `PageHeader` with an `h1` ("Page not found") above the empty state. |
| F23 | A10 fixed widths | try, scorecard, storms, states | Fixed caps on app surfaces: `.try-controls > *` 480 px, `.metric-row` 640 px, `.curve` 640 px, `storms.css:242` 480 px, `.state` 680 px, `.live-status` 68ch. The method `.reading` 680 px cap is the editor reading column and passes. | LOW | Medium | Keep caps on single form controls and prose. Remove the caps on the metric row and the curve so that they fill the pane. |
| F24 | A10 wide tables | `/scorecard/table` at 1920 px | The 4-column table fills 1616 px. The class label and the numbers sit far apart (`captures/scorecard-table-1920.png`). | LOW | Medium | Size the numeric columns to their content and let the label column take the rest, or set a table width that matches the column count. Do not cap the content region. |
| F25 | B control height | buttons, inputs, search trigger | `.button`, `.button-small`, and `.search-trigger` are 40 px tall. Comfortable density sets 36 px controls. The review rule rates a 24–39 px desktop target as MEDIUM, so 36 px creates a new MEDIUM finding. | LOW | High | Per Open question 3: keep 40 px and record it in `design.md`. |
| F26 | B button padding | buttons | `.button` uses `padding: 0 14px`; `.button-small` uses `0 12px`. The standard is 16 px horizontal padding. | LOW | High | Set the horizontal padding to 16 px. |
| F27 | B 8 px grid | shell | Off-grid values in `shell.css`: `.top-bar-left` gap 10 px, `.route-link` padding 0 10 px and gap 10 px, `.site-main` gap 20 px, `.button` gap 6 px. | LOW | High | Move each value to the 4/8 px grid (8, 16, 24; 4 for icon gaps). |
| F28 | B mono scope | `/live`, `/try/tune` metric values | `.live-stat-value` uses `500 24px var(--font-mono)` (`live.css:128`); the try metric values also render in mono at large size. The standard reserves mono for code and IDs. design.md widens mono to "dates, IDs, coordinates, and numeric tables" but not stat values. | LOW | High | Render stat values in IBM Plex Sans with `tabular-nums` (Open question 5). |
| F29 | B mono scope | badges, map tags, outcome badges | Mono on `.badge` counts (`scope.css:134`), `.county-tag` and `.warning-tag` (`map.css:156`, `:287`), and `.outcome-badge` (`storms.css:308`). These are counts and labels, not dates, IDs, or table cells. | LOW | Medium | Render these in IBM Plex Sans with `tabular-nums` (Open question 5). |
| F30 | Copy | `/live` status badge | The stale badge reads "Stale 30187 min ago" (`live/live-view.tsx:29`). A large age in raw minutes is hard to read. | LOW | High | Format ages of 60 min and more as hours, and 24 h and more as whole days ("Stale 20 d ago"). |
| F31 | B tap target | `/storms/<date>/data` | At 1280 px, an inline link measures 25x19 px. It sits in prose, so the WCAG 2.5.8 inline exception applies. | LOW | High | No change while the link stays inline in a sentence. |
| F32 | B row height | route sidebar | `.route-link` rows are 40 px tall. Comfortable density sets 44 px nav and table rows. | LOW | High | Set `.route-link` to a 44 px minimum height. |
| F33 | A2 sidebar footer | route sidebar | The sidebar has no bottom section (settings, sign-out). The site has no accounts, so the section has no content. | LOW | High | No change. Record "no accounts, no sidebar footer" in `design.md`. |
| F34 | B type scale | `/method/*` | Method body text is 16 px; the standard app body is 14 px. design.md sanctions this ("`16px` body on `/method/*` reading pages"). | LOW | High | No change; the editor reading column keeps 16 px. |

Rule coverage: A1 finding (F05); A2 finding (F15, F17, F18, F33); A3 finding (F06, F16); A4 finding (F11); A5 finding (F05, F19, F20, F21); A6 not identified in the checks of this audit; A7 finding (F12); A8 pass; A9 finding (F13, F22); A10 finding (F23, F24); A11 finding (F03); A12 finding (F04); B finding (F01, F02, F07–F10, F25–F29, F31, F32, F34); C finding (F14).

Checks that pass (no finding): Corporate Standard v1 tokens in `tokens.css`, light and dark; text contrast in light mode on 6 routes and in dark mode on 4 routes (0 pairs under 4.5:1); theme control (one icon button, `menuitemradio` Light/Dark/System, "Theme" tooltip); one `main` landmark with a skip link; `:focus-visible` 2 px primary outline with 2 px offset; sticky 56 px top bar; 256 px sidebar and 56 px rail; `Ctrl/Cmd+B` persisted toggle; mobile modal drawer with focus trap; active sidebar row tint and 2 px edge; underline sub-tabs; no page-level horizontal scroll on the measured routes (wide tables scroll inside `.table-scroll` with `overflow-x: auto`); one primary button per view; impeccable detector exit 0 with zero findings on `site/src` and `site/index.html`.

## Update plan

Tickets run in this order: tokens and type first, then the shell, then the pages, then evidence.

### T1. Align control padding and spacing to the grid

- Findings: F26, F27. F25 only if Open question 3 picks 36 px.
- Files: `site/src/styles/shell.css`, `site/src/styles/base.css`.
- Acceptance check: a search of `site/src/styles/shell.css` finds no `gap` or `padding` value of 6, 10, 14, or 20 px, and `.button` measures 16 px horizontal padding in the browser.
- Size: S.
- Dependencies: Open question 3.

### T2. Limit mono to dates, IDs, and table cells

- Findings: F28, F29.
- Files: `site/src/styles/live.css`, `site/src/styles/try.css`, `site/src/styles/scope.css`, `site/src/styles/map.css`, `site/src/styles/storms.css`, `site/src/live/live-view.tsx`, `design.md` (Type line).
- Acceptance check: the computed `font-family` of `.live-stat-value`, `.badge`, `.county-tag`, `.warning-tag`, and `.outcome-badge` starts with "IBM Plex Sans", and the numbers keep `tabular-nums`.
- Size: S.
- Dependencies: Open question 5.

### T3. Move the brand and the hamburger into the sidebar header

- Findings: F05, F06, F08, F15, F16, F19, F20.
- Files: `site/src/shell/top-bar.tsx`, `site/src/shell/route-sidebar.tsx`, `site/src/styles/shell.css`, the shell tests, `design.md` (Shell section).
- Acceptance check: on every route, the `header` element holds no link outside a breadcrumb, the hamburger is the first control in the sidebar header with `aria-label` "Collapse sidebar" or "Expand sidebar", and the rail and the mobile drawer still toggle.
- Size: M.
- Dependencies: Open questions 1 and 4.

### T4. Fix the navigation semantics

- Findings: F11, F17, F18, F21.
- Files: `site/src/shell/sub-tabs.tsx`, `site/src/shell/route-sidebar.tsx`, `site/src/shell/global-search.tsx`, the four `SubTabs` callers, the shell tests.
- Acceptance check: the `SubTabs` output holds no element with `role="tab"` or `role="tablist"`, each sub-tab bar is a `nav` with an `aria-label`, the active link has `aria-current="page"`, and the sidebar `nav` is named "Primary".
- Size: M.
- Dependencies: none.

### T5. Settle the theme default

- Findings: F12, F33.
- Files: `site/src/theme.ts`, `site/public/theme-init.js`, `design.md`, the theme tests.
- Acceptance check: with no stored theme, the resolved theme equals the Open question 2 answer, and `design.md` states that default.
- Size: S.
- Dependencies: Open question 2.

### T6. Replace the loading line with skeletons and add the not-found heading

- Findings: F13, F22.
- Files: `site/src/shell/states.tsx`, `site/src/app.tsx`, `site/src/styles/shell.css`, the state tests.
- Acceptance check: every loading state renders an element with `aria-busy="true"` and a skeleton block, and the unknown-route view has exactly one `h1`.
- Size: S.
- Dependencies: none.

### T7. Mark the primary region on every area

- Findings: F03.
- Files: `site/src/live/live-view.tsx`, `site/src/storms/workspace.tsx`, `site/src/scorecard/scorecard.tsx`, `site/src/try/try.tsx`, `site/src/method/`, `site/src/pipeline/pipeline.tsx`, one shell test.
- Acceptance check: on each of the 18 audited routes at 1280x800, `[data-primary-region]` exists once and its top edge is above 40% of the viewport height.
- Size: S.
- Dependencies: none.

### T8. Raise the small tap targets

- Findings: F01, F02, F07, F09, F10, F32.
- Files: `site/src/try/point.tsx`, `site/src/styles/try.css`, `site/src/scorecard/threshold-curve.tsx`, `site/src/styles/scorecard.css`, `site/src/styles/shell.css`, `site/src/styles/pipeline.css`, `site/src/styles/method.css`, `site/src/styles/storms.css`.
- Acceptance check: at 1280x800 no focusable element on the 18 routes is smaller than 24x24 px, and at 375x812 no focusable element is smaller than 44x44 px (inline prose links excepted).
- Size: M.
- Dependencies: T3 (the wordmark target, F08, moves with the brand).

### T9. Fit the live fold budget and the stale age copy

- Findings: F04, F30.
- Files: `site/src/live/live-view.tsx`, `site/src/styles/live.css`, the live tests.
- Acceptance check: `/live` at 1280x800 shows fewer than 120 words above the fold, and an age of 30187 minutes renders in whole days, not in minutes.
- Size: S.
- Dependencies: T7 (the primary region sets the fold content).

### T10. Remove fixed caps from data regions and size wide tables

- Findings: F23, F24.
- Files: `site/src/styles/try.css`, `site/src/styles/scorecard.css`, `site/src/styles/storms.css`, `site/src/styles/shell.css`.
- Acceptance check: at 1920x1080 the try metric row and the threshold curve fill their pane width, and on `/scorecard/table` the gap between the label column and the first numeric column is at most 48 px.
- Size: S.
- Dependencies: none.

### T11. Add the UI evidence receipt

- Findings: F14.
- Files: `docs/design/ui-evidence.md`, `docs/design/captures/`.
- Acceptance check: `docs/design/ui-evidence.md` lists each audited route at 375, 1280, and 1920 px with a capture path and a pass or fail result against `design.md`.
- Size: S.
- Dependencies: T1–T10 (the receipt records the final state).

## Open questions

1. **Do the brand and the hamburger move from the top bar into a sidebar header?** The standard places them in the sidebar header; `design.md` places them in the top bar. Recommended answer: yes. Follow the standard, update the `design.md` Shell section, and run T3. This closes F05 (wordmark), F06, F08, F15, and F20.
2. **Does an unset theme resolve to light or to System?** The standard default is System; commit #51 chose light. Recommended answer: keep light, because it is a recent, deliberate owner decision. Record it in `design.md` as a sanctioned deviation, and close F12 with that record.
3. **Do controls stay at 40 px or drop to 36 px?** Comfortable density sets 36 px, but the review rule rates a 24–39 px target as MEDIUM. Recommended answer: keep 40 px on desktop and 44 px below 768 px, and record 40 px as the project control height in `design.md`. T1 then leaves the heights as they are.
4. **Where does the source-code link go?** It is a header link outside a breadcrumb and it breaks the cluster order. Recommended answer: move it to the footer next to the caveat line, which removes it from the header cluster.
5. **Does mono cover stat values and badge counts?** `design.md` allows mono for dates, IDs, coordinates, and numeric tables. Recommended answer: keep that scope, and move stat values, badge counts, and map tags to IBM Plex Sans with `tabular-nums` (T2).
