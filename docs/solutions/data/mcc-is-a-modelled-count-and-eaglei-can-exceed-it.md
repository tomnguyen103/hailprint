---
title: The MCC is a modelled count, and an EAGLE-I utility count can pass it
category: data
trigger: Oracle O3 failed on the 2024 EAGLE-I file with a share out of 1.694
---

## Problem

Oracle O3 asserts that the share out stays at or below 1.0 for every county and step of 2024. The real file broke it on 2024-07-08 (Hurricane Beryl).

| County | Max customers out | MCC | Share |
|---|---|---|---|
| Waller (48473) | 31,398 | 18,532 | 1.694 |
| Brazoria (48039) | 164,845 | 144,164 | 1.144 |
| Galveston (48167) | 164,920 | 144,421 | 1.142 |
| Montgomery (48339) | 246,212 | 230,040 | 1.070 |

## What did not work

Suspecting a wrong constant. The `power.MCC` values equal the rows of the ORNL `MCC.csv` file (figshare file 42547708, read on 2026-10-27), so the denominator is correct.

## Root cause

The MCC is a modelled customer count per county as of 2022. Utility outage maps count meters by service area, and a service area does not follow the county line. A small county can show more customers out than its modelled count. The V5 plan row tested only Harris against the MCC and assumed that every county holds.

## Fix

`power.share_out` and the site `shareOut` return `min(1, out / MCC)`. DECISIONS row 16 records the rule. The inspector still prints the raw "out of customers" counts.

Rule: a ratio oracle runs on the real file for every county before the plan states a bound. A bound that holds for the largest county says nothing about the small ones.
