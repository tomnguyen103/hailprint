# Design Direction — Hailprint

> `design.md` at the repo root is the locked design system and wins over this file. This file keeps the direction record of the shell build.

## Project
- **Purpose line**: Weather researchers, insurers, and Harris County residents verify MRMS MESH hail swaths against SPC preliminary hail reports and county impact feeds in a public web workbench.
- **Archetype**: `{ live: monitoring, storms: analytics, scorecard: analytics, try: analytics, method: editor, pipeline: monitoring }` (`app-ui-shell/references/archetypes.md`).
- **Shell shape**: `three-pane` default on map/storm workspaces (`table-first` on Scorecard, Try Tune/Run, Pipeline; `canvas` on Live and Compare; `split-document` on Method reading pages).
- **Density**: `comfortable` (`56px` sticky single-row top bar, `256px` / `56px` collapsible left route sidebar, `4px` radius, `1px` hairlines `#E4E7EC` / `#333741`).

## References
- Shipped precedent inside Hailprint (`opened` via local preview): [site/src/storms/workspace.tsx](../../site/src/storms/workspace.tsx), [site/src/scorecard/scorecard.tsx](../../site/src/scorecard/scorecard.tsx), [site/src/method/method.tsx](../../site/src/method/method.tsx).
- `designmd`: `not opened: search_design_kits returned [] for enterprise query; governed directly by Corporate Standard v1`.
- Structural standard: `app-ui-shell` (`default-theme.md`, `ui-routing.md`, `search.md`, `theme-control.md`, `archetypes.md`).

## Information budget
- **One question per route**: Headline states the single question; zero `<p>` subtitles beneath headings.
- **Group ceiling**: `<=3` visible component groups inside `<main>`.
- **Primary CTA ceiling**: `<=1` primary button (`--primary` `#1E3A8A` fill) per route.
- **Row field ceiling**: `<=4` primary fields per table/list row; secondary 2x2 contingency counts and file provenance live in on-demand `PeekDrawer` or `ReceiptChip` popovers.
- **Above-the-fold prose**: `<120` words at `1280px` outside table/list cells (`16px` measure `<=680px` on `/method/*` reading pages).
- **State completeness**: Every data region renders loading skeleton/indicator, populated content, centered empty finding with recovery action, and retryable error state.

## Copy
- **Standard**: ASD-STE100 — active voice, present or imperative tense, zero `-ing` verbs in UI prose/buttons.
- **Limits**: Page headings `<=5` words roman; nav/tab items `<=2` words; buttons `<=3` words (`Verb + Object` or compact label); empty/error states `<=20` words.
- **Domain guardrails (`GLOSSARY.md` / `tests/test_wording.py`)**: Never write the banned word (`swath.FORBIDDEN_WORD`); say `radar-estimated hail size`. Never claim hail caused power or internet outages. Live quiet sky states clearly with a link to the newest storm date.

## Motion budget
- Only fast state transitions (`120–160 ms` cubic-bezier `[0.2, 0, 0, 1]`) on sidebar collapse, drawer open/close, and search dialog.
- Theme swap disables CSS transitions for one frame (`data-theme-swap`) so light/dark changes never flash.
- Honor `prefers-reduced-motion: reduce` globally by collapsing durations to `0 ms`.

## Avoid
- Ban `Source Serif 4` and all decorative serifs (`IBM Plex Sans` + `IBM Plex Mono` only); ban font weights `>=700`.
- Ban warm parchment/sepia chrome or custom OKLCH background overrides that depart from `#FFFFFF` / `#0C111D`.
- Ban a second bottom-left sidebar collapse button; ONE top-left hamburger button in the top bar toggles desktop rail (`>=768px`) and mobile drawer (`<768px`).
- Ban eyebrows, numbered step pills (`01`/`02`), glow halos, `4px` left accent stripes on cards, resting shadows on cards/docked inspector panes, nested bordered boxes, and muted `<p>` subtitles right beneath headings.
- Ban `<40px` interactive targets on desktop (`<44px` on `<768px`) including checkboxes, radios, chips, and icon buttons.
- Ban buttons exceeding `3` words and headings exceeding `5` words.
- Ban unapproved external hosts in `vercel.json` CSP or browser direct calls replacing `site/data/live/`.
