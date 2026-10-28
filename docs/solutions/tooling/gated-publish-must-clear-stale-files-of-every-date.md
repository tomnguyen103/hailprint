---
title: A gated publish layer must clear its stale files for every date, and one bad file must not stop the run
category: tooling
trigger: Batch C audits found that publish without --with-internet left old internet.json files, that one bad internet file failed a whole run, and that a failed run left an index that named deleted files
---

## Problem

`publish --with-internet` gates the internet layer. A run without the flag must publish no `internet.json`. Three defects broke this rule or the index.

- The per-date loop removed a stale `internet.json` only for a date that the run published. A date that the run skipped kept its old file, and the index still named it.
- A read of the internet Parquet file sat inside the per-date `try`, which caught only `ValueError`. A file without the `ratio` column raised `KeyError` and stopped the whole run.
- The run removed stale files before it validated and wrote `storms.json`. A failed validation left the old index, and that index listed files that no longer existed. The site requested those files and got 404.

## What did not work

- Removing the file inside the per-date loop. The loop never reaches a date that the run skips, so a per-date unlink hides the gap.
- Removing the stale files before the index write. A failure between the unlink and the write leaves the old index and the removed files apart. A restore would need a backup copy of every removed file.

## Root cause

The gate is global, but the cleanup ran per date. The read of an impact layer had the same error scope as the required files. The unlink ran before the index write, so the files and the index could disagree after a failed run.

## Fix

- `publish_run.stale_files(written, with_internet, site)` in `src/hailprint/publish_run.py` collects the stale files once per run. A stale file is an existing ZIP count, warnings, power, or internet file of a date that the run published and did not write. A run without the flag adds every `*/internet.json` under `site/data/storms/`, also of a date that the run does not publish.
- `publish.merge_entries(old, new, data_dir, absent=...)` treats each collected path as gone. The new index lists it as null before the file is removed.
- `publish_run.remove_stale` unlinks the collected files after `storms.json` and `pipeline.json` are written, inside the publish lock. An unlink that raises `OSError` prints one stderr line and does not change the exit code. A crash before the unlink leaves a file that the index does not list, and the next run that publishes that date collects it again.
- `publish_run.impact_layer(kind, path, storm_date, run_time)` catches the `runs.UNREADABLE` tuple, prints a note, and returns None. The date publishes without the layer. `internet --missing` fetches an unreadable file again.

## Second pass (v6 hardening)

The first catch was too narrow. A pyarrow type error is a `TypeError`, a text `step_utc` column raises `AttributeError` at the `.dt` accessor, and a file without the source metadata raises `ValueError` after the read. Each one still stopped the date or the run.

- `runs.UNREADABLE` in `src/hailprint/runs.py` lists `OSError`, `ValueError`, `KeyError`, `TypeError`, `AttributeError`, `pa.ArrowException`, and `shapely.errors.ShapelyError`, and `pyproj.exceptions.ProjError`. A geometry column with invalid WKB raises a `GEOSException`, which is a `ShapelyError`. A `crs` entry that pyproj cannot parse raises a `CRSError`, which is a `ProjError`. `runs.internet_settled` uses the same tuple.
- The dry run reads the file, reads the source metadata, and runs `publish.layer_doc`, `publish.validate`, and `publish.dumps` inside one `try`. A file that `build_day` would reject now skips only its layer.
- The dry run covers the schema of the document. A negative ratio fails `validate` and skips the layer, where it first failed the date with exit 1. A code defect in the receipt builder still fails the date, which is the correct stop.

## Third pass (publish layer errors)

The warnings and power layers had no dry run, and the per-date catch and the settle checks were still too narrow.

- `publish_run.impact_layer` serves the warnings, power, and internet layers. It calls `publish.layer_doc`, the same builder that `build_day` calls, so the dry run and the real build cannot differ. A bad warnings or power file skips only its layer, and `publish` exits 0.
- The per-date catch in `publish_run.run` is `runs.UNREADABLE`. A required file (swath, SPC CSV, ZIP counts) that raises one of these classes fails only its date. The run publishes the other dates and exits 1 at the end. A `ValueError` prints `<ClassName>: <message>` and any other class prints its `repr`, so the line always names the error class.
- `runs.rows` returns the row count of a Parquet file, or None when the read raises a `runs.UNREADABLE` class. `runs.warnings_settled` treats None as not settled, and `runs.needs_power` catches `runs.UNREADABLE`. `warnings --missing` and `power --missing` fetch again for a corrupt file.

Rule: a flag that turns a layer off clears the layer for all dates, in one place, and the run removes the files only after it writes the index. A failed run then leaves the old index and the old files together. An impact layer read never fails a required file. The catch of an impact layer lists every error class that its parsers raise, and a dry run of the builder moves the builder errors inside the same catch. A new gated layer adds a test for both cases next to `test_publish_without_the_flag_removes_the_internet_json_of_a_date_it_does_not_publish` in `tests/test_cli.py`.
