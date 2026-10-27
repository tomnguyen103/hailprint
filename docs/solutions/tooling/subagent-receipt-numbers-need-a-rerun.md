---
title: A subagent receipt with real-data numbers needs an independent re-run
category: tooling
trigger: a receipt reports a count or a timing that no tool result in the main session shows
---

## Problem

An implement subagent reported parcel counts and a run time for 2024-05-28. The main session copied them into the PR text.

## What did not work

Trust in the receipt. A later change moved one count by 3, and the earlier receipt hid it until a re-run.

## Root cause

A receipt is a summary. The main session cannot tell a measured number from a copied one.

## Fix

Re-run the real-data check in the main session before a number enters a PR body or a doc. Pin the number in a test that self-skips without the data: `tests/test_parcels.py:232`. Cite the tool result, not the receipt.
