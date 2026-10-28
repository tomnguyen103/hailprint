---
title: PowerShell `bash` starts WSL bash, which cannot see Windows paths
category: tooling
trigger: a script path in the scratchpad gives "No such file or directory" with exit 127, and the file exists
---

## Problem

An agent run started `bash <script>` from PowerShell to run the Engine 2 wrapper. The run ended with exit 127 and the message `No such file or directory`. The script existed.

## What did not work

`bash C:/Users/.../run-e2.sh` and `bash /c/Users/.../run-e2.sh` from PowerShell. A second try with an inline `bash -c '...'` string gave `unexpected EOF while looking for matching`, because PowerShell and the Bash tool both re-quote the string.

## Root cause

On this host `bash` resolves to `C:\Windows\system32\bash.exe`, the WSL launcher. WSL has its own file system, so a Windows path does not exist there. The Git Bash tool resolves `/c/Users/...`, and WSL does not.

## Fix

Name Git Bash in full and pass a script file, not an inline string:

```powershell
& "C:\Program Files\Git\bin\bash.exe" "<script>"
```

Inside the script, call helper scripts with `bash`, which is Git Bash there. Write a long command into a script file with the Write tool first.
