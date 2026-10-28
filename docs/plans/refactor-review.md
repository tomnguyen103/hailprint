# Refactor plan: review findings (2026-10-28)

This plan turns the 2026-10-28 codebase review into five PRs and one backlog.
Each PR runs the full pipeline: `/grill-with-docs`, `/to-spec`, `/to-tickets`, `/implement`, `/audit-loop`, then `pr-workflow` to merge.
The spec and the tickets go under `.scratch/<feature>/`. This file is the input to the grill, not a substitute for it.

Finding ids (E = error handling, A = architecture, M = maintainability) refer to the review table in the session transcript.
Line numbers are from commit `37bb6c1`. Recheck them at implement time.

## Order and dependencies

| PR | Branch | Findings | Behavior change | Depends on |
|----|--------|----------|-----------------|------------|
| 1 | `fix/publish-layer-errors` | E2, E3, E4 | Yes (flagged below) | none |
| 2 | `fix/map-load-failure` | E1, E7, M8 (theme) | Yes (flagged below) | none |
| 3 | `refactor/impact-window` | A2, M2, M6 (dead line) | No | PR 1 (both edit `publish.py` and `__main__.py`) |
| 4 | `refactor/cli-runs` | A1, M1 | No | PR 1, PR 3 |
| 5 | `refactor/site-impact` | M3, M4, A4, A5, M8 (rest) | One choice (flagged below) | PR 2 (both edit `map-pane.tsx`) |

PR 1 and PR 2 are independent. CodeRabbit gives one review per hour on this plan, so the PRs merge one at a time in the order above.
PR 2 can open while PR 1 waits for its review.

## Gates for every PR

- `make lint`, `make test`, and `cd site && npm run check` pass before each push.
- A UI diff (PR 2, PR 5) also passes `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <paths>` with exit 0.
- The local gate runs both review engines, at most three rounds, per `pr-workflow`.
- A pure refactor (PR 3, PR 4) changes no test assertion. Only imports in tests may change.
- A bugfix (PR 1, PR 2) adds the repro test first and sees it fail. It also adds one `docs/solutions/` entry per the learn loop.

---

## PR 1: publish and `--missing` error handling

### Goal

One bad impact file never aborts a publish run. A failed run never leaves `storms.json` pointing at deleted files.
One corrupt warnings file never stops `warnings --missing`.

### E2: per-date handler and optional layers

Current state:

- `_publish_days` ([__main__.py:657](src/hailprint/__main__.py:657)) wraps each date in a try that catches only `ValueError` at line 718.
- `main` ([__main__.py:206](src/hailprint/__main__.py:206)) catches `(RuntimeError, OSError, ValueError)`.
- A power or warnings file without a column raises `KeyError` in `publish.power_doc` or `publish.warnings_doc`. The run stops with a traceback.
- An unreadable file raises `OSError`. The run stops with exit 1 after earlier dates were written and before `storms.json`.
- Only the internet layer has a dry run, in `_internet_layer` ([__main__.py:603](src/hailprint/__main__.py:603)).

Change:

1. Generalize `_internet_layer` into one helper for all three impact layers.
   ```python
   def _impact_layer(name: str, path: Path, doc: Callable[[], dict], schema: str) -> dict | None:
       """The layer document, or None when the file cannot become a valid document."""
       if not path.exists():
           return None
       try:
           out = doc()
           publish.validate(out, schema)
           publish.dumps(out, schema)
       except _UNREADABLE as error:
           print(f"publish: {path.name}: {name} layer skipped: {error}", file=sys.stderr)
           return None
       return out
   ```
   Keep the stderr text of the current `_internet_layer` if it differs. The internet tests assert it.
2. Call `_impact_layer` for warnings, power, and internet before `publish.build_day`. Pass the result, not the path, into `build_day`.
3. Widen the per-date catch at line 718 from `ValueError` to `_UNREADABLE`. A required file (swath, reports, ZIP counts) that fails now fails only its date. The run continues and exits 1 at the end, as a `ValueError` does today.

Behavior change (flag in the spec and the PR body):

- A bad power or warnings file no longer fails its date. The date publishes without that layer, and stderr names the file.
- This follows the rule in `docs/solutions/tooling/gated-publish-must-clear-stale-files-of-every-date.md`: an optional layer read never fails a required file.
- `test_publish_exits_1_and_names_the_file_for_a_power_file_without_metadata` ([test_cli.py:1517](tests/test_cli.py:1517)) asserts the old behavior. Replace it. Do not delete it silently.
- A `KeyError` or `OSError` from a required file now fails one date with a message, not the whole run.

