---
title: CodeRabbit reports a check run, not a commit status
category: tooling
trigger: a poll of the commit status of a PR head shows no CodeRabbit entry, while the PR page shows one
---

## Problem

The wait protocol polled `repos/<owner>/<repo>/commits/<sha>/status` for CodeRabbit. The poll found no CodeRabbit entry for the whole wait, so it looked like CodeRabbit never started.

## What did not work

`gh api repos/<owner>/<repo>/commits/<sha>/status`. It lists commit statuses, and CodeRabbit posts none.

## Root cause

CodeRabbit posts a GitHub check run. A check run lives under the `check-runs` endpoint, not under `status`.

## Fix

Poll the check run of the PR head and match its name without case:

```bash
gh api "repos/<owner>/<repo>/commits/<sha>/check-runs" \
  --jq '.check_runs[] | select(.name|test("coderabbit";"i")) | .status + "/" + (.conclusion // "none") + " | " + (.output.title // "")'
```

`completed/success` with the title "Review completed" means findings wait in the PR comments. A title with "Review skipped" means the PR needs an `@coderabbitai review` comment. Count a rate limit only from a comment whose author login is `coderabbitai`.
