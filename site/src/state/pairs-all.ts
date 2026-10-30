import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type Pairs, type StormsIndex } from "../data/types";
import { useLoad } from "./load";

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

/** Load every path through the cache; the first rejection becomes the error and names its file. */
export function useAllFiles<T>(paths: string[], guard: (value: unknown) => T, runTime = "") {
  return useLoad<T[]>(`${runTime}\n${paths.join("\n")}`, async () => {
    const settled = await Promise.allSettled(
      paths.map((path) => cached(runTime, path, guard)),
    );
    const values: T[] = [];
    let first: { path: string; reason: unknown } | null = null;
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]!;
      const path = paths[i]!;
      const key = `${runTime}:${path}`;
      if (result.status === "fulfilled") {
        values.push(result.value);
      } else {
        cache.delete(key);
        first ??= { path, reason: result.reason };
      }
    }
    if (first !== null) {
      const message = first.reason instanceof Error ? first.reason.message : String(first.reason);
      throw first.reason instanceof DataError ? first.reason : new DataError(first.path, message);
    }
    return values;
  });
}

/**
 * Lazily load a sparse list of paths (`(string | null)[]`) through the `runTime`-keyed cache.
 * When `enabled` is `false`, issues 0 network requests and resolves an all-null list.
 */
export function useSparseFiles<T>(
  paths: (string | null)[],
  guard: (value: unknown) => T,
  runTime = "",
  enabled = true,
) {
  const key = `${enabled ? "1" : "0"}:${runTime}\n${paths.map((p) => p ?? "").join("\n")}`;
  return useLoad<(T | null)[]>(key, async () => {
    if (!enabled) {
      return paths.map(() => null);
    }
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
  });
}

/** Every pairs.json of the index, in `index.storms` order, through the shared file cache. */
export function usePairsAll(index: StormsIndex) {
  return useAllFiles<Pairs>(
    index.storms.map((s) => s.files.pairs),
    guardPairs,
    index.run_time,
  );
}
