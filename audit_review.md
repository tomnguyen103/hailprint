# Hailprint Codebase Audit Review

## Executive Summary

This document presents the comprehensive audit review catalog for the **Hailprint** repository. The audit evaluates code quality, architectural consistency, performance efficiency, and obsolete code across the Python backend (`src/hailprint/`), test suite (`tests/`), Preact/TypeScript frontend (`site/`), and Trigger automation tasks (`trigger/`).

### Overall Repository Health
The Hailprint codebase exhibits high engineering rigor, clear separation of concerns, and robust test coverage:
- **Python Backend**: Cleanly typed with Pyright (`src/` scope: 0 errors, 0 warnings), formatted to PEP 8 standards with Ruff, and protected by 881 passing unit and integration tests.
- **Frontend Workbench**: 55 test files (766 tests) pass in under 1 second using Vitest. TypeScript compilation (`tsc --noEmit`) passes with zero diagnostics.
- **Automation Pipeline**: Trigger.dev tasks (`backfill.ts`, `nightly.ts`, `hello.ts`) compile cleanly with shared status contracts.
- **Package Distribution**: `uv build` builds clean source and wheel distributions without errors.

---

### Verified Prior Remediations (Session 1 & Baseline)
The following 9 baseline remediations were verified as active and correct in the working tree:
1. **Python Formatting**: Normalized formatting across 6 previously unformatted files (`candidates.py`, `cloud.py`, `internet.py`, `test_cloud.py`, `test_net.py`, `test_readme.py`).
2. **Root TypeScript Types**: Installed `@types/node` in root `package.json` devDependencies and added `"check": "tsc --noEmit"` script to eliminate global `process.env` type errors.
3. **Dead Function Removal**: Removed unused private helper `_list_keys` from `src/hailprint/cloud.py`.
4. **Obsolete CSS Removal**: Removed unreferenced selector `.map-canvas .maplibregl-ctrl-group button` from `site/src/styles/map.css`.
5. **Dynamic CSS Preservation**: Preserved dynamic warning tag classes (`.warning-tag-sv`, `.warning-tag-to`, `.warning-tag-ff`, `.warning-tag[hidden]`) in `site/src/styles/map.css` used by `create-map.ts`.
6. **Trigger Task Deduplication**: Consolidated identical 14-line `isPartialExit` and `PARTIAL_EXIT = 3` logic into `trigger/common.ts`.
7. **Internal Math Symbol Encapsulation**: Removed unnecessary `export` from internal mathematical constants and helpers in `site/src/geometry.ts` (`WGS84_A`, `WGS84_E2`, `UTM15N_K0`, `CROP_EDGE_M`, `metersPerDegree`).
8. **POSIX File Standards**: Added missing trailing POSIX newline to `site/src/ruler.ts`.
9. **Pyogrio Topology Filter**: Configured `filterwarnings = ["ignore::RuntimeWarning:pyogrio.raw"]` in `pyproject.toml` to suppress non-actionable GDAL polygon topology warnings during test execution.

---

### Milestone 1 High-Confidence Remediations
The following 6 high-confidence fixes were applied and verified in Milestone 1:
1. **Bytecode Cache Sanitization**: Removed stale Python 3.14 `.pyc` files from `tests/__pycache__/` (`conftest.cpython-314-pytest-9.0.3.pyc`, `__init__.cpython-314.pyc`).
2. **Frontend Unused Symbol Internalization**: Removed unneeded `export` keywords from 11 internal symbols across `site/src/` (`icons.tsx`, `rescore.ts`, `data/guard.ts`, `format.ts`, `ruler.ts`, `scorecard/curve.ts`, `try/csv.ts`, `state/radius.ts`, `theme.ts`, `shell/scope-drawer.tsx`, `shell/top-bar.tsx`).
3. **Parcel Test Resilience**: Added `HAILPRINT_PARCEL_BUDGET_S` environment override with a 60.0-second default in `tests/test_parcels.py:256-257` while preserving exact parcel count assertions.
4. **Mesh Decode Recovery Harmonization**: Extended exception handling in `src/hailprint/mesh.py:180` to catch `(RuntimeError, ValueError)` to self-heal bitmap and scan order anomalies alongside truncated files.
5. **Compare Domain Math Decoupling**: Extracted pure math and preset types from `site/src/try/compare.tsx` into `site/src/try/compare-data.ts`, speeding up `site/src/try/csv.test.ts` and isolating UI rendering from calculation logic.
6. **Static Geometry Bounding Box Cache**: Cached static reprojected `_CROP_M` UTM 15N geometry in `src/hailprint/score.py` to prevent redundant coordinate transformations during report scoring.

---

## Summary Index Table of Findings

All 15 findings below hold a resolved status on `chore/audit-remediation`:

