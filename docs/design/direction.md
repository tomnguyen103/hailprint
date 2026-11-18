# Design Direction — Hailprint

## Project
- **Product**: Hailprint — Houston Metro hail swath & community impact verification workbench.
- **Standard**: `corporate-standard-v1` (`app-ui-shell/references/default-theme.md`).
- **Archetype**: Workspace + Geo-verification Workbench (`three-pane` default on map/storm workspaces; `table-first` on Scorecard, Try Tune/Run, Pipeline; `split-document` on Method reading pages).
- **Primary users**: Weather researchers, insurers/risk analysts, and Harris County residents inspecting MRMS MESH swaths against SPC preliminary hail reports and impact feeds.
- **Density**: `comfortable` (`56px` sticky single-row top bar, `256px` / `56px` collapsible left route sidebar, `4px` corner radius, crisp hairline dividers `#E4E7EC` / `#333741`).

## References
- Shipped precedent inside Hailprint: [site/src/storms/workspace.tsx](../../site/src/storms/workspace.tsx), [site/src/scorecard/scorecard.tsx](../../site/src/scorecard/scorecard.tsx), [site/src/method/method.tsx](../../site/src/method/method.tsx).
- `designmd`: `not opened: search_design_kits returned [] for enterprise query; governed directly by Corporate Standard v1`.
- Structural standard: `app-ui-shell` (`default-theme.md`, `ui-routing.md`, `search.md`, `theme-control.md`, `archetypes.md`).

## Information budget
- **One question per route**: Headline states the single question; zero `<p>` subtitles beneath headings.
- **Group ceiling**: `<=3` visible component groups inside `<main>`.
- **Primary CTA ceiling**: `<=1` primary button (`--primary` `#1E3A8A` fill) per route.
- **Row field ceiling**: `<=4` fields per table/list row; secondary 2x2 contingency counts and file provenance live in on-demand `PeekDrawer` or `ReceiptChip` popovers.
- **Above-the-fold prose**: `<120` words at `1280px` outside table/list cells (`16px` measure `<=680px` on `/method/*` reading pages).
- **State completeness**: Every data region renders explicit loading skeleton/indicator, populated content, clean empty finding, and retryable error state.

## Copy
- **Standard**: ASD-STE100 — active voice, present or imperative tense, zero `-ing` verbs in UI prose/buttons.
- **Limits**: Page headings `<=5` words roman; nav/tab items `<=2` words; buttons `<=3` words (`Verb + Object` or compact label); empty/error states `<=20` words.
- **Domain guardrails (`GLOSSARY.md` / `tests/test_wording.py`)**: Never write the banned word (`swath.FORBIDDEN_WORD`); say `radar-estimated hail size`. Never claim hail caused power or internet outages. Live quiet sky states clearly with a link to the newest storm date.

## Motion budget
- Only fast state transitions (`120–160 ms` cubic-bezier `[0.2, 0, 0, 1]`) on sidebar collapse, drawer open/close, and search dialog.
- Honor `prefers-reduced-motion: reduce` globally by collapsing durations to `0 ms`.
- Zero bounce/spring easing, zero continuous idle pulses or floating animations.

## Avoid
- Ban `Source Serif 4` and all decorative serifs (`IBM Plex Sans` + `IBM Plex Mono` only).
- Ban warm parchment/sepia chrome or custom OKLCH background overrides that depart from `#FFFFFF` / `#0C111D`.
- Ban eyebrows, numbered step pills (`01`/`02`), glow halos, left accent stripes on cards (`4px border-left`), resting shadows on cards/panes, nested bordered boxes (`maplibregl-ctrl-group` border inside bordered `.map-frame`, or bordered cards inside `.stamp` / `.live-stats`), and muted `<p>` subtitles right beneath headings.
- Ban `<40px` interactive targets on desktop (`<44px` on `<768px`) including checkboxes, radios, chips, and icon buttons.
- Ban buttons exceeding `3` words (e.g., `"1.25 in half dollar"`, `"pairs.json, pooled over..."`, `"2024-05-28 vs 2023-06-23 (...)"`).
- Ban unapproved external hosts in `vercel.json` CSP or browser direct calls replacing `site/data/live/`.
