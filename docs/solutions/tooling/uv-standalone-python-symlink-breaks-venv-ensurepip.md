---
title: Symlinking only bin/python3 from uv standalone Python breaks python3 -m venv in Docker
category: tooling
trigger: "Command '['/opt/venv/bin/python3', '-m', 'ensurepip', '--upgrade', '--default-pip']' returned non-zero exit status 1"
---

## Problem

When `trigger.config.ts` installs Python 3.12 with `uv python install 3.12 --install-dir /opt/python` (from `ghcr.io/astral-sh/uv:0.7.2`) and symlinks only `/usr/local/bin/python3` to `/opt/python/cpython-3.12.../bin/python3.12`, `@trigger.dev/python` later runs `python3 -m venv /opt/venv`. Inside `/opt/venv/pyvenv.cfg`, `venv` records `home = /usr/local/bin`. In `uv 0.7.2` (`cpython-3.12.10+20250409`), `/opt/venv/bin/python3` resolves its standard library relative to `home` (`/usr/local/lib/python3.12`), misses `/opt/python/cpython-3.12.../lib/python3.12`, and fails during `ensurepip` with exit code 1.

## Solution

Copy the full `uv` standalone Python tree (`bin`, `lib`, `include`, `share`) into `/usr/local/` before creating `/usr/local/bin/python3`:

```dockerfile
RUN uv python install 3.12 --install-dir /opt/python && cp -a /opt/python/cpython-*/* /usr/local/ && rm -f /usr/local/lib/python3.12/EXTERNALLY-MANAGED && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3
```

Guard: `tests/test_cloud.py::test_trigger_tasks_share_pipeline_queue_and_pin_uv`.