The grill decides one question: does a skipped layer count as a failure for the exit code? Recommendation: no. Exit 0, stderr line only. The site already shows a missing layer as a note.

### E3: stale-file removal after the index write

Current state:

- `_remove_internet_files()` runs at [__main__.py:741](src/hailprint/__main__.py:741), before `merge_entries` (742), validate (748-749), dumps (750-751), and the writes (752-755).
- The four unlink blocks at 725-732 also run before the index write.
- If validation fails, the old `storms.json` still lists the deleted files. The site gets 404s.
- `publish.merge_entries` ([publish.py:463](src/hailprint/publish.py:463)) nulls an impact path when the file is gone from disk. So the order matters: a plain move of the unlink after the merge leaves a stale path in the index.

Change:

1. Replace each unlink with a path collector. `_stale_files(...) -> set[Path]` returns every per-date layer file and every internet file to remove.
2. Add a keyword to the merge: `merge_entries(..., absent: frozenset[Path] = frozenset())`. A path in `absent` counts as gone.
3. Order in `_publish_days`: collect stale paths, merge with `absent`, validate, dump, write `storms.json` and `pipeline.json`, then unlink the stale paths.
4. An unlink failure after the index write prints one stderr line and does not change the exit code. The index no longer lists the file, so the site never requests it.

No behavior change on success. On a failed validation, the old files stay in place.

### E4: one guarded row read for the settle checks

Current state:

- `_warnings_settled` ([__main__.py:363](src/hailprint/__main__.py:363)) calls `pq.read_metadata(path).num_rows` with no guard. `ArrowInvalid` (a `ValueError` subclass) stops the whole `warnings --missing` run.
- `_internet_settled` (520) catches `_UNREADABLE` and refetches.
- `_needs_power` (485) catches only `(OSError, ValueError)`.

Change:

```python
def _rows(path: Path) -> int | None:
    """The row count of a Parquet file, or None when the file is unreadable."""
    try:
        return pq.read_metadata(path).num_rows
    except _UNREADABLE:
        return None
```

- `_warnings_settled`: an unreadable file is not settled, so the run fetches that date again.
- `_internet_settled` and `_needs_power` use `_rows` or the same `_UNREADABLE` tuple.

Behavior change: a corrupt warnings file now triggers a refetch, as internet does today. Before, it stopped the run.

### Tests (tests/test_cli.py)

| Test | Kind |
|------|------|
| `test_publish_skips_the_power_layer_of_a_power_file_without_metadata` | Replaces line 1517 |
| `test_publish_skips_the_warnings_layer_of_a_warnings_file_without_a_column` | New, repro for E2 `KeyError` |
| `test_publish_fails_only_the_date_of_a_swath_file_it_cannot_read` | New, repro for E2 `OSError` |
| `test_publish_keeps_the_old_internet_json_when_the_index_fails_validation` | New, repro for E3 |
| `test_publish_lists_no_removed_file_in_storms_json` | New, guards the `absent` merge |
| `test_warnings_missing_fetches_again_for_a_date_with_a_corrupt_file` | New, repro for E4 |

Keep `test_publish_without_the_flag_removes_a_stale_internet_json` (1619) and `..._of_a_date_it_does_not_publish` (1632) green and unchanged.

Learn-loop entry: update `docs/solutions/tooling/gated-publish-must-clear-stale-files-of-every-date.md` with the "unlink after the index write" rule.

---

## PR 2: map load failure and an error boundary

### E1: `createMap` rejects only on a fatal error and cleans up

Current state ([create-map.ts:136-139](site/src/storms/map/create-map.ts:136)):

```ts
await new Promise<void>((resolve, reject) => {
  map.once("load", () => resolve());
  map.once("error", (e) => reject(e.error ?? new Error("map failed to load")));
});
```

- MapLibre fires `error` for one failed tile (a 404 tile fires none), so one tile failure kills the map.
- The reject path never calls `map.remove()`. The WebGL context leaks, and Retry mounts a second canvas.
- There is no timeout.

Change:

```ts
const LOAD_TIMEOUT_MS = 15_000;

await new Promise<void>((resolve, reject) => {
  const done = () => {
    clearTimeout(timer);
    map.off("error", onError);
  };
  const fail = (error: unknown) => {
    done();
    map.remove();
    reject(error);
  };
  // A tile error carries a tile; any other error (style, source metadata) stops the load.
  const onError = (e: ErrorEvent & { tile?: unknown }) => {
    if (e.tile === undefined) fail(e.error ?? new Error("map failed to load"));
  };
  const timer = setTimeout(() => fail(new Error(`map did not load in ${LOAD_TIMEOUT_MS} ms`)), LOAD_TIMEOUT_MS);
  map.on("error", onError);
  map.once("load", () => {
    done();
    resolve();
  });
});
```