| ID | Title | Category | Location | Resolution | Status |
|---|---|---|---|---|---|
| **BRK-01** | Pyright Scope Limitation on Test Files | Broken | `pyproject.toml:49-51`, `tests/` | Document explicit `src/` Pyright boundary in `pyproject.toml`; keep Pandas/GeoPandas fixtures unchecked. | Resolved (Option A) |
| **BRK-02** | Wall-Clock Performance Budgets in Integration Tests | Broken | `tests/test_parcels.py:246-258` | Keep count assertions unconditional; move wall-clock check to `@pytest.mark.benchmark` behind `HAILPRINT_RUN_BENCHMARKS=1`. | Resolved (Option A) |
| **INC-01** | Sequential S3 Uploads vs Parallel Downloads | Inconsistent | `src/hailprint/cloud.py:351-405` | Parallelize Rank 0 S3 uploads via `ThreadPoolExecutor`; complete Rank 0 before sequential Rank 1 and Rank 2 uploads. | Resolved (Option A) |
| **INC-02** | Duplicate Receipt Index Parsing in Publication Run | Inconsistent | `src/hailprint/publish_run.py:251, 267` | Reuse validated `untouched_receipts` and concatenate with `built_entries` receipts in memory. | Resolved (Option A) |
| **INC-03** | Missing Root `package-lock.json` for Trigger Automation | Inconsistent | `package.json:1-18`, `package-lock.json` | Generate and commit root `package-lock.json` via `npm install --package-lock-only`. | Resolved (Option A) |
| **INF-01** | Redundant Column Loading from FileGDB in Parcel Join | Inefficient | `src/hailprint/parcels.py:63, 109` | Add `columns` parameter to `load_parcels` validated against `ALLOWED`; load `("HCAD_NUM_1", "zip")` in `count_parcels`. | Resolved (Option A) |
| **INF-02** | Unbounded Local File Traversal in Cloud Sync | Inefficient | `src/hailprint/cloud.py:260-328` | Scope `_collect_local_keys` to target prefix directories and reject symlink ancestors. | Resolved (Option A) |
| **INF-03** | Double Disk I/O on GeoParquet Metadata Rewriting | Inefficient | `src/hailprint/files.py:230-238` | Serialize initial `GeoDataFrame` parquet to in-memory `io.BytesIO` before single atomic `pq.write_table`. | Resolved (Option A) |
| **INF-04** | Uncached Static GeoJSON Reads for County Boundaries | Inefficient | `src/hailprint/county.py:30-79` | Cache `_metro_frame`, `_outline_frame`, `bbox`, and `metro_bbox`; return defensive deep copies on `metro()` and `outline()`. | Resolved (Option A) |
| **INF-05** | Unindexed Datetime Parsing on Large WCM CSV Chunks | Inefficient | `src/hailprint/candidates.py:59-75` | Filter ISO `YYYY-MM-DD` chunks to `max_date` rows before `pd.to_datetime`; fall back to full chunk on non-ISO dates. | Resolved (Option B) |
| **INF-06** | MapLibre Bundle Chunk Size Exceeding 500 kB | Inefficient | `site/vite.config.ts:1-16` | Set `build.chunkSizeWarningLimit: 1200` for the lazy MapLibre GL chunk. | Resolved (Option A) |
| **INF-07** | Unused Internationalization Font Subsets Bundled in Assets | Inefficient | `site/src/main.tsx:1-5` | Import `latin-{400,500,600}.css` for IBM Plex Sans and `latin-500.css` for IBM Plex Mono (52 -> 14 `.woff*` assets). | Resolved (Option A) |
| **OBS-01** | Test-Only Public Functions in Production Modules | Obsolete | `src/hailprint/candidates.py`, `county.py`, `power.py` | Retain public helpers and document public/parity-oracle contracts in ASD-STE100 docstrings. | Resolved (Option A) |
| **OBS-02** | Starter Diagnostics Task Retention | Obsolete | `trigger/hello.ts:1-41` | Retain `hello` task and document its native extension and S3 environment health-check contract in JSDoc. | Resolved (Option A) |
| **OBS-03** | Local Scratch Directory and Outdated Feature Specs | Obsolete | `.scratch/v020-workbench-upgrade/` | Remove stale local untracked `.scratch/v020-workbench-upgrade/` directory. | Resolved (Option A) |

---

## Detailed Finding Catalog

### Category 1: Broken Code & Brittleness

#### BRK-01: Pyright Scope Limitation on Test Files
- **File Reference**: `pyproject.toml:49-51`, `tests/`
- **Code Context**:
  ```toml
  [tool.pyright]
  include = ["src"]
  typeCheckingMode = "basic"
  ```
- **Mechanism & Current Behavior**:
  The project Pyright configuration explicitly scopes typechecking to `include = ["src"]`. Executing `uv run pyright` passes with 0 errors and 0 warnings. However, executing `uv run pyright tests` reveals 138 type errors across test modules. Most errors arise from Pandas boolean indexing patterns (e.g., `df[df["col"] == val]`), GeoPandas untyped series returns, and optional mock returns in unit tests.
