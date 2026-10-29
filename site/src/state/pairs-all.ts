import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type Pairs, type StormsIndex } from "../data/types";
import { useLoad } from "./load";

// One promise per published path for the page session. A rejected path leaves the cache,
// so Retry refetches the failed files only.
// shortcut: a file that passes guardPairs but fails rescore stays cached, so Retry re-reads it; evict the path on a rescore error when a published file first fails rescore
const cache = new Map<string, Promise<unknown>>();

/** Clear all cached file promises (used when index.run_time changes or in tests). */
export function clearFileCache(): void {
  cache.clear();
}

function cached<T>(key: string, path: string, guard: (value: unknown) => T): Promise<T> {
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
      paths.map((path) => cached(`${runTime}:${path}`, path, guard)),
    );
    const values: T[] = [];
    let first: { path: string; reason: unknown } | null = null;
    settled.forEach((result, i) => {
      const path = paths[i]!;
      const key = `${runTime}:${path}`;
      if (result.status === "fulfilled") {
        values.push(result.value);
        return;
      }
      cache.delete(key);
      first ??= { path, reason: result.reason };
    });
    if (first !== null) {
      const { path, reason } = first as { path: string; reason: unknown };
      if (reason instanceof DataError) throw reason;
      const file = path.slice(path.lastIndexOf("/") + 1);
      throw new DataError(file, reason instanceof Error ? reason.message : String(reason));
    }
    return values;
  });
}

/** Every pairs.json of the index, in `index.storms` order. */
export function usePairsAll(index: StormsIndex) {
  return useAllFiles<Pairs>(
    index.storms.map((s) => s.files.pairs),
    guardPairs,
    index.run_time,
  );
}