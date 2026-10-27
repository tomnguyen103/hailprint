---
title: A hand-written fixture hid the real IEM warning key names
category: data
trigger: KeyError 'polygon_begin' in the O14 live test, while every offline test of sbw.parse passed
---

## Problem

`sbw.parse` rejected every warning in the live IEM feed. The feed names the polygon times `utc_polygon_begin` and `utc_polygon_end`. The code and the fixture used `polygon_begin` and `polygon_end`.

## What did not work

Trust in the offline suite. The fixture `tests/fixtures/iem_sbw_hgx.geojson` was written by hand from the plan text, so it repeated the same wrong key names as the code. Each offline test passed.

## Root cause

The fixture and the parser shared one author and one assumption. A fixture that nobody cut from a real response can not prove the parser reads the real response.

## Fix

- `sbw.FEED_KEY` maps each output column to its feed key (`src/hailprint/sbw.py:34`). The published columns keep the names without the prefix.
- The fixture now holds the live key names and the live extra keys. A regression test reads the prefixed names (`tests/test_sbw.py:111`).
- The opt-in live test O14 (`HAILPRINT_NETWORK=1`) compares the filtered raw feed with the parsed row count (`tests/test_sbw.py:179`). Run it before the first merge of any new feed reader.

Rule: a parser for an external feed gets one fixture cut from a real response and one live contract test, before the first PR opens.