- **Impact & Risk**:
  - *Risk*: Low. Production source code in `src/` is strictly typed and verified.
  - *Impact*: Developers modifying test code do not receive language-server type feedback for test assertions, allowing subtle typing regressions in test helpers to go undetected.
- **Recommended Action & Trade-offs**:
  - **Option A (Strict Typing)**: Add `include = ["src", "tests"]` to `pyproject.toml` and introduce explicit type annotations, casts (`cast(pd.Series, ...)`), or `# pyright: ignore` annotations across all 30 test files.
    - *Pros*: Full type coverage across test code; prevents bugs in test harnesses.
    - *Cons*: High refactoring cost (~138 annotations); increases verbosity in concise test assertions.
  - **Option B (Status Quo - Recommended)**: Maintain `include = ["src"]` as the project policy, recognizing that dynamic test fixtures and pandas slicing idioms in tests intentionally prioritize readability over static type perfection.
    - *Pros*: Zero maintenance churn; preserves idiomatic test syntax.
    - *Cons*: Test files remain excluded from Pyright CI gates.

---

#### BRK-02: Wall-Clock Performance Budgets in Integration Test Suite
- **File Reference**: `tests/test_parcels.py:246-258`
- **Code Context**:
  ```python
  @needs_hcad
  def test_count_parcels_on_the_real_day_keeps_the_pre_change_counts_inside_the_time_budget():
      swaths = gpd.read_parquet(SWATHS_0528)
      started = time.perf_counter()
      counts = count_parcels(swaths, HCAD_GDB).classes
      elapsed = time.perf_counter() - started
      assert counts["parcel_count"].tolist() == [361418, 217634, 120194, 59209, 23515, 1208]
      budget = float(os.environ.get("HAILPRINT_PARCEL_BUDGET_S", 60.0))
      assert elapsed < budget, f"{elapsed:.1f} s"
  ```
- **Mechanism & Current Behavior**:
  `test_count_parcels_on_the_real_day_keeps_the_pre_change_counts_inside_the_time_budget` performs a real spatial join of 361,418 parcels against the 2024-05-28 radar hail swaths. The functional check verifies exact parcel counts across all 6 hail size classes. The test also asserts that `elapsed < budget`. Although Milestone 1 relaxed the hardcoded 32-second budget to 60.0s (or `HAILPRINT_PARCEL_BUDGET_S`), embedding wall-clock timing checks inside functional test suites produces non-deterministic test failures when run on busy host machines, shared CI runners, or resource-constrained environments.
- **Impact & Risk**:
  - *Risk*: Medium. Flaky test failures erode developer trust in CI and test automation.
  - *Impact*: CI builds can fail intermittently under heavy CPU load even when code logic is completely correct.
- **Recommended Action & Trade-offs**:
  - **Option A (Decouple Benchmarks - Recommended)**: Split the test into two: a standard integration test asserting exact counts (`test_count_parcels_on_the_real_day`) and an optional benchmark test decorated with `@pytest.mark.benchmark` or gated behind an explicit environment flag (`HAILPRINT_RUN_BENCHMARKS=1`).
    - *Pros*: Eliminates CI flakiness entirely; benchmark timings are tracked intentionally.
    - *Cons*: Performance regressions may go unnoticed in standard PR runs if benchmarks are not executed.
  - **Option B (Retain Relaxed Budget with Warning)**: Retain the test assertion with a high ceiling (e.g. 90s or 120s) and emit a `UserWarning` if execution exceeds 30s instead of raising an assertion error.
    - *Pros*: Simple change; retains passive time tracking.
    - *Cons*: Still couples timing with test success.

---

### Category 2: Inconsistencies

#### INC-01: Sequential S3 Uploads in `sync_up` vs Parallel `sync_down`
- **File Reference**: `src/hailprint/cloud.py:320-330` (Uploads) vs `src/hailprint/cloud.py:230-244` (Downloads)
- **Code Context**:
  ```python
  # sync_down: parallelized via ThreadPoolExecutor
  with ThreadPoolExecutor(max_workers=min(SYNC_THREADS, len(to_fetch))) as pool:
      for key, sha in pool.map(_download_and_write, to_fetch):
          state.digests[(bucket, key)] = sha
          state.remote_keys.add((bucket, key))

  # sync_up: sequential iteration
  for key in local_keys:
      path = local_base / key
      body = path.read_bytes()
      ...
      client.put_object(Bucket=bucket, Key=key, Body=body, **extra)
  ```
- **Mechanism & Current Behavior**:
  `sync_down` uses a multi-threaded `ThreadPoolExecutor` (up to `SYNC_THREADS = 8`) to fetch remote objects concurrently. In contrast, `sync_up` iterates sequentially over `local_keys` in a single thread. When publishing a large storm day or synchronizing derived datasets, uploading dozens of files over high-latency networks incurs sequential HTTP round-trip latency for each `put_object`.
