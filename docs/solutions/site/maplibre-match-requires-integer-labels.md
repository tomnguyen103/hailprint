---
title: MapLibre match expressions require integer numeric labels
category: site
trigger: "Error: layers[...].paint.line-color[2]: Numeric branch labels must be integer values."
---

## Problem

The `swath-outline` layer in `site/src/storms/map/layers.ts` used a MapLibre `match` expression on `["get", "threshold_mm"]` with the seven `RULER` thresholds (`19.05`, `25.4`, `31.75`, `38.1`, `44.45`, `50.8`, `63.5`). At runtime in the browser, MapLibre GL JS rejected the style during validation and failed to load the map on `/storms/<date>/map/0`, `/try/point`, and `/try/compare`.

## What did not work

Unit tests in `site/src/storms/map/create-map.test.ts` mocked `maplibre-gl` with a `FakeMap` class that did not run `@maplibre/maplibre-gl-style-spec` validation. The tests asserted the `match` array structure directly without checking whether MapLibre's style validator accepts floating-point branch labels.

## Root cause

`[SCHEMA/TOOL]` MapLibre GL JS `validateStyleMin` enforces integer values for numeric branch labels in `match` expressions (`Numeric branch labels must be integer values.`). Because millimeter hail thresholds such as `19.05` and `25.4` are floating-point numbers, a `match` expression on `threshold_mm` is invalid in the MapLibre style specification.

## Fix

1. Replace the `match` expression in `swathOutlineColor()` (`site/src/storms/map/layers.ts`) with a `case` expression that pairs `["==", ["get", "threshold_mm"], mark.threshold_mm]` with `token("--hail-N")` for each mark in `RULER`, ending with `token("--rule")` as the fallback.
2. Call `validateStyleMin(style)` from `@maplibre/maplibre-gl-style-spec` inside `site/src/storms/map/create-map.test.ts` for both basemap and non-basemap styles so any invalid MapLibre expression fails the unit test suite immediately.
