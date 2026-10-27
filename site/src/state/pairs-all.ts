import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type Pairs, type StormsIndex } from "../data/types";
import { useLoad } from "./load";

// One promise per published path for the page session. A rejected path leaves the cache,
// so Retry refetches the failed files only.
// shortcut: a file that passes its guard but fails a later step (rescore) stays cached, evict on that failure when guardPairs checks the per-class array lengths
const cache = new Map<string, Promise<unknown>>();

function cached<T>(path: string, guard: (value: unknown) => T): Promise<T> {
  let promise = cache.get(path) as Promise<T> | undefined;
  if (promise === undefined) {
    promise = fetchJson(path, guard);
    cache.set(path, promise);
  }
  return promise;
}

/** Load every path through the cache; the first rejection becomes the error and names its file. */
export function useAllFiles<T>(paths: string[], guard: (value: unknown) => T) {
  return useLoad<T[]>(paths.join("\n"), async () => {
    const settled = await Promise.allSettled(paths.map((path) => cached(path, guard)));
    const values: T[] = [];
    let first: { path: string; reason: unknown } | null = null;
    settled.forEach((result, i) => {
      const path = paths[i]!;
      if (result.status === "fulfilled") {
        values.push(result.value);
        return;
      }
      cache.delete(path);
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
  );
}