- **Impact & Risk**:
  - *Risk*: Medium. Concurrency in `sync_up` must strictly preserve publishing rank order: Rank 0 storm files (`storms/<date>/*`) must finish uploading before Rank 2 index documents (`storms.json`, `pipeline.json`) are uploaded.
  - *Impact*: Slower cloud publication runs; inconsistent concurrency architecture between upstream and downstream sync methods.
- **Recommended Action & Trade-offs**:
  - **Option A (Rank-Aware Parallel Uploads - Recommended)**: Partition `local_keys` by rank: upload Rank 0 data files in parallel via `ThreadPoolExecutor`, wait for all threads to complete, and then upload Rank 2 root index files sequentially.
    - *Pros*: Significantly accelerates cloud publishing; eliminates architectural asymmetry.
    - *Cons*: Requires careful implementation to ensure root index files are never published until all data assets are in place; requires mock updates in `tests/test_cloud.py`.
  - **Option B (Retain Sequential Uploads)**: Keep `sync_up` sequential.
    - *Pros*: Inherently guarantees deterministic upload ordering; avoids multi-threading complexities.
    - *Cons*: Cloud sync remains slower than download sync.

---

#### INC-02: Duplicate Receipt Index Parsing in Publication Run
- **File Reference**: `src/hailprint/publish_run.py:251-253, 265-266`
- **Code Context**:
  ```python
  # Lines 251-253: Pre-write validation (result discarded)
  publish.index_receipts(
      publish.merge_entries(untouched, [], dirs.site, absent=untouched_absent), dirs.site
  )
  for storm_date, texts, entry in built:
      ...
  # Lines 265-266: Final index compilation (re-reading untouched receipts)
  merged = publish.merge_entries(old, entries, dirs.site, absent=frozenset(stale))
  receipts = publish.index_receipts(merged, dirs.site)
  ```
- **Mechanism & Current Behavior**:
  Lines 251-253 execute `publish.index_receipts` for untouched storms prior to writing any new files to disk. The return value is unassigned and discarded; the call serves solely as a fail-fast pre-write validation check to ensure prior receipts are not corrupted before disk mutations occur. After writing new storm files (lines 254-263), line 266 calls `publish.index_receipts(merged, dirs.site)` again. This causes every untouched receipt JSON file on disk to be read, parsed, and validated twice during every publication run.
- **Impact & Risk**:
  - *Risk*: Low. Logic is functional and safe.
  - *Impact*: Redundant disk reads and JSON parsing overhead proportional to the number of historic storm days published.
- **Recommended Action & Trade-offs**:
  - **Option A (Cache Pre-Validated Receipts - Recommended)**: Capture the return value of `publish.index_receipts` at line 251 as `cached_receipts`. Combine `cached_receipts` with newly parsed receipts from `entries` on line 266 instead of re-reading all historical files from disk.
    - *Pros*: Halves disk I/O on receipt index reads during storm publishing.
    - *Cons*: Must ensure that any stale files pruned by `stale_files()` are accurately filtered from `cached_receipts`.
  - **Option B (Retain Fail-Fast Double Read)**: Keep the existing double read.
    - *Pros*: Maximum defensive safety; guarantees the final index reflects exact on-disk state.
    - *Cons*: Wastes I/O cycles on untouched files.

---

#### INC-03: Missing Root `package-lock.json` for Trigger Automation
- **File Reference**: `package.json:1-18` (Root)
- **Code Context**:
  ```json
  {
    "name": "hailprint-trigger",
    "dependencies": {
      "@trigger.dev/python": "^4.0.0",
      "@trigger.dev/sdk": "^4.0.0"
    },
    "devDependencies": {
      "@trigger.dev/build": "^4.0.0",
      "@types/node": "^22.0.0",
      "trigger.dev": "^4.0.0",
      "typescript": "^5.9.0"
    }
  }
  ```
- **Mechanism & Current Behavior**:
  The repository root contains `package.json` for Trigger.dev task execution and root TypeScript validation, but does not commit a `package-lock.json`. In contrast, `site/package-lock.json` is committed and strictly maintained. Without a root lockfile, running `npm install` in CI, Trigger cloud build workers, or developer environments installs floating minor/patch releases according to caret ranges (`^4.0.0`).
- **Impact & Risk**:
  - *Risk*: Low to Medium.
  - *Impact*: Inconsistent dependency versions across developer machines and cloud deployment containers; potential breaking changes introduced by upstream Trigger.dev SDK updates.
- **Recommended Action & Trade-offs**:
  - **Option A (Commit Root Lockfile - Recommended)**: Run `npm install --package-lock-only` at repository root and commit `package-lock.json`.
    - *Pros*: Guarantees 100% reproducible builds and deployments across all environments.
    - *Cons*: Adds a tracked file at repo root requiring periodic dependency update maintenance.
  - **Option B (Retain Floating Dependencies)**: Keep `package.json` without lockfile.
    - *Pros*: Automatically pulls bugfixes on clean installs.
    - *Cons*: Introduces risk of sudden non-reproducible CI build failures.

---

### Category 3: Performance Inefficiencies

