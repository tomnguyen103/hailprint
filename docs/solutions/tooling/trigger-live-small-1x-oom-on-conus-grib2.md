---
title: Trigger.dev live task on small-1x runs out of memory on a CONUS GRIB2 file
category: tooling
trigger: Process exited with signal SIGKILL in trigger/live.ts while hailprint cloud live decoded a 3500x7000 CONUS MRMS GRIB2 file
---

## Problem

The `live` task on `small-1x` (512 MB RAM) died with `SIGKILL` during `hailprint.mesh.decode`. No `live/now.json` file reached `hailprint-public`, and `/live` failed with `HTTP 400`.

## What did not work

The unit tests in `tests/test_mesh.py` used a 4x4 grid (`16` cells). That fixture hid the memory peak of a 3500x7000 (`24,500,000` cell) CONUS grid.

## Root cause

`mesh.decode` built an `xr.DataArray` from the full 24.5M-cell `float64` array (`196 MB`) and called `da.sortby("longitude")` before the Harris bbox slice. That sort allocated a second 196 MB `float64` copy while `raw` and `values` stayed in memory. Together with `libeccodes` C buffers and the Node.js worker, total RSS exceeded the 512 MB `small-1x` limit.

## Fix

- `src/hailprint/mesh.py` deletes `raw` after handle creation, slices `values` to the Harris bbox as `float32` before `xr.DataArray`, and deletes `values`.
- `trigger/live.ts` runs on `machine: "small-2x"` (1 GiB RAM).
- `tests/test_mesh.py::test_decode_crops_conus_grid_within_memory_budget` enforces a 250 MiB `tracemalloc` ceiling on a 3500x7000 grid.
- `tests/test_cloud.py::test_trigger_live_task_runs_every_10_minutes_on_its_own_queue` asserts `machine: "small-2x"`.
