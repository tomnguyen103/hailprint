---
theme: corporate-standard-v1
design-source: standard
archetype:
  live: monitoring
  storms: analytics
  scorecard: analytics
  try: analytics
  method: editor
  pipeline: monitoring
shell-shape: three-pane
density: comfortable
stitch-project: 6567773575427554988
stitch-design-system: 7416417704467347452
---

# Hailprint design system

## Position

Hailprint follows Corporate Standard v1 (`app-ui-shell/references/default-theme.md`). The workspace renders crisp white and slate-navy surfaces with `1px` hairlines, `IBM Plex Sans` typography, `4px` geometry, and one ice-to-ink hail ramp for radar data.

## Type

- Family: `IBM Plex Sans` for UI and reading prose. `IBM Plex Mono` for dates, IDs, coordinates, and numeric tables.
- Weights: `400` body, `500` labels and controls, `600` headings and `strong`. No `700` or above. No serif faces.
- Scale: `12px` section labels and metadata, `13px` dense table cells, `14px` app body and controls (`16px` body on `/method/*` reading pages), `16px` pane and section titles, `20px` page headings, `24px` stat values.
- Numbers in tables and stats use `tabular-nums`. Numeric columns align right.

## Corporate Standard v1 palette

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#0C111D` | page background |
| `--surface` | `#FFFFFF` | `#161B26` | cards, panes, inputs, menus |
| `--surface-muted` | `#F9FAFB` | `#1F242F` | table header row, hover row |
| `--border` | `#E4E7EC` | `#333741` | 1 px hairlines, dividers |
| `--border-input` | `#858D9B` | `#6B7385` | input, select, checkbox edges |
| `--text` | `#101828` | `#F5F5F6` | body and titles |
| `--text-muted` | `#475467` | `#94969C` | metadata, secondary labels |
| `--text-placeholder` | `#667085` | `#85888E` | input placeholders |
| `--primary` | `#1E3A8A` | `#A4BCFD` | primary fill, links, active tab edge, focus ring |
| `--primary-hover` | `#172E6E` | `#C7D7FE` | primary fill on hover and press |
| `--primary-subtle` | `#EFF4FF` | `#1F242F` | active nav row, selected table row |
| `--on-primary` | `#FFFFFF` | `#0C111D` | text on `--primary` |
| `--success` | `#027A48` | `#47CD89` | success status |
| `--warning` | `#B54708` | `#FDB022` | warning status |
| `--danger` | `#B42318` | `#F97066` | error status |
| `--info` | `#175CD3` | `#84CAFF` | info status |
| `--sidebar-bg` | `#F9FAFB` | `#0C111D` | left route sidebar background |
| `--sidebar-text` | `#344054` | `#CECFD2` | sidebar link text |
| `--sidebar-active-bg` | `#EFF4FF` | `#1F242F` | active sidebar row tint |
| `--sidebar-active-text` | `#1E3A8A` | `#C7D7FE` | active sidebar row text |
| `--sidebar-active-edge` | `#1E3A8A` | `#A4BCFD` | 2 px active left bar |

## Hail ramp (data only)

Each size class carries its object name; color never works alone.

| Class | Object | Light fill |
|---|---|---|
| >= 0.75 in | penny | `oklch(0.92 0.032 224)` |
| >= 1.00 in | quarter | `oklch(0.84 0.058 222)` |
| >= 1.25 in | half dollar | `oklch(0.73 0.088 226)` |
| >= 1.50 in | walnut | `oklch(0.6 0.115 236)` |
| >= 1.75 in | golf ball | `oklch(0.48 0.125 252)` |
| >= 2.00 in | hen egg | `oklch(0.37 0.125 272)` |
| >= 2.50 in | tennis ball | `oklch(0.26 0.11 296)` |

## Impact tokens

