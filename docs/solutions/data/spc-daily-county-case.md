---
title: The SPC daily CSV spells some county names in upper case
category: data
trigger: Engine 1 review of PR 5 - 24 of 81 Harris rows in the scored pairs read "HARRIS"
---

## Problem

`reports.harris_reports` keeps a row when `county == "Harris"`. The SPC daily CSV writes the county in upper case on some days. Those rows fail the test and drop out of the Harris report count.

## What did not work

Reading the doc claim "18 of 99 scored reports lie outside Harris" as the output of `harris_reports`. The claim holds only for a case-insensitive comparison. The code rule gives 42.

## Root cause

The WCM database writes "Harris". The preliminary daily CSV has no fixed case. `harris_reports` was written against the WCM spelling.

## Fix

Shipped in v0.2.0. `reports.harris_reports` trims and casefolds the county and the state, then compares with `harris` and `tx`. `HARRISON, TX` and `Harris, OK` stay out. The test `tests/test_reports.py::test_harris_reports_matches_county_and_state_without_case_or_space` holds the rule. No score changes, because `score` reads `nearby_reports` by distance. The count in `ingest` and the `report_count` in `candidate-days.csv` for `spc-daily` rows change.