MapLibre 6.16.0 fires a tile error with `{ tile }` (`ErrorEvent(err, { tile })` in the tile manager) and skips a 404 tile. A source-metadata or style error carries no `tile`, so it stops the load. Confirm this in `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs` and the MapLibre docs (Context7) before the edit.

Behavior change: a failed tile no longer shows the map error overlay. The map loads with a gap.

### E7: one error boundary per area

`site/src/app.tsx` has no boundary, so a render throw blanks the page. Add `site/src/shell/area-boundary.tsx`:

```tsx
import type { ComponentChildren } from "preact";
import { useErrorBoundary } from "preact/hooks";
import { DataError } from "../data/types";
import { ErrorState } from "./states";

export function AreaBoundary({ children }: { children: ComponentChildren }) {
  const [error, reset] = useErrorBoundary();
  if (error) return <ErrorState error={new DataError("page", String(error))} onRetry={reset} />;
  return <>{children}</>;
}
```

Wrap `body` in `App` inside `Layout`, so the top bar stays.
Key the boundary on the route so navigation clears it.

Behavior change: a render throw shows the error state with Retry, not a blank page.

### M8 (theme part)

The create effect in [map-pane.tsx:66-104](site/src/storms/map-pane.tsx:66) reads `theme` but depends only on `[attempt]`. A Retry after a theme switch creates the map with the old theme.
Read the theme through a ref, as `onCountyRef` does.

### Tests

| Test | File |
|------|------|
| A tile `error` (with `tile`) does not reject; `load` resolves | `site/src/storms/map/create-map.test.ts` (new, stub map with an event emitter) |
| A style `error` rejects and calls `remove()` once | same |
| A source-load `error` (with `sourceId`, no `tile`) rejects and calls `remove()` once | same |
| No `load` within the timeout rejects and calls `remove()` (fake timers) | same |
| A child that throws renders `ErrorState`; Retry renders the child again | `site/src/shell/area-boundary.test.tsx` (new) |

Learn-loop entry: `docs/solutions/site/maplibre-error-event-fires-per-tile.md`.

---

## PR 3: one owner for the impact window

### Goal

One module owns the impact window and its step grid. `power_doc` and `internet_doc` share one alignment check. No behavior change.

### New module `src/hailprint/impact.py`

```python
"""The impact window: 192 steps of 15 minutes from 12:00 UTC on the storm date."""

from datetime import date, datetime, timedelta

import pandas as pd

from hailprint import county

WINDOW = timedelta(hours=48)
STEP = timedelta(minutes=15)
STEPS = 192
METRO_FIPS = frozenset(county.METRO_NAMES)

assert STEP * STEPS == WINDOW


def window(storm_date: date) -> tuple[datetime, datetime]:
    """12:00 UTC on D up to 12:00 UTC on D+2."""
    ...  # body moves unchanged from sbw.window


def steps(storm_date: date) -> pd.DatetimeIndex:
    """The start of each step in the impact window."""
    start, _ = window(storm_date)
    return pd.date_range(start, periods=STEPS, freq=STEP)
```

Moves (remove the old names, no re-export):

| Old | New | Callers to update |
|-----|-----|-------------------|
| `sbw.window`, `sbw.WINDOW` ([sbw.py:36-43](src/hailprint/sbw.py:36)) | `impact.window`, `impact.WINDOW` | `__main__` 391, 443, 550; `internet` 130, 163; `publish` 236, 275; tests: `test_cli` 1093, 1151, 1212; `test_internet` 18; `test_publish` 1543; `test_sbw` 30, 225 |
| `power.STEP`, `power.STEPS`, `power.METRO_FIPS` ([power.py:19](src/hailprint/power.py:19), 33-34) | `impact.*` | `internet.py:13`, `publish.py`, `test_power` 156 |
| `pd.date_range(...)` in `power.derive` (124), `power.derive_odin` (144), `internet.derive` (152), `publish.power_doc` (236), `publish.internet_doc` (275) | `impact.steps(storm_date)` | same functions |

Run `codegraph_impact` on `window`, `STEP`, `STEPS`, and `METRO_FIPS` before the move to catch callers this table misses.

### `publish.py` helpers (M2)