Cool hues stay distinct from the hail ramp: green for power (`--out-1`..`--out-5`), violet for internet (`--net-1`..`--net-5`), and `2px` distinct line patterns for warnings (`--warn-sv`, `--warn-to`, `--warn-ff`).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--out-1` | `#DCEFD9` | `#1E3322` | power, above 0 to under 1% |
| `--out-2` | `#A9D9A6` | `#2C5A35` | power, 1 to under 5% |
| `--out-3` | `#6FBF72` | `#3F8A4D` | power, 5 to under 15% |
| `--out-4` | `#34995A` | `#62B872` | power, 15 to under 30% |
| `--out-5` | `#1B6B3C` | `#9BE0A5` | power, 30% and up |
| `--net-1` | `#F1E3F4` | `#34203A` | internet, above 0 to under 2% |
| `--net-2` | `#DBB5E3` | `#5A3466` | internet, 2 to under 5% |
| `--net-3` | `#BF80CC` | `#8650A0` | internet, 5 to under 10% |
| `--net-4` | `#9A4AA6` | `#B87BD0` | internet, 10 to under 20% |
| `--net-5` | `#6E2478` | `#E0B0F2` | internet, 20% and up |
| `--warn-sv` | `#8A5300` | `#F2B84B` | severe thunderstorm warning outline |
| `--warn-to` | `#A3175F` | `#FF7EB6` | tornado warning outline |
| `--warn-ff` | `#0A6B73` | `#4DD0BE` | flash flood warning outline |

## Shape and density

- Radius: `4px` (`--radius: 4px`) on buttons, inputs, cards, panes, menus, and dialogs; full radius on status dots only.
- Depth: `1px` `--border` edges; zero resting card or docked-pane shadows. Overlay shadow `0 4px 12px rgb(16 24 40 / 0.08)` applies to menus, popovers, dialogs, and mobile drawers only.
- Spacing: `4px` base, `8px` grid, `24px` comfortable page padding.
- Focus: `2px` `--primary` outline with `2px` offset on `:focus-visible`.

## Do's and Don'ts

- Do use `--radius` (`4px`) on buttons, inputs, cards, panes, menus, and dialogs.
- Do reserve full radius for status dots.
- Do separate surfaces with a `1px` `--border` edge.
- Do apply the overlay shadow to menus, popovers, dialogs, and mobile drawers only.
- Do keep the comfortable density: `4px` base, `8px` grid, `24px` page padding.
- Do take every color from a token in this file.
- Don't add a resting shadow to a card or a docked pane.
- Don't write `swath.FORBIDDEN_WORD` in any output.
- Do write `radar-estimated hail size` in every caption and caveat.
- Don't claim hail caused a power or internet outage.

## Shell

- Top bar (`56px`, `--bar-height`): far-left single hamburger toggle (`>=40px` desktop, `>=44px` `<768px`, toggles desktop sidebar <-> rail and `<768px` modal drawer; never a second bottom-left collapse button) + Hailprint mark + area title; center `360–480px` (`200–360px` at `768–1023px`) `Ctrl+K` / `/` global search trigger opening a `560–640px` modal search dialog (full-screen `<768px`) with focus trap, grouped results, and recent searches; right 3-state Light / Dark / System theme icon menu (`menuitemradio`, hover+focus `"Theme"` tooltip, 1-frame no-transition swap) + source link.
- Left route sidebar (`256px` expanded / `56px` icon rail on `>=768px`, `Ctrl/Cmd+B` persisted in `localStorage["hailprint-sidebar"]`; `288px` off-canvas modal drawer below `768px`): lists Live, Storms, Scorecard, Try it, Method, and Pipeline.
- Sub-tabs: underline style only (`2px` `--primary` active bottom edge on a `1px` `--border` line).
- Footer: renders inside `<main>` with the caveat line.

## Signature elements

1. **Size ruler.** Seven hail diameter circles (`0.75` to `2.50 in`) with compact labels.
2. **Storm stamp.** Storm date in mono, 24-cell `12Z`-to-`12Z` bar, report count, and max report size.
3. **Contingency grid.** 2 x 2 grid (`hit, miss, false alarm, correct negatives`, covering hit, miss, false alarm, and correct negatives) scaled by count.
4. **Receipt chip.** Compact file button opening provenance metadata (`source`, `product`, `file`, `run_time`, confidence band).
5. **Caveat line.** `"Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm."`

## Copy and domain rules

- ASD-STE100: active voice, present tense, zero `-ing` verbs, page headings `<=5` words roman, buttons `<=3` words, zero muted `<p>` subtitles beneath headings.
- Never write `swath.FORBIDDEN_WORD`; always say `radar-estimated hail size`. Never claim hail caused power or internet outages.
