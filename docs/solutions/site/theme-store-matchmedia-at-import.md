---
title: Theme store reads matchMedia at import
category: site
trigger: "window.matchMedia is not a function" or "window is not defined" when a vitest file imports site/src/state/theme.ts
---

## Problem

`site/src/state/theme.ts:5` calls `window.matchMedia` at module load. The store keeps one preference, one listener set, and one media listener for the page, so the call sits at the top level on purpose. A vitest file that imports the store, or any module that imports it, fails under the default node environment.

## What did not work

Nothing failed yet. The pure functions (`read`, `resolve`, `apply`, `store`) live in `site/src/theme.ts` and `site/src/theme.test.ts` tests them without the store.

## Root cause

The store is browser-only by design. The split between `site/src/theme.ts` (pure) and `site/src/state/theme.ts` (store) keeps the testable part free of `window`.

## Fix

Test the pure module, not the store. A test that needs the store sets `// @vitest-environment jsdom` at the top of the file and stubs `window.matchMedia` with `vi.stubGlobal` before the import, through `await import("./state/theme")` after the stub.
