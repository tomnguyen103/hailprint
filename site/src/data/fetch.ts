// One fetch path for every published file. A non-2xx status, a body that is not JSON,
// and a failed guard each become a DataError that names the file.
import { DataError } from "./types";

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_IN_FLIGHT = 6;

// shortcut: fetch limiter is global, not per origin, upgrade when an external origin stalls site data
let inFlight = 0;
const waitQueue: Array<() => void> = [];

function waitForSlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSlot(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    inFlight -= 1;
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

let impl: Fetch | null = null;

// shortcut: In-memory fetchJson cache holds storm JSON for one index.run_time; upgrade to LRU cap if published archive exceeds 200 storms.
const responseCache = new Map<string, Promise<unknown>>();
let cacheScope: string | null = null;

/** Clear all cached storm JSON responses (used on retry, run_time advance, and in tests). */
export function clearFetchCache(): void {
  responseCache.clear();
  cacheScope = null;
}

/** Invalidate cached storm JSON responses whenever the active publish `run_time` scope changes. */
export function setFetchCacheScope(scope: string): void {
  if (cacheScope !== scope) {
    if (cacheScope !== null || responseCache.size > 0) {
      responseCache.clear();
    }
    cacheScope = scope;
  }
}

/** Tests and the dev harness inject a fake fetch; null restores the global one. */
export function setFetch(next: Fetch | null): void {
  impl = next;
  clearFetchCache();
}

/** Return the active fetch implementation (injected fake or global `fetch`). */
export function getFetch(): Fetch {
  return impl ?? fetch;
}

export function normalizeBase(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

export function resolveDataBase(envBase: string | undefined): string {
  return normalizeBase(envBase ?? "/data/");
}

export const DATA_BASE = resolveDataBase(import.meta.env.VITE_DATA_BASE);

/** Fetch `url` with a 15-second timeout, map network/HTTP/JSON errors to `DataError(label, ...)`, and validate with `guard`. */
export async function fetchUrlJson<T>(
  url: string,
  label: string,
  guard: (value: unknown) => T,
  headers?: HeadersInit,
): Promise<T> {
  const run = impl ?? fetch;
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
  } else {
    await waitForSlot();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let body: unknown;
  try {
    let response: Response;
    try {
      response = await run(url, headers ? { signal: controller.signal, headers } : { signal: controller.signal });
    } catch (error) {
      throw new DataError(label, `network error, ${String(error)}`);
    }
    if (!response.ok) throw new DataError(label, `HTTP ${response.status}`);
    const len = response.headers?.get?.("content-length");
    if (len && Number(len) > MAX_JSON_BYTES) throw new DataError(label, "response exceeds 16 MiB");
    try {
      if (typeof response.body?.getReader === "function") {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parts: string[] = [];
        let totalBytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_JSON_BYTES) {
            await reader.cancel().catch(() => {});
            throw new DataError(label, "response exceeds 16 MiB");
          }
          parts.push(decoder.decode(value, { stream: true }));
        }
        parts.push(decoder.decode());
        body = JSON.parse(parts.join(""));
      } else if (typeof response.text === "function") {
        const text = await response.text();
        if (text.length > MAX_JSON_BYTES) throw new DataError(label, "response exceeds 16 MiB");
        body = JSON.parse(text);
      } else {
        body = await response.json();
      }
    } catch (error) {
      if (error instanceof DataError) throw error;
      if (controller.signal.aborted) {
        throw new DataError(label, `network error, ${String(error)}`);
      }
      throw new DataError(label, "body is not JSON");
    }
  } finally {
    clearTimeout(timer);
    releaseSlot();
  }
  return guard(body);
}

/** Fetch `<base><path>` and pass the parsed body through `guard`. Immutable `storms/` payloads cache per `run_time` scope. */
export function fetchJson<T>(
  path: string,
  guard: (value: unknown) => T,
  base = DATA_BASE,
  options?: { fresh?: boolean },
): Promise<T> {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const url = base + path;
  const cacheable = path.startsWith("storms/");
  if (cacheable && !options?.fresh) {
    const cached = responseCache.get(url);
    if (cached !== undefined) return cached as Promise<T>;
  }
  const promise = fetchUrlJson(url, file, guard);
  if (cacheable) {
    responseCache.set(url, promise);
    void promise.then(undefined, () => {
      if (responseCache.get(url) === promise) responseCache.delete(url);
    });
  }
  return promise;
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
