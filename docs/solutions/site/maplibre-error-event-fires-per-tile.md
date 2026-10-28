---
title: MapLibre fires one error event per failed tile
category: site
trigger: one failed tile shows the map error overlay on a working map, Retry stacks a second canvas, or a map in a hidden tab shows the overlay when it returns
---

## Problem

`createMap` awaited a promise that rejected on the first MapLibre `error` event. One failed tile showed the map error overlay on a map that could draw. The rejected load never called `map.remove()`, so the WebGL context leaked and Retry mounted a second canvas on the same node. A load that never ended had no timeout, so the reader saw no overlay and no Retry.

## What did not work

Treat every `error` event as fatal. Call `map.remove()` only from the cleanup of the component: `createMap` rejects before it returns a handle, so the cleanup holds no map to remove. Filter on `sourceId`: MapLibre adds `sourceId` to every event that a source fires, so tile errors and the source-metadata error both carry it.

## Root cause

MapLibre fires `error` once for each failed tile request, except a 404, and the map keeps loading. Only a tile error carries a `tile` field. The style-load error and the source-metadata (TileJSON) error carry none. The typed `ErrorEvent` of maplibre-gl 6.16.0 has no `tile` field, so the code relies on a private field. The inline promise did not tell the cases apart, set no time limit, and did not release the map on failure. A hidden tab pauses `requestAnimationFrame`, and MapLibre fires `load` from it, so a plain timeout rejected a load that only paused.

## Fix

- `whenLoaded` in `site/src/storms/map/when-loaded.ts` resolves on `load`. An event with a `tile` field leaves a gap and never fails the load. Any other error, or no `load` within `LOAD_TIMEOUT_MS` (15 000 ms), calls `map.remove()` once and rejects. Every exit removes the listeners and the timer. Test: `site/src/storms/map/when-loaded.test.ts`.
- The timeout counts only time while the tab is visible. A `visibilitychange` listener stops the timer on hidden and starts a full `LOAD_TIMEOUT_MS` on visible.
- A `shortcut:` comment in `when-loaded.ts` names the pinned maplibre-gl version. Recheck the `tile` field on any version bump.
