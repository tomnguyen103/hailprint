# Design recommendations

Each entry needs a change to the locked base (Corporate Standard v1 or the shell zones).
The owner approved the entries in `docs/design/ui-update-plan.md`. Each entry states its outcome.

## R1. IBM Plex Mono only for code and IDs inside tables

- **Outcome:** Approved in part. Mono stays for dates, IDs, and table cells. Stats, badges, and tags use Plex Sans with tabular figures.

- **Gate:** `default-theme.md` § Type. Mono is for code and IDs inside tables.
- **Evidence:** `design.md` § Type widens Mono to dates, IDs, coordinates, and numeric tables.
  The 1440 px and 375 px screenshots show Mono on the case-study preset buttons, the storm-date links on
  `/pipeline/sources`, the KPI values on `/live`, and the counts on `/try/tune`.
  `site/src/styles/*.css` sets `var(--font-mono)` in 10 rules.
- **Proposed change:** Use IBM Plex Sans with `font-variant-numeric: tabular-nums` for dates and numerals
  outside tables. Keep Mono for file names, receipt IDs, and command text. Update `design.md` § Type to match.
- **Severity:** Medium. The face is a base element. The current use is consistent across the site, so the
  change is visual only and needs a decision.

## R2. Move the navigation toggle into the sidebar header

- **Outcome:** Approved. The sidebar header holds the hamburger and the brand.

- **Gate:** `app-ui-shell` SKILL § Sidebar. One hamburger sits in the sidebar header.
- **Evidence:** `site/src/shell/top-bar.tsx:31-41` puts the toggle in the top bar. The sidebar starts under
  the bar (`site/src/styles/shell.css:380`), so it has no header row.
- **Proposed change:** Give the sidebar a 56 px header row that holds the toggle and the wordmark. Run the
  sidebar the full viewport height. Start the top bar at the sidebar edge.
- **Severity:** Low. The toggle works and has one instance. The change moves a shell zone.
