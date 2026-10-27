---
title: File writes from an agent on this Windows host
category: tooling
trigger: Bash heredoc with non-ASCII text writes mojibake, a heredoc with an apostrophe fails with unexpected EOF while looking for matching quote, or the Write and Edit tools are blocked by a hook
---

## Problem

A Bash heredoc on this host writes non-ASCII text (em dash, arrows, box-drawing) as mojibake. The Write and Edit tools are blocked by a `needs_refresh` hook when the file changed since the last Read.

## What did not work

A Bash heredoc for the PR body and the evidence report. A Write call directly after a shell edit of the same file. A Bash heredoc whose body holds an apostrophe: the Bash tool on this host fails the whole call with `unexpected EOF while looking for matching quote`, even inside a quoted heredoc.

## Root cause

Git Bash runs the heredoc through the system code page, not UTF-8. The hook is correct: a stale Read is a stale edit base.

## Fix

Non-ASCII text goes through a PowerShell here-string and `[IO.File]::WriteAllText(path, text, (New-Object Text.UTF8Encoding $false))`. ASCII text and code edits go through a short Python script in a Bash heredoc with `Path.write_text(..., encoding="utf-8", newline="\n")`. Read a file again before a Write or Edit after a shell edit.

Text with an apostrophe goes through the Write tool. The Write hook returns `brief_delivered_retry_required` once per new path; the same Write call succeeds on the retry.

A script that needs quotes goes to a file in the scratchpad through the Write tool. When the Bash tool fails on a plain `bash <script>` call with `syntax error: unexpected end of file`, run the script through PowerShell with `& "C:\Program Files\Git\bin\bash.exe" <script>`. The plain `bash` on the PowerShell path is WSL and does not see Windows paths.
