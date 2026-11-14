---
title: Non-allowlisted objects in the public S3 bucket must skip cleanly during sync_down
category: tooling
trigger: nightly and backfill fail in sync_down with ValueError unsafe S3 key on unmanaged public bucket objects
---

## Problem

An unmanaged object (`pooled-golden.json`) in `hailprint-public` causes `cloud.sync_down(..., public=True)` to raise `ValueError("unsafe S3 key")`.
That exception aborts `nightly` and `backfill` before any pipeline step runs.

## What did not work

Direct use of `_validate_key(..., public=True)` inside `sync_down` treats harmless unmanaged objects identically to path traversal.
An eager `size > max_bytes` check in `_list_objects` also fails on oversized unmanaged objects before `sync_down` filters keys.

## Root cause

`sync_up(..., public=True)` skips non-`_PUBLIC_KEY_RE` local files, while `sync_down(..., public=True)` rejects non-`_PUBLIC_KEY_RE` remote keys.
`_list_objects` also enforces `max_bytes` before `exclude_prefixes` and `public` filters run.

## Fix

- Widen `_list_objects` in `src/hailprint/cloud.py` to return `(key, etag, size)` without eager size rejection.
- In `sync_down`, run `_matches_prefix` and `_validate_key(key, local_base, public=False)` first so traversal and foreign-prefix keys raise `ValueError("unsafe S3 key")`.
- Skip excluded prefixes and non-`_PUBLIC_KEY_RE` keys when `public=True` before the `size > max_bytes` check.
- Keep `_validate_key(..., public=True)` strict for direct allow-list callers.

Rule: `sync_down` must separate path-safety checks from allow-list skips so `sync_down` and `sync_up` match symmetrically.
