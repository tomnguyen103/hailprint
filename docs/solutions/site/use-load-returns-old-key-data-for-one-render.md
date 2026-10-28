---
title: A load hook that resets in an effect returns the old key data for one render
category: site
trigger: the audit found that a storm switch painted the power fill of the old date for one frame
---

## Problem

`useLoad` took a `key` and reset its state to `loading` inside `useEffect`. After a key change the first render still returned the `ready` data of the old key. A consumer used that data for one frame. The power peak of the old storm date became the default step of the new storm date, and the map painted the old fill at that step.

## What did not work

The route-level `Workspace` has no `key`, so the component and its hook state survive a date switch. The effect cleanup and the late `STALE` guard stopped a late response from landing. They did not cover the render between the key change and the effect.

## Root cause

Preact runs the render before the effect. State that the effect resets is stale during that render. The hook returned state with no link to the key that produced it.

## Fix

The state holds the `key` with the load. The hook returns `loading` when the stored key differs from the current key (`site/src/state/load.ts`). A test renders key A, rerenders with key B, and asserts that the first render for B never carries the data of A (`site/src/state/load.test.tsx`).

Rule: a hook that loads by key stores the key with the result and compares it at render time. An effect that resets state runs too late for the first render.
