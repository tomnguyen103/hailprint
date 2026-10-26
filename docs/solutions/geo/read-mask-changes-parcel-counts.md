---
title: A change to the parcel read mask changes the parcel counts
category: geo
trigger: the 2024-05-28 lowest-class count reads 361421 instead of 361418
---

## Problem

PR B counted parcels with one join. A review asked to densify the read mask like the join, so no parcel in a chord sliver is dropped at read.

## What did not work

The densified mask read 3 more parcels. The 2024-05-28 lowest-class count became 361421. The plan exit check demands the same counts as before, so the change broke the check.

## Root cause

The straight-edge mask and the densified polygon differ by thin slivers along the swath edge. A parcel in a sliver passes one test and fails the other. The unit tests with the 5-parcel fixture cannot see this.

## Fix

Keep the straight-edge read mask and record the limit in the `shortcut:` comment at `src/hailprint/parcels.py:68`. The real-data test at `tests/test_parcels.py:167` pins the six counts. Run that test after any change to a mask, a densify step, or a CRS step.
