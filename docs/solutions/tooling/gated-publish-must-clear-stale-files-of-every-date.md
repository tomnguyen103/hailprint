---
title: A gated publish layer must clear its stale files for every date, and one bad file must not stop the run
category: tooling
trigger: Batch C audits found that publish without --with-internet left old internet.json files, and that one bad internet file failed a whole run
---

## Problem

`publish --with-internet` gates the internet layer. A run without the flag must publish no `internet.json`. Two defects broke this rule during batch C.

- The per-date loop removed a stale `internet.json` only for a date that the run published. A date that the run skipped kept its old file, and the index still named it.
- A read of the internet Parquet file sat inside the per-date `try`, which caught only `ValueError`. A file without the `ratio` column raised `KeyError` and stopped the whole run.

## What did not work

Removing the file inside the per-date loop. The loop never reaches a date that the run skips, so a per-date unlink hides the gap.

## Root cause

The gate is global, but the cleanup ran per date. The read of an optional layer had the same error scope as the required files.

## Fix

- `_remove_internet_files` in `src/hailprint/__main__.py` globs `*/internet.json` under `site/data/storms/` once per run and removes every match when the flag is off. `publish.merge_entries` then sets `files.internet` to null for each removed file.
- `_internet_layer` catches `OSError`, `ValueError`, and `KeyError`, prints a note, and returns None. The date publishes without the layer. `internet --missing` fetches an unreadable file again.

Rule: a flag that turns a layer off clears the layer for all dates, in one place, before the index write. An optional layer read never fails a required file. A new gated layer adds a test for both cases next to `test_publish_without_the_flag_removes_the_internet_json_of_a_date_it_does_not_publish` in `tests/test_cli.py`.