```python
def _county_series(
    frame: pd.DataFrame, column: str, grid: pd.DatetimeIndex, layer: str
) -> dict[str, list[float | None]]:
    """One value per step for each metro county; raises ValueError when a county's steps differ from the grid."""
    out = {}
    for fips in county.METRO_NAMES:
        rows = frame.loc[frame["fips"] == fips]
        got = rows["step_utc"].dt.as_unit(grid.unit)
        if len(rows) != impact.STEPS or not got.isin(grid).all() or not got.is_unique:
            raise ValueError(f"{layer}: {fips}: the steps differ from the impact window")
        values = rows.assign(step_utc=got).set_index("step_utc")[column].reindex(grid)
        out[fips] = [None if pd.isna(v) else float(v) for v in values]
    return out


def _window_block(start: datetime) -> dict:
    return {
        "start": _utc_text(start),
        "step_minutes": int(impact.STEP.total_seconds() // 60),
        "steps": impact.STEPS,
    }
```

- Keep the exact per-value conversion each doc uses today. If `power_doc` and `internet_doc` differ there, pass a converter.
- The message prefix changes from a fixed `power:` to the layer name. Today `internet_doc` may also say `power:`; check the tests that match the text.
- Delete the dead `**dict.fromkeys(IMPACT_KEYS)` at [publish.py:750](src/hailprint/publish.py:750) (M6).

### Tests

- `tests/test_impact.py` (new): `steps(date(2024, 5, 28))` has 192 entries, starts at `2024-05-28 12:00 UTC`, and equals the old `pd.date_range` output for the same date (dtype and unit too).
- Every other test passes with import edits only.

---

## PR 4: business rules out of the CLI

### Goal

`__main__.py` holds argparse wiring and printing. The `--missing` rules, the run loop, and the publish run sit in modules that tests can call without argparse. No behavior change.

### Slice 4a: `src/hailprint/runs.py`

Move from `__main__.py`:

| Function | Lines | New name |
|----------|-------|----------|
| `_rows` (from PR 1) | | `runs.rows` |
| `_warnings_settled` | 363-372 | `runs.warnings_settled` |
| `_needs_power` | 485-497 | `runs.needs_power` |
| `_internet_settled` | 520-530 | `runs.internet_settled` |

Add one loop for `warn_days` (375-408), `power_days` (426-482), and `internet_days` (533-569):

```python
@dataclass
class Tally:
    done: list[date] = field(default_factory=list)
    skipped: list[date] = field(default_factory=list)
    failed: list[date] = field(default_factory=list)


def run_dates(
    dates: Iterable[date],
    build: Callable[[date], bool],
    *,
    errors: tuple[type[Exception], ...],
    on_error: Callable[[date, Exception], None],
) -> Tally:
    """Call build for each date; True is done, False is skipped, an error in `errors` is failed."""
```

- Each command keeps its own `errors` tuple: warnings `(RuntimeError, ValueError)`, power `(RuntimeError, ValueError, OSError)`, internet as today.
- Each command keeps its stderr lines and its final `ValueError` text, such as `warnings failed for: ...`.
- `power_days` keeps its rule: `built is None` adds to skipped, or raises for an explicit date. It also keeps the "N of M county steps have a row" line.
- The three copies of the `shortcut:` comment become one, on `run_dates`.

### Slice 4b: `src/hailprint/publish_run.py`

Move `_archive_summary` (572), `_pipeline_doc` (584), `_impact_layer` (from PR 1), `_stale_files` (from PR 1), and `_publish_days` (657) into `publish_run.run(dates, *, with_internet, now)`.
`publish_days` (629) in `__main__.py` keeps the lock and calls `publish_run.run`.

### Tests

- Existing CLI tests pass unchanged.
- New unit tests in `tests/test_runs.py` call `warnings_settled`, `internet_settled`, `needs_power`, and `run_dates` directly. They cover a corrupt file, a fresh date, and an old date.

---

## PR 5: site impact code

### M3: one fill spec for power and internet

Add `site/src/impact/fill-spec.ts`:

```ts
export interface FillSpec<B extends string> {
  edges: readonly number[];
  bins: readonly B[];
  labels: Readonly<Record<B, string>>;
  bin(value: number | null): B | "none";
}

export function binOf<B extends string>(edges: readonly number[], bins: readonly B[], value: number | null): B | "none" {
  if (value === null || value <= 0) return "none";
  // body: the shared edge walk from shareBin and dropBin
}
```

`impact/power.ts` and `impact/internet.ts` each export one spec built with `binOf`.

Behavior choice (flag): `shareBin` treats only `share === 0` as none; `dropBin` treats `drop <= 0` as none.
`shareOut` is `min(1, out / MCC)` and `drop` is floored at 0, so valid data never goes below 0. Unify on `<= 0`.
Check that `guardPower` rejects a negative customer count. If it does not, a negative share now shows no fill.

