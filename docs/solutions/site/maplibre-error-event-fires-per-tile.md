---
title: MapLibre fires one error event per failed tile
category: site
trigger: one failed tile shows the map error overlay on a working map, Retry stacks a second canvas, or a render throw leaves a blank page
---

## Problem

`createMap` awaited a promise that rejected on the first MapLibre `error` event. One failed tile showed the map error overlay on a map that could draw. The rejected load never called `map.remove()`, so the WebGL context leaked and Retry mounted a second canvas on the same node. A load that never ended had no timeout, so the reader saw no overlay and no Retry. A throw during render in any page body left a blank page, because the site had no error boundary.

## What did not work

Treat every `error` event as fatal. Call `map.remove()` only from the cleanup of the component: the rejected load never reached that cleanup. Filter on `sourceId`: the installed source does not show where MapLibre attaches it.

## Root cause

MapLibre fires `error` once for each failed tile, and the map keeps loading. Only a tile error carries a `tile` field (`maplibre-gl-dev.mjs:39292`). A style or source-metadata error has none (`:47794`). The inline promise did not tell the two cases apart, set no time limit, and did not release the map on failure.

## Fix

- `whenLoaded` in `site/src/storms/map/create-map.ts` resolves on `load`. An event with a `tile` field leaves a gap and never fails the load. Any other error, or no `load` within `LOAD_TIMEOUT_MS` (15 000 ms), calls `map.remove()` once and rejects. Every exit removes the listeners and the timer. Test: `site/src/storms/map/create-map.test.ts`.
- `AreaBoundary` in `site/src/shell/area-boundary.tsx` wraps the page body inside `Layout`. A render throw shows `ErrorState` under the top bar. Retry, or a new route path, renders the page again. Test: `site/src/shell/area-boundary.test.tsx`.
- `MapPane` reads the theme through a `themeRef`. The create effect keeps its `[attempt]` deps, so Retry builds the map with the current theme and a theme change does not rebuild the map.
