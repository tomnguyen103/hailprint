---
title: Every derived Parquet file carries source, product, and confidence metadata
category: data
trigger: local review Blocking finding on PR 2 - the archive index and the parcel counts had no schema metadata
---

## Problem

The spec STRIDE row for Repudiation says that every written file carries source and product metadata. The README says that every output names a radar-estimated hail size with a confidence band. The swath file met both rules. The archive index and the parcel-count file did not: `DataFrame.to_parquet` writes the pandas schema metadata alone.

## What did not work

A metadata step inside each command. Three commands write Parquet, and a fourth will follow. One step per command repeats the rule and misses the next command.

## Root cause

The write path was the only shared code, and it had no metadata step.

## Fix

`files.write_atomic` writes the three keys on every Parquet file: `files.METADATA` in `src/hailprint/files.py` holds the map, and `files.write_atomic` merges it into the pyarrow schema before the write. Every command writes through it. The `parcels` command prints the confidence band after the counts (`count_parcels` in `src/hailprint/__main__.py`). `test_write_atomic_parquet_carries_source_product_and_confidence` in `tests/test_files.py` asserts the keys.

A CSV has no schema metadata slot, and a comment header breaks `read_csv`. The candidate CSV therefore names its source in the README and the column names.