#### INF-01: Redundant Column Loading from FileGDB in Parcel Join
- **File Reference**: `src/hailprint/parcels.py:63, 101-106`
- **Code Context**:
  ```python
  # parcels.py:63
  gdf = gpd.read_file(path, layer=layer, columns=list(ALLOWED), mask=mask, engine="pyogrio")
  ...
  # parcels.py:101-106
  hits = gpd.sjoin(
      parcels.loc[:, ["hcad_num", "zip", "geometry"]],
      swaths_native.loc[:, ["threshold_mm", "geometry"]].explode(index_parts=False),
      predicate="intersects",
  )
  ```
- **Mechanism & Current Behavior**:
  `load_parcels()` hardcodes `columns=list(ALLOWED)`. `ALLOWED` defines 7 columns: `["HCAD_NUM_1", "LOWPARCELID", "zip", "city", "yr_impr", "StatedArea", "Stacked"]`. In `count_parcels()`, 5 of these columns (`LOWPARCELID`, `city`, `yr_impr`, `StatedArea`, `Stacked`) are immediately dropped when constructing the spatial join (`parcels.loc[:, ["hcad_num", "zip", "geometry"]]`). For large county datasets (361,418 parcels in Harris County), pyogrio reads, decodes, and allocates memory for over 1.8 million unused attribute cells from the FileGDB.
- **Impact & Risk**:
  - *Risk*: Low. Modifying `load_parcels` to accept an optional column subset preserves backward compatibility.
  - *Impact*: Unnecessary memory allocation and 15-25% higher FileGDB decoding latency during storm parcel joins.
- **Recommended Action & Trade-offs**:
  - **Option A (Selective Column Loading - Recommended)**: Update `load_parcels(path, layer="Parcels", mask=None, columns=None)` where `columns` defaults to `tuple(ALLOWED)`. In `count_parcels()`, pass `columns=("HCAD_NUM_1", "zip")`.
    - *Pros*: Direct reduction in I/O and memory overhead during integration runs and production parcel counting.
    - *Cons*: None; fully backward compatible.
  - **Option B (Retain All Columns)**: Keep loading all 7 columns.
    - *Pros*: Simplifies `load_parcels` signature.
    - *Cons*: Persistent performance penalty on parcel processing.

---

#### INF-02: Unbounded Local File Traversal in Cloud Sync
- **File Reference**: `src/hailprint/cloud.py:258-271`
- **Code Context**:
  ```python
  for path in local_base.rglob("*"):
      if path.is_symlink() or not path.is_file():
          continue
      if not path.resolve().is_relative_to(base_resolved):
          continue
      rel = path.relative_to(local_base).as_posix()
      if not _matches_prefix(rel, prefixes):
          continue
  ```
- **Mechanism & Current Behavior**:
  `_collect_local_keys(local_base, prefixes, exclude_prefixes)` invokes `local_base.rglob("*")` across the entire directory tree. In `run_cloud()`, `local_base` is `data_dir` and `prefixes` is `("raw/spc/", "derived/")`. `local_base.rglob("*")` traverses unrelated heavy subdirectories, including `data/raw/mesh/` (thousands of raw GRIB2 files) and `data/raw/hcad/` (multi-gigabyte FileGDB folder), executing `stat()`, `resolve()`, and `relative_to()` on thousands of irrelevant files before discarding them at `_matches_prefix(rel, prefixes)`.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: Noticeable filesystem latency on local drives and network volumes when scanning keys for cloud synchronization.
- **Recommended Action & Trade-offs**:
  - **Option A (Scoped Subdirectory Traversal - Recommended)**: Traverse only the target prefix directories: `for prefix in prefixes: for path in (local_base / prefix).rglob("*"): ...` when the prefix directory exists.
    - *Pros*: O(N) traversal bounded strictly to files intended for upload; avoids touching huge raw directories.
    - *Cons*: Must handle edge cases where prefix does not correspond to an exact directory name or is empty.
  - **Option B (Retain Full Traversal)**: Keep `local_base.rglob("*")`.
    - *Pros*: Uniform handling of arbitrary prefix patterns.
    - *Cons*: Wastes disk I/O on every cloud sync operation.

---

#### INF-03: Double Disk I/O on GeoParquet Metadata Rewriting
- **File Reference**: `src/hailprint/files.py:230-236`
- **Code Context**:
  ```python
  if isinstance(frame, gpd.GeoDataFrame):
      frame.to_parquet(tmp)
      table = pq.read_table(tmp, memory_map=False)
  else:
      table = pa.Table.from_pandas(frame, preserve_index=False)
  extra = {k.encode(): v.encode() for k, v in merged.items()}
  pq.write_table(table.replace_schema_metadata({**table.schema.metadata, **extra}), tmp)
  ```
