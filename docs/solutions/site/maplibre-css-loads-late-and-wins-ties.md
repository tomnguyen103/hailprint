---
title: maplibre-gl.css loads late and wins a selector tie
category: site
trigger: a MapLibre container measures 0 px tall; the canvas stays at its 300 px default
---

## Problem

On `/try/compare`, both map containers measured 0 px tall. No tiles and no swath drew.
The rule `.compare-map { position: absolute; inset: 0; }` sat in `site/src/styles/try.css:223`.

## What did not work

Reading the source rule alone. The rule looked correct, and the frame had a height (`site/src/styles/map.css:14`).

## Root cause

MapLibre adds the class `maplibregl-map` to its container. `maplibre-gl.css` declares `.maplibregl-map { position: relative; }`.
That sheet loads with the lazy map chunk, after `try.css`.
The two selectors have equal specificity, so the later sheet wins. The container fell back to `position: relative` with no content height.
The computed style in the browser showed `position: relative`.

## Fix

The selector is now `.compare-frame > .compare-map` (`site/src/styles/try.css:223`). Two classes out-rank one class at any load order.
The test `site/src/try/compare-css.test.ts` fails when a bare `.compare-map` rule returns.
A rule that styles a MapLibre container must out-rank one class. Check the computed style, not the source rule.

delete: none — the load order of the lazy map chunk is a product choice, so the selector rule stays the guard.
