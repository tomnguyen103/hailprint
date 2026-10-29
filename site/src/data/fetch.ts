// One fetch path for every published file. A non-2xx status, a body that is not JSON,
// and a failed guard each become a DataError that names the file.
import { DataError } from "./types";

export type Fetch = typeof fetch;

let impl: Fetch | null = null;

/** Tests and the dev harness inject a fake fetch; null restores the global one. */
export function setFetch(next: Fetch | null): void {
  impl = next;
}

export function normalizeBase(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

export const DATA_BASE = normalizeBase(import.meta.env.VITE_DATA_BASE ?? "/data/");

/** Fetch `<base><path>` and pass the parsed body through `guard`. The default base is `/data/`. */
export async function fetchJson<T>(path: string, guard: (value: unknown) => T, base = DATA_BASE): Promise<T> {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const run = impl ?? fetch;
  let response: Response;
  try {
    response = await run(base + path);
  } catch (error) {
    throw new DataError(file, `network error, ${String(error)}`);
  }
  if (!response.ok) throw new DataError(file, `HTTP ${response.status}`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DataError(file, "body is not JSON");
  }
  return guard(body);
}

export const STALE: unique symbol = Symbol("stale");

/**
 * Latest-wins token. Each call starts a request; a request that finishes after a newer
 * one started resolves to STALE, and its error is dropped.
 */
export function latest<T>(): (start: () => Promise<T>) => Promise<T | typeof STALE> {
  let token = 0;
  return async (start) => {
    const mine = ++token;
    try {
      const value = await start();
      return mine === token ? value : STALE;
    } catch (error) {
      if (mine === token) throw error;
      return STALE;
    }
  };
}