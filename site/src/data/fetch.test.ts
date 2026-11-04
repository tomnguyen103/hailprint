import { afterEach, expect, it, vi } from "vitest";
import {
  DATA_BASE,
  FETCH_TIMEOUT_MS,
  MAX_IN_FLIGHT,
  STALE,
  fetchJson,
  fetchUrlJson,
  latest,
  normalizeBase,
  resolveDataBase,
  setFetch,
} from "./fetch";
import { DataError } from "./types";

afterEach(() => setFetch(null));

function response(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

it("normalizes a data base URL so it ends with a single slash", () => {
  expect(normalizeBase("/data/")).toBe("/data/");
  expect(normalizeBase("/data")).toBe("/data/");
  expect(normalizeBase("https://example.supabase.co/storage/v1/object/public/hailprint-public")).toBe(
    "https://example.supabase.co/storage/v1/object/public/hailprint-public/",
  );
  expect(normalizeBase("https://example.supabase.co/storage/v1/object/public/hailprint-public/")).toBe(
    "https://example.supabase.co/storage/v1/object/public/hailprint-public/",
  );
  expect(resolveDataBase(undefined)).toBe("/data/");
  expect(resolveDataBase("https://bucket.example/public")).toBe("https://bucket.example/public/");
  expect(DATA_BASE).toBe(resolveDataBase(import.meta.env.VITE_DATA_BASE));
});

it("throws DataError with the file name on a 404", async () => {
  setFetch(async () => response(404, "nope"));
  const promise = fetchJson("storms/2019-01-01/pairs.json", (v) => v);
  await expect(promise).rejects.toBeInstanceOf(DataError);
  await expect(promise).rejects.toThrow(/pairs\.json: HTTP 404/);
});

it("throws DataError when the body is not JSON", async () => {
  setFetch(async () => response(200, "{oops"));
  await expect(fetchJson("storms.json", (v) => v)).rejects.toThrow(/storms\.json: .*JSON/);
});

it("passes the parsed body through the guard", async () => {
  setFetch(async (input) => {
    expect(String(input)).toBe(`${DATA_BASE}storms.json`);
    return response(200, JSON.stringify({ n: 1 }));
  });
  await expect(fetchJson("storms.json", (v) => (v as { n: number }).n)).resolves.toBe(1);
});

it("fetches from the site root when the base is empty", async () => {
  setFetch(async (input) => {
    expect(String(input)).toBe("/county.geojson");
    return response(200, "{}");
  });
  await expect(fetchJson("/county.geojson", (v) => v, "")).resolves.toEqual({});
});


it("lets the latest request win across two overlapping calls", async () => {
  const run = latest<string>();
  const slow = new Promise<string>((resolve) => setTimeout(() => resolve("first"), 30));
  const fast = new Promise<string>((resolve) => setTimeout(() => resolve("second"), 5));
  const a = run(() => slow);
  const b = run(() => fast);
  expect(await b).toBe("second");
  expect(await a).toBe(STALE);
});

it("drops the error of a stale request", async () => {
  const run = latest<string>();
  const a = run(() => Promise.reject(new Error("old")));
  const b = run(() => Promise.resolve("new"));
  expect(await a).toBe(STALE);
  expect(await b).toBe("new");
});

it("aborts a hung request after FETCH_TIMEOUT_MS and throws DataError", async () => {
  vi.useFakeTimers();
  try {
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
    setFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const pending = fetchJson("storms.json", (v) => v);
    const assertion = expect(pending).rejects.toThrow(/storms\.json: network error/);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});

it("reports a body-read abort from FETCH_TIMEOUT_MS as a network error instead of invalid JSON", async () => {
  vi.useFakeTimers();
  try {
    setFetch(async (_input, init) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise<unknown>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    } as Response));
    const pending = fetchJson("storms.json", (v) => v);
    const assertion = expect(pending).rejects.toThrow(/storms\.json: network error/);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  } finally {
    vi.useRealTimers();
  }
});




it("rejects a response whose Content-Length header exceeds MAX_JSON_BYTES", async () => {
  setFetch(
    async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(16 * 1024 * 1024 + 1) },
      }),
  );
  await expect(fetchJson("storms.json", (v) => v)).rejects.toThrow(/storms\.json: response exceeds 16 MiB/);
});

it("cancels and rejects a chunked stream without Content-Length once read bytes exceed MAX_JSON_BYTES", async () => {
  let cancelled = false;
  const chunk = new Uint8Array(9 * 1024 * 1024);
  let reads = 0;
  setFetch(async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    body: {
      getReader: () => ({
        read: async () => {
          reads += 1;
          return reads <= 2 ? { done: false, value: chunk } : { done: true, value: undefined };
        },
        cancel: async () => {
          cancelled = true;
        },
      }),
    },
  } as unknown as Response));
  await expect(fetchJson("storms.json", (v) => v)).rejects.toThrow(/storms\.json: response exceeds 16 MiB/);
  expect(cancelled).toBe(true);
});

