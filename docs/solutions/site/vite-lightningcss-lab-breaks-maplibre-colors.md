---
title: Vite LightningCSS lab() custom properties break MapLibre and hexRgb consumers
category: site
trigger: production map routes fail with invalid MapLibre paint colors or hexRgb errors on lab(...) strings
---

## Problem

Vite 8 compiles `oklch(...)` tokens in `site/src/styles/tokens.css` via LightningCSS with target `es2022`.
Production CSS emits CIE `lab(...)` inside `@supports` blocks alongside `#rrggbb` fallbacks.
`oklchToHex` in `site/src/storms/map/layers.ts` matches only `oklch(...)` strings.
Browsers evaluate `:root` properties to `lab(...)`, so MapLibre GL and `hexRgb` receive raw `lab(...)` strings and fail.

## What did not work

A downgrade of `build.target` in `site/vite.config.ts` to force hex-only CSS removes modern `oklch` design tokens.

## Root cause

Dev mode serves uncompiled `tokens.css` (`oklch(...)`), while `vite build` rewrites `oklch(...)` to `lab(...)` for `es2022`.
`token()` passes `getComputedStyle(...).getPropertyValue(...)` straight to `oklchToHex()`, which lacks parsers for `lab()`, `rgb()/rgba()`, and shorthand or alpha hex.

## Fix

- Expand `oklchToHex` in `site/src/storms/map/layers.ts` to normalize `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `oklch()`, and `lab()`.
- Convert CIE `lab()` through D50 XYZ, Bradford D50-to-D65 adaptation, and linear sRGB via a shared `linearSrgbToHex` helper.
- Return unrecognized sentinel strings such as `light--unknown` unchanged so test stubs stay valid.

Rule: any token bridge from `getComputedStyle` to MapLibre or canvas consumers must normalize every CSS Color 4 syntax that Vite emits.
