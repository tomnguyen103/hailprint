---
title: MapLibre paint changes before the style loads
category: site
trigger: a theme switch during map load leaves the swath fills in the old theme, or an isStyleLoaded guard drops the change
---

## Problem

The map pane calls `setTheme` on the map handle when the resolved theme changes. A guard `if (!map.isStyleLoaded()) return;` dropped the call when the style was still loading, so a theme switch during load left the fills in the old theme until the next switch.

## What did not work

The guard, and a `MutationObserver` on `data-theme` in the map pane. The observer added a second source of truth for the theme.

## Root cause

MapLibre queues `setPaintProperty` calls on a layer that exists in the style object. The style object exists as soon as `createMap` passes it, so the guard refused a call that MapLibre accepts.

## Fix

Delete the guard. `setTheme` in `site/src/storms/map/create-map.ts:103` writes every `*-color` paint key from `themedPaint()` without a readiness check. The map pane reads the theme from the one store in `site/src/state/theme.ts` and calls `setTheme` from an effect (`site/src/storms/map-pane.tsx:93`).
