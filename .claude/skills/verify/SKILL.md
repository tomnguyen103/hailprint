---
name: verify
description: End-to-end check of the Hailprint site. Start command, seed step, and one flow line per verified scenario.
---

# Verify the Hailprint site

## Start

- Start command: `cd site && npm run dev` (Vite at http://localhost:5173). `.claude/launch.json` names it `site`.
- Seed step: the dev server reads `site/data/`. Run `uv run hailprint publish` when `site/data/storms.json` is absent.
- Login step: none. The site has no accounts.

## Flows

Each line reads `<scenario> — <route or command> — <expected result>`.

- US-01.1 — `/storms/2024-05-28/score` at 1280 px — the sidebar header holds the hamburger and the brand; a click collapses the sidebar to the rail.
- US-01.2 — `/storms/2024-05-28/score` at 375 px — the top-bar hamburger opens the drawer with the brand in its header; Escape closes it.
- US-02.1 — `/storms/2024-05-28/score` — the breadcrumb reads Storms / 2024-05-28 / Score.
- US-04.1 — `/storms/2024-05-28/score` with the data files held — skeleton blocks fill the content width.
- US-04.3 — `/no/such/page` — one `h1` "Page not found" above the empty state.
