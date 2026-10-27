---
title: A new impact layer needs a publish command test, not only a build_day test
category: tooling
trigger: the audit found that hailprint publish never wrote power.json, while every power test passed
---

## Problem

Batch B added `power.json`. `publish.build_day` took a `power` argument and wrote the file. The `_publish_days` command never passed that argument. A real `hailprint publish` run wrote no `power.json` and left `files.power` null in the storms index.

## What did not work

The gate. The unit tests called `publish.build_day` directly. The browser check used `synth_power.py`, which writes `power.json` into `site/data/` by hand. Both paths skipped the command.

## Root cause

No test ran `hailprint publish` with a power file on disk. The wiring between the Parquet file and `build_day` had no test, and a hand-written output file hid the gap. Batch A had the same gap for `warnings.geojson`.

## Fix

- `_publish_days` in `src/hailprint/__main__.py` reads the power file of the date, passes it as `power=`, and removes a stale `power.json`.
- Command-level tests in `tests/test_cli.py` cover the EAGLE-I file, the ODIN file with its utilities, the missing file, the stale file, and a file without metadata. A warnings test covers the same wiring.

Rule: every new published layer gets a `cli.main(["publish", ...])` test that starts from the derived Parquet file, before the PR opens. A script that writes the output by hand proves the site, not the pipeline.
