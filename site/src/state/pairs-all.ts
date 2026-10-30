import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type Pairs, type StormsIndex } from "../data/types";
import { type Load, useLoad } from "./load";

// One promise per published path for the page session. A rejected path leaves the cache,
// so Retry refetches the failed files only.
// shortcut: a file that passes guardPairs but fails rescore stays cached, so Retry re-reads it; evict the path on a rescore error when a published file first fails rescore
const cache = new Map<string, Promise<unknown>>();
let cachedRunTime: string | null = null;

/** Clear all cached file promises (used when index.run_time changes or in tests). */
export function clearFileCache(): void {
  cache.clear();
  cachedRunTime = null;
}

function cached<T>(runTime: string, path: string, guard: (value: unknown) => T): Promise<T> {
  if (cachedRunTime !== null && cachedRunTime !== runTime) {
    cache.clear();
  }
  cachedRunTime = runTime;
  const key = `${runTime}:${path}`;
  let promise = cache.get(key) as Promise<T> | undefined;
  if (promise === undefined) {
    promise = fetchJson(path, guard);
    cache.set(key, promise);
  }
  return promise;
}

async function loadEntries<T>(
  paths: readonly (string | null)[],
  guard: (value: unknown) => T,
  runTime: string,
): Promise<(T | null)[]> {
  const settled = await Promise.allSettled(
    paths.map((path) => (path === null ? Promise.resolve(null) : cached(runTime, path, guard))),
  );
  const values: (T | null)[] = [];
  let first: { path: string; reason: unknown } | null = null;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const path = paths[i] ?? null;
    if (result.status === "fulfilled") {
      values.push(result.value);
    } else if (path !== null) {
      cache.delete(`${runTime}:${path}`);
      first ??= { path, reason: result.reason };
    }
  }
  if (first !== null) {
    const message = first.reason instanceof Error ? first.reason.message : String(first.reason);
    throw first.reason instanceof DataError ? first.reason : new DataError(first.path, message);
  }
  return values;
}

/** Load every path through the cache; the first rejection becomes the error and names its file. */
export function useAllFiles<T>(paths: string[], guard: (value: unknown) => T, runTime = "") {
  return useLoad<T[]>(
    `${runTime}\n${paths.join("\n")}`,
    async () => (await loadEntries(paths, guard, runTime)) as T[],
  );
}

interface SparsePayload<T> {
  values: (T | null)[];
  itemErrors: (DataError | null)[];
}

async function loadSparseEntries<T>(
  paths: readonly (string | null)[],
  guard: (value: unknown) => T,
  runTime: string,
): Promise<SparsePayload<T>> {
  const settled = await Promise.allSettled(
    paths.map((path) => (path === null ? Promise.resolve(null) : cached(runTime, path, guard))),
  );
  const values: (T | null)[] = [];
  const itemErrors: (DataError | null)[] = [];
  let nonNullCount = 0;
  let failedCount = 0;
  let firstError: DataError | null = null;
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    const path = paths[i] ?? null;
    if (path !== null) nonNullCount += 1;
    if (result.status === "fulfilled") {
      values.push(result.value);
      itemErrors.push(null);
    } else if (path !== null) {
      cache.delete(`${runTime}:${path}`);
      failedCount += 1;
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      const dataErr = result.reason instanceof DataError ? result.reason : new DataError(path, message);
      values.push(null);
      itemErrors.push(dataErr);
      firstError ??= dataErr;
    } else {
      values.push(null);
      itemErrors.push(null);
    }
  }
  if (nonNullCount > 0 && failedCount === nonNullCount && firstError !== null) {
    throw firstError;
  }
  return { values, itemErrors };
}

/**
 * Lazily load a sparse list of paths (`(string | null)[]`) through the `runTime`-keyed cache.
 * When `enabled` is `false`, issues 0 network requests and resolves an all-null list.
 * Individual path failures are isolated in `itemErrors` while fulfilled paths resolve in `data`.
 */
export function useSparseFiles<T>(
  paths: (string | null)[],
  guard: (value: unknown) => T,
  runTime = "",
  enabled = true,
): Load<(T | null)[]> & {
  showLoading: boolean;
  retry: () => void;
  itemErrors: readonly (DataError | null)[];
} {
  const key = `${enabled ? "1" : "0"}:${runTime}\n${paths.map((p) => p ?? "").join("\n")}`;
  const res = useLoad<SparsePayload<T>>(key, async () => {
    if (!enabled) {
      return { values: paths.map(() => null), itemErrors: paths.map(() => null) };
    }
    return loadSparseEntries(paths, guard, runTime);
  });
  if (res.status === "loading") {
    return {
      status: "loading",
      data: undefined,
      error: undefined,
      itemErrors: paths.map(() => null),
      showLoading: res.showLoading,
      retry: res.retry,
    };
  }
  if (res.status === "error") {
    return {
      status: "error",
      data: undefined,
      error: res.error,
      itemErrors: paths.map((p) => (p !== null ? res.error : null)),
      showLoading: res.showLoading,
      retry: res.retry,
    };
  }
  return {
    status: "ready",
    data: res.data.values,
    error: undefined,
    itemErrors: res.data.itemErrors,
    showLoading: res.showLoading,
    retry: res.retry,
  };
}

/** Every pairs.json of the index, in `index.storms` order, through the shared file cache. */
export function usePairsAll(index: StormsIndex) {
  return useAllFiles<Pairs>(
    index.storms.map((s) => s.files.pairs),
    guardPairs,
    index.run_time,
  );
}
