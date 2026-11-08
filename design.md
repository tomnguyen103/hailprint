---
name: Hailprint web
status: locked
archetype: { live: monitoring, storms: analytics, scorecard: analytics, try: editor, method: editor, pipeline: monitoring }
stitch-project: 6567773575427554988
scope-sidebar: light
---

# Hailprint design system

## Position

A calm document workspace for one hard number. The page looks like a field notebook
for radar data: paper, ink, and one ice-to-ink ramp for hail size. Notion supplies the
calm (page tree, generous margins, block rhythm). Hailprint supplies its own elements:
the size ruler, the storm stamp, the contingency grid, and the receipt chip.

## Type

| Role | Family | Size / weight |
|---|---|---|
| Page title | Instrument Serif / Source Serif 4 | 32 px / 600, roman only |
| Pane title | Source Sans 3 / IBM Plex Sans | 18 px / 600 |
| Body | Source Sans 3 / IBM Plex Sans | 16 px / 400, line-height 1.55 |
| Metadata, chips | Source Sans 3 / IBM Plex Sans | 14 px / 500 |
| Section label | Source Sans 3 / IBM Plex Sans | 12 px / 600, uppercase, tracking 0.06em |
| Dates, IDs, numbers | JetBrains Mono / IBM Plex Mono | 14 px / 500, tabular-nums |
| Stat value | JetBrains Mono / IBM Plex Mono | 28 px / 500 |

## Colour tokens (Gulf Barograph OKLCH)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `oklch(0.972 0.008 258)` | `oklch(0.165 0.015 258)` | page background |
| `--sheet` | `oklch(0.992 0.004 258)` | `oklch(0.205 0.018 258)` | panes, cards, inputs |
| `--sheet-muted` | `oklch(0.942 0.012 258)` | `oklch(0.25 0.02 258)` | hover, inactive tab, zebra |
| `--rule` | `oklch(0.875 0.015 258)` | `oklch(0.32 0.022 258)` | 1 px hairlines |
| `--ink` | `oklch(0.21 0.022 258)` | `oklch(0.945 0.008 258)` | body and titles |
| `--ink-muted` | `oklch(0.42 0.022 258)` | `oklch(0.76 0.016 258)` | metadata |
| `--accent` | `oklch(0.46 0.11 236)` | `oklch(0.78 0.095 230)` | links, focus ring, primary button |
| `--accent-amber` | `oklch(0.54 0.14 48)` | `oklch(0.76 0.14 48)` | barograph amber emphasis |
| `--on-accent` | `oklch(0.992 0.004 258)` | `oklch(0.165 0.015 258)` | text on accent |
| `--report` | `oklch(0.5 0.19 28)` | `oklch(0.76 0.14 25)` | SPC report markers only |
| `--note-bg` / `--note-ink` | `oklch(0.945 0.032 84)` / `oklch(0.39 0.072 78)` | `oklch(0.26 0.035 84)` / `oklch(0.88 0.065 84)` | caveat callout |
| `--water` | `oklch(0.922 0.014 210)` | `oklch(0.23 0.018 215)` | basemap water bodies |
| `--road-major` | `oklch(0.84 0.014 85)` | `oklch(0.39 0.015 85)` | basemap highways and major roads |

Hail ramp (data only, never chrome). Each class carries its object name; colour never
works alone.

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

The impact layers share the map with the hail ramp. Both impact ramps use cool hues away
from the hail ramp, so no step reads as a hail class. Hue is green for power and violet
for internet. The county fill shows one ramp at a time.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--out-1` | `#DCEFD9` | `#1E3322` | power, share out above 0 and under 1 percent |
| `--out-2` | `#A9D9A6` | `#2C5A35` | power, 1 to under 5 percent |
| `--out-3` | `#6FBF72` | `#3F8A4D` | power, 5 to under 15 percent |
| `--out-4` | `#34995A` | `#62B872` | power, 15 to under 30 percent |
| `--out-5` | `#1B6B3C` | `#9BE0A5` | power, 30 percent and up |
| `--net-1` | `#F1E3F4` | `#34203A` | internet, drop above 0 and under 2 percent |
| `--net-2` | `#DBB5E3` | `#5A3466` | internet, 2 to under 5 percent |
| `--net-3` | `#BF80CC` | `#8650A0` | internet, 5 to under 10 percent |
| `--net-4` | `#9A4AA6` | `#B87BD0` | internet, 10 to under 20 percent |
| `--net-5` | `#6E2478` | `#E0B0F2` | internet, 20 percent and up |
| `--warn-sv` | `#8A5300` | `#F2B84B` | severe thunderstorm warning outline |
| `--warn-to` | `#A3175F` | `#FF7EB6` | tornado warning outline |
| `--warn-ff` | `#0A6B73` | `#4DD0BE` | flash flood warning outline |

- A ramp bin holds its lower bound and excludes its upper bound.
- A value of 0 gets no fill. A null value gets a 45-degree hatch.
- Each warning token has a contrast of at least 3:1 against `--paper` in both themes.
- A warning outline is 2 px. The line style carries the type with the colour:
  dashed for severe thunderstorm, solid for tornado, dotted for flash flood. Each type
  also carries a text label.
- The dark ramps run from dim to bright, so a higher bin stays the most visible step.

## Shape and density

- Radius: 6 px panes and cards, 4 px buttons and inputs, full radius on chips only.
- Borders: 1 px `--rule`. Shadow only on overlays and the map inspector drawer.
- Spacing: 4 px base. Page gutter 32 px desktop, 16 px mobile. Reading column 680 px.
- No gradients in chrome. No icon-above-heading card grids. No nested cards.

## Signature elements

1. **Size ruler.** A horizontal scale from 0.75 to 2.50 in. Each tick shows a circle at
   true relative diameter and the object name. It is the map legend and the slider
   track for the threshold control.
2. **Storm stamp.** A compact block: storm date in mono, the 12Z-to-12Z window as a
   24-cell bar, the report count, and the max report size.
3. **Contingency grid.** A 2 x 2 grid (hit, miss, false alarm, correct negatives) with each
   cell sized by count. It replaces a pie chart for every score.
4. **Receipt chip.** A small mono chip after every published number. It opens a drawer
   with source, product, file name, run time, and the confidence band.
5. **Caveat line.** One persistent footer line on every page:
   "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm."

## Shell

- Top bar, one row: wordmark, six route tabs (Live, Storms, Scorecard, Try it,
  Method, Pipeline), theme toggle, source-code link. No route sidebar (6 areas).
- Live area: monitoring page (`/live`, and the target of `/`) with the status line,
  freshness chip, five-stat strip, rolling 24 h map, and source clocks table.
- Storms area: light scope sidebar like a page tree (storm dates grouped by year,
  report-count badge), main pane with sub-tab routes (Map, Parcels, Score, Data),
  inspector drawer on map click. A 240 px sidebar at 1280 px and up; from 768 to 1279 px a horizontal scope bar sits above the main column and opens the drawer.
- Mobile < 768 px: tabs collapse into a bottom bar of six icons with labels; the
  scope sidebar becomes a sheet; the inspector becomes a full-screen sheet.

## Motion

- 150 ms ease-out on colour and opacity only. Map fly-to 600 ms.
- `prefers-reduced-motion`: no fly-to, no fades.

## Copy

- ASD-STE100: one topic per sentence, active voice, present tense, 20 words maximum
  for instructions, 25 for descriptions.
- One heading or label per block. Supporting text only where its absence causes a
  wrong action. Each page shows at most 120 words of prose above the fold.
- Never the word held in `swath.FORBIDDEN_WORD`. Always "radar-estimated hail size".
