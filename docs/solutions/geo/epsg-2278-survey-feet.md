---
title: EPSG:2278 buffers are in US survey feet, not metres
category: geo
trigger: a distance oracle in EPSG:2278 passes at a fraction of the stated distance
---

## Problem

The spike oracle states a 5 km buffer around the 19.05 mm size class. The test reprojected to EPSG:2278 and called `buffer(5000)`.

## What did not work

EPSG:2278 (NAD83 / Texas South Central, ftUS) measures in US survey feet. `buffer(5000)` covered 1.52 km. The test passed, so the error stayed hidden until the Engine 2 review.

## Root cause

The parcel data arrives in EPSG:2278, so the CRS looked natural for every Harris County distance. The unit of the CRS was never checked.

## Fix

Reproject to EPSG:32615 (UTM zone 15N, metres) before a metre buffer: `tests/test_spike.py:71`. Keep EPSG:2278 for the parcel join and for area in square feet. Check `crs.axis_info[0].unit_name` before any distance literal.