it("caps concurrent requests at MAX_IN_FLIGHT in FIFO order and resolves all 20", async () => {
  expect(MAX_IN_FLIGHT).toBe(6);
  let active = 0;
  let peak = 0;
  const startedOrder: string[] = [];
  const gates: Array<() => void> = [];
  setFetch((input) => {
    active += 1;
    if (active > peak) peak = active;
    startedOrder.push(String(input));
    return new Promise<Response>((resolve) => {
      gates.push(() => {
        active -= 1;
        resolve(response(200, JSON.stringify({ url: input })));
      });
    });
  });

  const urls = Array.from({ length: 20 }, (_, i) => `/item-${i}.json`);
  const promises = urls.map((u) => fetchUrlJson(u, u, (v) => (v as { url: string }).url));

  await Promise.resolve();
  expect(active).toBe(6);
  expect(peak).toBe(6);
  expect(startedOrder).toEqual(urls.slice(0, 6));

  while (gates.length > 0) {
    const release = gates.shift()!;
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  const results = await Promise.all(promises);
  expect(results).toEqual(urls);
  expect(peak).toBe(6);
  expect(startedOrder).toEqual(urls);
});

it("starts the 15 s timeout only when a queued request acquires a slot", async () => {
  vi.useFakeTimers();
  try {
    const gates: Array<() => void> = [];
    setFetch((input, init) => {
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
        gates.push(() => resolve(response(200, JSON.stringify({ url: input }))));
      });
    });

    const firstSix = Array.from({ length: 6 }, (_, i) =>
      fetchUrlJson(`/slot-${i}.json`, `slot-${i}`, (v) => v),
    );
    const rejectedChecks = firstSix.slice(1).map((p) => expect(p).rejects.toThrow(/network error/));
    const seventh = fetchUrlJson("/queued.json", "queued.json", (v) => (v as { url: string }).url);

    await vi.advanceTimersByTimeAsync(10_000);
    gates[0]!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(gates.length).toBe(7);
    gates[6]!();
    await expect(seventh).resolves.toBe("/queued.json");
    await Promise.all(rejectedChecks);
    await expect(firstSix[0]).resolves.toEqual({ url: "/slot-0.json" });
  } finally {
    vi.useRealTimers();
  }
});

it("frees the slot on network rejection, HTTP error, and guard throw so queued requests proceed", async () => {
  let call = 0;
  setFetch(async (input) => {
    call += 1;
    if (call === 1) throw new Error("boom");
    if (call === 2) return response(500, "err");
    return response(200, JSON.stringify({ url: input }));
  });

  const p1 = fetchUrlJson("/a.json", "a.json", (v) => v);
  const p2 = fetchUrlJson("/b.json", "b.json", (v) => v);
  const p3 = fetchUrlJson("/c.json", "c.json", () => {
    throw new DataError("c.json", "bad guard");
  });
  const rest = Array.from({ length: 6 }, (_, i) =>
    fetchUrlJson(`/ok-${i}.json`, `ok-${i}.json`, (v) => (v as { url: string }).url),
  );

  await expect(p1).rejects.toThrow(/a\.json: network error/);
  await expect(p2).rejects.toThrow(/b\.json: HTTP 500/);
  await expect(p3).rejects.toThrow(/c\.json: bad guard/);
  await expect(Promise.all(rest)).resolves.toEqual(
    Array.from({ length: 6 }, (_, i) => `/ok-${i}.json`),
  );
});

it("frees slots when 6 hung requests time out so queued requests start after each abort", async () => {
  vi.useFakeTimers();
  try {
    let call = 0;
    setFetch((input, init) => {
      call += 1;
      if (call <= 6) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }
      return Promise.resolve(response(200, JSON.stringify({ url: input })));
    });

    const hung = Array.from({ length: 6 }, (_, i) =>
      fetchUrlJson(`/hung-${i}.json`, `hung-${i}.json`, (v) => v),
    );
    const queued = Array.from({ length: 3 }, (_, i) =>
      fetchUrlJson(`/after-${i}.json`, `after-${i}.json`, (v) => (v as { url: string }).url),
    );

    const hungAssertions = hung.map((p) => expect(p).rejects.toThrow(/network error/));
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await Promise.all(hungAssertions);
    await expect(Promise.all(queued)).resolves.toEqual([
      "/after-0.json",
      "/after-1.json",
      "/after-2.json",
    ]);
  } finally {
    vi.useRealTimers();
  }
});

