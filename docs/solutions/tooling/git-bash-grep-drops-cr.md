---
title: A CRLF guard in a shell script passes on Git Bash when it reads through grep
category: tooling
trigger: a test writes a CRLF .env and the script accepts it, or a test writes an LF .env with write_text and the script refuses it as CRLF
---

## Problem

The former `scripts/deploy.sh` and `scripts/nightly.sh` (removed when Trigger.dev replaced the cron scripts, `docs/DECISIONS.md` row 18) sourced `.env` as shell and refused a CRLF file first. The first guard matched `\r` through `grep` and through a `case` pattern. On this Windows host, the CRLF test passed the file, and two LF tests failed as CRLF.

## What did not work

`grep -c $'\r' .env` and `case "$line" in *$'\r'*)` as the CRLF guard. In the tests, `Path.write_text("A=1\n")` for an LF `.env`.

## Root cause

Git for Windows `grep` strips the CR from each line before the match, so no pattern sees it. Python `write_text` on Windows translates `\n` to `\r\n` unless `newline="\n"` is set, so the test fixture itself was CRLF.

## Fix

Count the CR bytes instead of matching a line: `tr -cd '\r' < .env | wc -c` in both scripts. The test fixture wrote `.env` through one helper with `newline="\n"` in `tests/test_scripts.py`. The scripts and the test are removed; the rule stays for any new shell guard. A deliberate CRLF fixture uses `write_bytes`.