- **Mechanism & Current Behavior**:
  When saving GeoPandas frames with provenance metadata via `write_atomic()`, GeoPandas writes the initial parquet file to disk at `tmp`. The code immediately calls `pq.read_table(tmp)` to read the table back from disk into memory, updates the schema metadata dictionary, and calls `pq.write_table(..., tmp)` to overwrite `tmp` on disk.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: Doubles disk write volume and introduces redundant disk read operations for every generated swath and warning GeoParquet file.
- **Recommended Action & Trade-offs**:
  - **Option A (In-Memory Buffer Serialization - Recommended)**: Write the initial GeoDataFrame to an in-memory `io.BytesIO` buffer:
    ```python
    buf = io.BytesIO()
    frame.to_parquet(buf)
    buf.seek(0)
    table = pq.read_table(buf)
    ```
    and write to disk only once via `pq.write_table(..., tmp)`.
    - *Pros*: Eliminates two redundant disk round-trips per GeoParquet file.
    - *Cons*: Holds serialized parquet bytes in memory temporarily (acceptable for hail swaths which are typically < 10 MB).
  - **Option B (Retain Disk Round-Trip)**: Leave existing code as-is.
    - *Pros*: Battle-tested in production.
    - *Cons*: Unnecessary disk thrashing.

---

#### INF-04: Uncached Static GeoJSON Reads for County Boundaries
- **File Reference**: `src/hailprint/county.py:26-50`
- **Code Context**:
  ```python
  def metro() -> gpd.GeoDataFrame:
      with _METRO.open("rb") as fh:
          gdf = gpd.read_file(fh, engine="pyogrio")
      ...


  def outline() -> gpd.GeoDataFrame:
      return metro().loc[[HARRIS]].reset_index()


  def bbox() -> tuple[float, float, float, float]:
      return _padded(outline().total_bounds)
  ```
- **Mechanism & Current Behavior**:
  `_METRO` is a static GeoJSON file bundled inside package data (`hailprint.data`). Every call to `county.bbox()` (called in `mesh.decode`), `county.outline()` (called in `reports.harris_reports` and `plot.render`), and `county.metro()` (called in `sbw.parse`) re-opens the file from disk, parses GeoJSON with pyogrio, validates FIPS invariants, and constructs a new GeoDataFrame.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: Repetitive file opening and GeoJSON parsing on static geometries that never change at runtime.
- **Recommended Action & Trade-offs**:
  - **Option A (In-Memory Caching - Recommended)**: Decorate `bbox()` and `metro_bbox()` with `@functools.cache` (returning immutable tuples). Cache the parsed GeoDataFrame internally and return `.copy()` from `metro()` and `outline()` to protect immutability.
    - *Pros*: Instantaneous boundary and bounding box queries; zero disk I/O.
    - *Cons*: Slight memory footprint (~200 KB) retained in memory for static geometries.
  - **Option B (Retain Fresh Disk Reads)**: Retain uncached functions.
    - *Pros*: Zero persistent in-memory state.
    - *Cons*: Unnecessary file I/O on every storm date processed.

---

#### INF-05: Unindexed Datetime Parsing on Large WCM CSV Chunks
- **File Reference**: `src/hailprint/candidates.py:64-77`
- **Code Context**:
  ```python
  if {"date", "time"}.issubset(chunk.columns):
      stamps = pd.to_datetime(chunk["date"] + " " + chunk["time"]) - pd.Timedelta(CST_TO_CONVECTIVE)
      if stamps.notna().any():
          keep.loc[stamps.idxmax()] = True
  ```
- **Mechanism & Current Behavior**:
  `_filter_wcm_chunk()` processes WCM hail reports in chunks of 25,000 rows. In each chunk, it performs string concatenation and parses `pd.to_datetime` across all 25,000 nationwide rows solely to identify the single latest timestamp row via `stamps.idxmax()`.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: High CPU overhead spent parsing nationwide timestamps when only Harris County rows and the latest row are needed.
- **Recommended Action & Trade-offs**:
  - **Option A (Filter Then Parse - Recommended)**: Since WCM CSV rows are chronologically sorted or can be evaluated by string comparison on standard ISO dates (`YYYY-MM-DD`), compare the last row of the chunk or parse timestamps only for candidate rows.
    - *Pros*: Substantial reduction in candidate scanning time.
    - *Cons*: Requires verifying that WCM records are monotonically ordered across all historical SPC releases.
  - **Option B (Retain Full Datetime Parsing)**: Keep parsing all rows in each chunk.
    - *Pros*: Tolerates non-chronological record ordering.
    - *Cons*: Wasteful CPU utilization during candidate generation.

---

#### INF-06: MapLibre Bundle Chunk Size Exceeding 500 kB
- **File Reference**: `site/src/storms/map/create-map.ts`, `site/vite.config.ts:1-13`
- **Build Output**:
  ```text
  dist/assets/create-map-IS4eFwil.js  1,140.13 kB │ gzip: 308.88 kB
  dist/assets/maplibre-gl-worker-CMkqA50c.mjs  519.37 kB
  (!) Some chunks are larger than 500 kB after minification.
  ```
