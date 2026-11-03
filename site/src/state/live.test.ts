import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFetch } from "../data/fetch";
import { ageMinutes, freshness } from "../live/freshness";
import { LIVE_REFRESH_MS, type LiveData, useLive } from "./live";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../live/fixtures/hail/${name}`, import.meta.url)), "utf8"));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("useLive", () => {
  let visibilityState: "visible" | "hidden";
  let listeners: Map<string, Set<() => void>>;
  let host: HTMLElement;
  let urls: string[];
  let answer: (url: string, call: number) => Response;
  let states: { status: string; data: LiveData | undefined; showLoading: boolean; now: Date }[];

  function Probe() {
    const live = useLive();
    states.push({ status: live.status, data: live.data, showLoading: live.showLoading, now: live.now });
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    listeners = new Map();
    urls = [];
    states = [];
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener(type: string, fn: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        listeners.get(type)?.delete(fn);
      },
    });
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (id: number) => clearInterval(id),
    });
    host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;
    answer = (url) => jsonResponse(fixture(url.slice(url.lastIndexOf("/") + 1)));
    let nowCalls = 0;
    setFetch(async (url) => {
      const text = String(url);
      urls.push(text);
      if (text.endsWith("now.json")) nowCalls += 1;
      return answer(text, nowCalls);
    });
  });

  afterEach(() => {
    setFetch(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(10)));
  const emitVisibility = () => {
    for (const fn of listeners.get("visibilitychange") ?? []) fn();
  };

  it("loads live/now.json, then the three files it names under live/", async () => {
    await act(() => render(h(Probe, null), host));
    await settle();

    expect(urls.map((u) => u.replace(/^.*\/data\//, ""))).toEqual([
      "live/now.json",
      "live/swath.geojson",
      "live/reports.geojson",
      "live/warnings.geojson",
    ]);
    const last = states.at(-1)!;
    expect(last.status).toBe("ready");
    expect(last.data?.now.run_time).toBe("2024-05-29T12:14:00Z");
    expect(last.data?.swath?.features).toHaveLength(6);
    expect(last.data?.reports?.features).toHaveLength(10);
    expect(last.data?.warnings?.features).toHaveLength(5);
    expect(last.data?.notes).toEqual([]);
  });

  it("refreshes every 2 min while visible, pauses while hidden, and refreshes on return", async () => {
    expect(LIVE_REFRESH_MS).toBe(120_000);
    answer = (url, call) => {
      const name = url.slice(url.lastIndexOf("/") + 1);
      const body = fixture(name);
      if (name === "now.json") body["run_time"] = `2024-05-29T12:${String(14 + call).padStart(2, "0")}:00Z`;
      return jsonResponse(body);
    };
    await act(() => render(h(Probe, null), host));
    await settle();
    expect(states.at(-1)?.data?.now.run_time).toBe("2024-05-29T12:15:00Z");

    await act(async () => void (await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS)));
    expect(states.at(-1)?.data?.now.run_time).toBe("2024-05-29T12:16:00Z");

    visibilityState = "hidden";
    await act(async () => emitVisibility());
    const before = urls.length;
    await act(async () => void (await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 3)));
    expect(urls.length).toBe(before);

    visibilityState = "visible";
    await act(async () => emitVisibility());
    await settle();
    expect(states.at(-1)?.data?.now.run_time).toBe("2024-05-29T12:17:00Z");
    expect(states.some((s) => s.showLoading)).toBe(false);
  });

  it("keeps the last good data when a background refresh fails and advances now into aging and stale", async () => {
    vi.setSystemTime(new Date("2024-05-29T12:14:00Z"));
    await act(() => render(h(Probe, null), host));
    await settle();
    expect(freshness(states.at(-1)!.data!.now.run_time, states.at(-1)!.now)).toBe("fresh");

    answer = () => jsonResponse(null, 500);

    await act(async () => void (await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 10)));
    expect(states.at(-1)?.status).toBe("ready");
    expect(states.at(-1)?.data?.now.run_time).toBe("2024-05-29T12:14:00Z");
    expect(ageMinutes(states.at(-1)!.data!.now.run_time, states.at(-1)!.now)).toBe(20);
    expect(freshness(states.at(-1)!.data!.now.run_time, states.at(-1)!.now)).toBe("aging");

    await act(async () => void (await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS * 20)));
    expect(ageMinutes(states.at(-1)!.data!.now.run_time, states.at(-1)!.now)).toBe(60);
    expect(freshness(states.at(-1)!.data!.now.run_time, states.at(-1)!.now)).toBe("stale");
  });

  it("preserves previously loaded layers when a layer fetch fails on a background refresh", async () => {
    await act(() => render(h(Probe, null), host));
    await settle();
    expect(states.at(-1)?.data?.swath?.features).toHaveLength(6);

    answer = (url) => {
      if (url.endsWith("swath.geojson")) return jsonResponse(null, 500);
      const name = url.slice(url.lastIndexOf("/") + 1);
      const body = fixture(name);
      if (name === "now.json") body["run_time"] = "2024-05-29T12:16:00Z";
      return jsonResponse(body);
    };

    await act(async () => void (await vi.advanceTimersByTimeAsync(LIVE_REFRESH_MS)));
    const latest = states.at(-1)?.data;
    expect(latest?.now.run_time).toBe("2024-05-29T12:16:00Z");
    expect(latest?.swath?.features).toHaveLength(6);
    expect(latest?.notes).toEqual(["swath.geojson: HTTP 500"]);
  });

  it("skips a layer file that fails its guard with one note, and keeps the others", async () => {
    answer = (url) =>
      url.endsWith("warnings.geojson")
        ? jsonResponse({ type: "FeatureCollection", features: "no" })
        : jsonResponse(fixture(url.slice(url.lastIndexOf("/") + 1)));

    await act(() => render(h(Probe, null), host));
    await settle();

    const data = states.at(-1)?.data;
    expect(data?.warnings).toBeNull();
    expect(data?.swath?.features).toHaveLength(6);
    expect(data?.notes).toEqual(["warnings.geojson: receipt is not an object"]);
  });

  it("gives the error state when now.json fails", async () => {
    answer = (url) => (url.endsWith("now.json") ? jsonResponse({ kind: "storms" }) : jsonResponse(null, 500));

    await act(() => render(h(Probe, null), host));
    await settle();

    expect(states.at(-1)?.status).toBe("error");
  });
});
