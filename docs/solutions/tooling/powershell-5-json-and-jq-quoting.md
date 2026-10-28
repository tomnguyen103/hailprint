---
title: PowerShell 5.1 unrolls a JSON array and mangles `--jq` quotes
category: tooling
trigger: `gh api ... --jq` returns a syntax error in PowerShell, or `ConvertFrom-Json` gives one object where the JSON holds an array
---

## Problem

Two Windows PowerShell 5.1 traps cost several tool calls in the PR 12 and PR 13 runs.

## What did not work

- `gh api ... --jq '.[] | {"login": .user.login}'` typed inline in PowerShell. The inner double quotes vanished, and `jq` reported a syntax error.
- `$x = gh api ... | ConvertFrom-Json`, then `$x.Count`. A one-element array became a bare object, and a pipeline that expected an array saw one item at a time.

## Root cause

PowerShell 5.1 strips the double quotes of an argument it passes to a native program. `ConvertFrom-Json` in 5.1 emits the items of a top-level array into the pipeline one by one, and it has no `-NoEnumerate`.

## Fix

- Keep jq programs free of double quotes, or put the program in a here-string or a file and pass it with `--jq (Get-Content -Raw <file>)`. Run long `gh` and `jq` flows from a script file with Git Bash (see `powershell-bash-is-wsl-use-git-bash.md`).
- Wrap the result in `@( ... )` before a `.Count` or an index: `$x = @(gh api ... | ConvertFrom-Json)`.
- Write the literal `owner/repo` in the `gh api` path. A PowerShell variable in the path works, but a bash `$REPO` does not carry over.