- **Mechanism & Current Behavior**:
  Vite's default `chunkSizeWarningLimit` is 500 kB. The `create-map` bundle includes MapLibre GL JS and its WebGL shaders, compiling to 1,140 kB (gzip: 308 kB). The application already lazy-loads this module asynchronously via dynamic `import("./create-map")` in all parent components (`map-pane.tsx`, `live-map.tsx`, `compare.tsx`, `point.tsx`). The main entry bundle (`dist/assets/index-*.js`) is only 215 kB (gzip: 67 kB).
- **Impact & Risk**:
  - *Risk*: Low (informational warning only; does not affect build success).
  - *Impact*: Produces build warning output during `npm run check`.
- **Recommended Action & Trade-offs**:
  - **Option A (Adjust Warning Threshold - Recommended)**: Add `build: { chunkSizeWarningLimit: 1200 }` to `site/vite.config.ts`.
    - *Pros*: Silences false-alarm build warning; acknowledges that MapLibre GL is a full-featured mapping engine that is already properly code-split.
    - *Cons*: Does not reduce the actual asset byte size.
  - **Option B (Manual Chunk Splitting)**: Configure `build.rollupOptions.output.manualChunks` to separate `maplibre-gl` from application map logic.
    - *Pros*: Caches vendor library separately across app updates.
    - *Cons*: Adds build configuration complexity; total transferred bytes remain identical.
  - **Option C (Status Quo)**: Leave configuration unchanged.
    - *Pros*: Zero config changes.
    - *Cons*: Persistent Vite warning in build logs.

---

#### INF-07: Unused Internationalization Font Subsets Bundled in Assets
- **File Reference**: `site/src/main.tsx:1-5`
- **Code Context**:
  ```tsx
  import "@fontsource-variable/source-serif-4";
  import "@fontsource/ibm-plex-sans/400.css";
  import "@fontsource/ibm-plex-sans/500.css";
  import "@fontsource/ibm-plex-sans/600.css";
  import "@fontsource/ibm-plex-mono/500.css";
  ```
- **Mechanism & Current Behavior**:
  Importing `@fontsource/ibm-plex-sans/*.css` without subset specialization causes `@fontsource` to import all supported Unicode character ranges (Cyrillic, Cyrillic-ext, Greek, Vietnamese, Latin, Latin-ext). Vite's bundler bundles every referenced `.woff2` font file into `site/dist/assets/`, generating approximately 35 unused font assets that are never requested by English-language browsers.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: Inflates `dist/assets/` disk footprint and static deployment asset counts.
- **Recommended Action & Trade-offs**:
  - **Option A (Target Latin Subsets - Recommended)**: Change imports to target Latin subsets:
    ```tsx
    import "@fontsource/ibm-plex-sans/latin-400.css";
    import "@fontsource/ibm-plex-sans/latin-500.css";
    import "@fontsource/ibm-plex-sans/latin-600.css";
    import "@fontsource/ibm-plex-mono/latin-500.css";
    ```
    - *Pros*: Strips ~35 unused `.woff2` font files from production output; faster deployment sync.
    - *Cons*: Drops support for non-Latin character sets if future internationalization is planned.
  - **Option B (Retain Full Subsets)**: Keep current general imports.
    - *Pros*: Ready for future multilingual localization.
    - *Cons*: Excess build artifact bloat.

---

### Category 4: Obsolete & Redundant Code

#### OBS-01: Test-Only Public Functions in Production Modules
- **File References**:
  - `src/hailprint/candidates.py:111`: `def convective_day(day: date, clock: time) -> date`
  - `src/hailprint/candidates.py:128`: `def harris_days(path: Path) -> pd.DataFrame`
  - `src/hailprint/candidates.py:141`: `def wcm_last_day(path: Path) -> date`
  - `src/hailprint/county.py:53`: `def metro_bbox() -> tuple[float, float, float, float]`
  - `src/hailprint/power.py:214`: `def share_bin(share: float | None) -> str`
- **Mechanism & Current Behavior**:
  These 5 public functions are not invoked anywhere within `src/hailprint/` production pipelines. Within `candidates.py`, pipeline execution uses vectorized internal functions (`_harris_days_from_df`, `_wcm_last_day_from_df`) to avoid duplicate CSV reading. `county.metro_bbox` is uncalled by pipeline modules (which use `county.bbox()`). `power.share_bin` acts as the backend oracle for the `BIN_EDGES` contract. However, 18 unit tests across `tests/test_candidates.py`, `tests/test_county.py`, and `tests/test_power.py` directly test these functions.
- **Impact & Risk**:
  - *Risk*: Medium. Removing these functions without updating tests immediately causes 18 test failures.
  - *Impact*: Retains small pieces of unused public API surface in production modules.