The legend wording differs (`NET_LABELS[0]` reads "above 0 to 2%"). Keep each label text as it is. Only the code path is shared.

### M4: split `impact/timeline.tsx` (562 lines)

| New file | Content |
|----------|---------|
| `impact/series.ts` | Pure series math: gap runs, peaks, `harrisPeak` (moves from `power.ts`) |
| `impact/timeline-chart.tsx` | The SVG paths, titles, and gap rects, one component with a `layer` prop |
| `impact/timeline-tables.tsx` | The three tables |
| `impact/timeline.tsx` | Composition only |

Replace fixed element ids with `useId` (M8), so two mounted timelines never collide.
Move the pure functions first, with their tests, then the components.

### A4: data layer imports nothing above it

Add `site/src/data/constants.ts` with `METRO_FIPS`, `HARRIS_FIPS`, the storm-date pattern `DATE`, and `STEPS`.
`guard.ts`, `impact/power.ts`, `county.ts`, `router.ts`, and `time/step.ts` import from it.
This also removes the second `HARRIS_FIPS` ([county.ts:18](site/src/county.ts:18), M8).
Move the geometry function that `state/county.ts` imports from `storms/map/geo` into a module without MapLibre imports, such as `site/src/geometry.ts`.

### A5: one counties request per page load

- `fetchCounties` ([county.ts:25](site/src/county.ts:25)) keeps one module-level promise. A rejected promise clears the cache, so Retry fetches again.
- `fetchCounty` (30-32) filters that same promise.
- The `useLoad("county", ...)` and `useLoad("counties", ...)` calls in [map-pane.tsx:43-44](site/src/storms/map-pane.tsx:43) stay. Only the network request is shared.

Behavior change: none visible. One request instead of two per mount.

### M8 (rest)

In [map-pane.tsx:151](site/src/storms/map-pane.tsx:151), rename `visible` to `hidden` so the name matches the value.

### Tests

- `impact/fill-spec.test.ts`: each edge value, 0, a negative value, and null, for both specs.
- `impact/series.test.ts`: the cases moved from the current timeline tests.
- `county.test.ts`: two calls make one fetch; a failed fetch is not cached.
- Existing tests pass with import edits only.

---

## Backlog (not in this programme)

| Id | Item | Note |
|----|------|------|
| E5 | `mesh.download_many` ([mesh.py:62](src/hailprint/mesh.py:62)) drops `f.exception()` | Name the error class and text for each key. Extend `test_download_many_404_on_one_key_lands_the_others_then_raises` |
| E6 | `files.lock` has no pid liveness check | A stale lock stops the 15-minute `odin` cron, and ODIN snapshots are lost. Check the pid with `os.kill(pid, 0)` on POSIX and `OpenProcess` on Windows |
| A3 | `files.write_atomic` merges the MRMS metadata into every Parquet | Behavior change to a persisted format. Needs a `docs/DECISIONS.md` row and a migration of existing files |
| E8 | `guard.ts` gaps: index rows, `parcel_total`, date order, `unverifiable_km2` length, geometry type | Site-only fix PR |
| E9 | `/storms/D/bogus` renders the map | Router fix, one test |
| M5 | Markers rebuild on every step | Update marker text in place |
| M6 | `publish.py` is 757 lines; `build_day` takes 12 parameters | Revisit after PR 3 and PR 4 shrink it |
| M7 | A site test scrapes `BIN_EDGES` from Python source | Publish the edges in a JSON fixture |
| A6 | SPC daily CSV fetch lives in `candidates.py`; `FRESH_DAYS` has two meanings | Move to `reports.py`; add `SETTLE_DAYS` |
| A7 | `RAW_DIR` in `__main__` shadows `paths.RAW_DIR` | Rename to `MESH_DIR` |

## Risks and rollback

- Each PR merges as one squash commit. `git revert <sha>` undoes it.
- No PR in this programme changes a published JSON schema or a Parquet layout. A rollback needs no data migration.
- PR 1 changes exit codes and the skip rule for bad layer files. `nightly.sh` reads the exit code, so check its handling of a skipped layer.
- PR 3 risk: `impact.steps` returns a different dtype unit than the old inline `pd.date_range`. The equality test in `test_impact.py` catches this.
- PR 4 risk: a moved function loses an `except` clause or a message. The rule "no test assertion changes" catches this.
- PR 2 risk: if a MapLibre tile error carries no `tile`, one bad tile stops the load. The tile-error test catches this.
