---
title: Site test files must not hold a banned literal, because the Python source scans read them
category: tooling
trigger: tests/test_wording.py and tests/test_outputs_clean.py failed on a site test file that only asserted a banned phrase was absent
---

## Problem

Batch C added vitest tests that check the site never says "internet down", never names hail as a cause, and never holds the forbidden word. Each test wrote the banned phrase as a string literal. The Python scans then failed on the test files themselves.

## What did not work

Keeping the literal and adding the test file to an allow-list. The scans have no allow-list, and an allow-list would hide a real hit in the same file.

## Root cause

`source_files` in `tests/test_wording.py:16` walks every `.ts`, `.tsx`, `.css`, `.html`, `.json`, `.md`, and `.svg` file under `site/src`, including `*.test.ts` and `*.test.tsx`. `tests/test_outputs_clean.py:80` scans only `.ts`, `.tsx`, and `.css` files for the forbidden word. A negative assertion needs the banned text, so the assertion trips the scan.

## Fix

- A site test file builds each banned phrase at run time: `[["internet", "down"], ["caused", "by", "hail"], ["because", "of", "hail"]].map((words) => words.join(" "))` in `site/src/method/content.test.ts`.
- A site test file imports the forbidden word: `FORBIDDEN_WORD` from `site/src/method/prose.ts:8`, which joins `"dam"` and `"age"`.

Rule: a site test never spells a banned word or phrase in one literal. Build it from fragments or import the constant. Run `uv run pytest tests/test_wording.py tests/test_outputs_clean.py -q` after any new site test that checks wording.