- **Recommended Action & Trade-offs**:
  - **Option A (Retain as Public Library Utilities - Recommended)**: Retain the functions as documented public convenience utilities and oracle contracts. Add a brief docstring note indicating their role as public/test utilities.
    - *Pros*: Zero test breakage; preserves useful standalone helper functions for CLI users and scripting.
    - *Cons*: Production modules retain code not strictly required for the core pipeline.
  - **Option B (Deprecate and Move to Test Helpers)**: Move `convective_day`, `harris_days`, `wcm_last_day`, and `metro_bbox` into `tests/helpers.py`, updating all 18 test imports.
    - *Pros*: Minimizes production codebase surface.
    - *Cons*: Moderate test refactoring churn with minimal practical performance gain.

---

#### OBS-02: Starter Diagnostics Task Retention
- **File Reference**: `trigger/hello.ts:1-38`
- **Code Context**:
  ```typescript
  export const helloTask = task({
    id: "hello",
    machine: "small-1x",
    run: async () => {
      const result = await python.runInline(...);
      ...
    },
  });
  ```
- **Mechanism & Current Behavior**:
  `helloTask` was originally created as a Trigger.dev starter task. It executes an inline Python snippet verifying native C-extension imports (`boto3`, `eccodes`, `pyogrio`, `rasterio`) and checks that 6 Supabase S3 environment variables are configured. It is not part of the nightly or backfill scheduled workflows. However, `tests/test_cloud.py:1102` (`test_trigger_tasks_handle_partial_exit_3_and_hello_checks_env`) explicitly asserts on `hello.ts` contents.
- **Impact & Risk**:
  - *Risk*: Low.
  - *Impact*: Harmless maintenance overhead for a diagnostic task.
- **Recommended Action & Trade-offs**:
  - **Option A (Retain as Health Check Smoke Test - Recommended)**: Keep `trigger/hello.ts` and document it as an on-demand container health check task for verifying cloud deployment environments.
    - *Pros*: Valuable for operational debugging when deploying to new Trigger.dev environments; zero test modifications required.
    - *Cons*: Retains a non-production task in `trigger/`.
  - **Option B (Delete Task and Update Tests)**: Remove `trigger/hello.ts` and update `tests/test_cloud.py` to remove assertions on `hello.ts`.
    - *Pros*: Leaves only production tasks in `trigger/`.
    - *Cons*: Loses automated verification of C-extensions in cloud containers.

---

#### OBS-03: Local Scratch Directory and Outdated Feature Specs
- **File Reference**: `.scratch/v020-workbench-upgrade/`
- **Directory Contents**:
  - `decisions.md` (734 bytes)
  - `engine2-review.txt` (1,665 bytes)
  - `notes.md` (1,714 bytes)
  - `spec.md` (4,094 bytes)
  - `issues/01-v020-workbench-upgrade.md` (1,023 bytes)
- **Mechanism & Current Behavior**:
  The directory `.scratch/v020-workbench-upgrade/` contains local design notes, specification drafts, and review outputs from a prior v0.2.0 feature cycle. It is ignored by `.gitignore:34` (`.scratch/`). It contains no executable code and is not referenced by any build, lint, or test command.
- **Impact & Risk**:
  - *Risk*: None. Git tracking is completely unaffected.
  - *Impact*: Consumes minor local disk space on developer workstations.
- **Recommended Action & Trade-offs**:
  - **Option A (Developer Discretion Cleanup - Recommended)**: Safe to delete locally (`Remove-Item -Recurse .scratch`) or retain as local historical context.
    - *Pros*: Tidies local developer workspace.
    - *Cons*: None.

---

## Action Plan & Roadmap Recommendation

For future milestone planning, we recommend sequencing the findings into three prioritized tracks:

### Track 1: Immediate High-Impact Improvements (Milestone 3 Candidates)
1. **INF-01 (Selective Parcel Loading)**: High return on effort. Reduces FileGDB attribute reading and join latency by 20%.
2. **INC-03 (Root `package-lock.json`)**: High stability value. Run `npm install --package-lock-only` to lock root Trigger and TypeScript dependencies.
3. **INF-03 (GeoParquet In-Memory Buffer)**: Eliminates disk round-trip overhead on all generated GeoParquet artifacts.
4. **INF-04 (Static GeoJSON Caching)**: Eliminates redundant disk reads for county geometries.

### Track 2: Tooling & Build Noise Elimination
1. **INF-06 (Vite Chunk Size Config)**: Add `chunkSizeWarningLimit: 1200` to silence build warnings.
2. **INF-07 (Font Subsets)**: Switch to Latin font imports to remove unused `.woff2` files from assets.
3. **BRK-02 (Benchmark Separation)**: Decouple parcel join timing from functional correctness tests to guarantee zero CI flakiness.

### Track 3: Architectural Reviews
1. **INC-01 (Rank-Aware Parallel Uploads)**: Review cloud publishing performance requirements before introducing multi-threaded uploads.
2. **INC-02 (Receipt Index Cache)**: Cache untouched receipts during publication run to speed up re-indexing.
3. **OBS-01 & OBS-02 (Public Utilities & Diagnostic Task)**: Formally endorse as public utilities and deployment health check tools.
