import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFetch } from "../data/fetch";
import type { StormsIndex } from "../data/types";
import { REFRESH_MS, useIndex } from "./index";

function makeIndex(dates: string[], run_time = "2026-10-29T12:00:00Z"): StormsIndex {
  return {
    confidence: "radar-estimated hail size",
    run_time,
    package_version: "0.1.0",
    radius_km_default: 5,
    storms: dates.map((storm_date) => ({
      storm_date,
      report_count: 2,
      max_size_in: 1.5,
      report_source: "wcm",
      max_mesh_mm: 30,
      scored_reports: 2,
      excluded_reports: 0,
      table: [],
      parcel_total: null,
      files: {
        swath: `storms/${storm_date}/swath.geojson`,
        reports: `storms/${storm_date}/reports.geojson`,
        pairs: `storms/${storm_date}/pairs.json`,
        zip_counts: null,
        warnings: `storms/${storm_date}/warnings.geojson`,
        power: null,
        internet: null,
      },
    })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("useIndex", () => {
  let visibilityState: "visible" | "hidden";
  let listeners: Map<string, Set<() => void>>;
  let host: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    visibilityState = "visible";
    listeners = new Map();
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
  });

  afterEach(() => {
    setFetch(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const emitVisibility = () => {
    for (const fn of listeners.get("visibilitychange") ?? []) fn();
  };

  it("re-fetches storms.json on tab visibility and every hour while visible without flashing loading", async () => {
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(makeIndex(["2024-05-28"]));
      if (calls === 2) return jsonResponse(makeIndex(["2025-05-01", "2024-05-28"]));
      return jsonResponse(makeIndex(["2026-08-28", "2025-05-01", "2024-05-28"]));
    });

    const states: { status: string; dates: string[]; showLoading: boolean }[] = [];
    function Probe() {
      const idx = useIndex();
      states.push({
        status: idx.status,
        dates: idx.status === "ready" ? idx.data.storms.map((s) => s.storm_date) : [],
        showLoading: idx.showLoading,
      });
      return null;
    }

    await act(() => render(h(Probe, null), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(calls).toBe(1);
    expect(states.at(-1)).toEqual({ status: "ready", dates: ["2024-05-28"], showLoading: false });

    // Hourly refresh while visible
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(calls).toBe(2);
    expect(states.at(-1)).toEqual({
      status: "ready",
      dates: ["2025-05-01", "2024-05-28"],
      showLoading: false,
    });

    // Hidden tab skips hourly timer, then becoming visible triggers one refresh and resets the timer
    visibilityState = "hidden";
    await act(async () => emitVisibility());
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS * 2)));
    expect(calls).toBe(2);

    visibilityState = "visible";
    await act(async () => emitVisibility());
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(calls).toBe(3);
    expect(states.at(-1)).toEqual({
      status: "ready",
      dates: ["2026-08-28", "2025-05-01", "2024-05-28"],
      showLoading: false,
    });
    expect(states.some((s) => s.showLoading)).toBe(false);
  });

  it("preserves existing ready data when a background refresh fails", async () => {
    let calls = 0;
    setFetch(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(makeIndex(["2024-05-28"]));
      return jsonResponse("server error", 500);
    });

    const states: ReturnType<typeof useIndex>[] = [];
    function Probe() {
      states.push(useIndex());
      return null;
    }

    await act(() => render(h(Probe, null), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(states.at(-1)?.status).toBe("ready");

    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(calls).toBe(2);
    const current = states.at(-1)!;
    expect(current.status).toBe("ready");
    if (current.status === "ready") {
      expect(current.data.storms.map((s) => s.storm_date)).toEqual(["2024-05-28"]);
    }
  });

  it("does not overwrite a newer refreshed index if the initial load settles later", async () => {
    let resolveInitial!: (r: Response) => void;
    let calls = 0;
    setFetch(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise<Response>((resolve) => {
          resolveInitial = resolve;
        });
      }
      return Promise.resolve(jsonResponse(makeIndex(["2025-05-01"], "2026-10-29T13:00:00Z")));
    });

    const states: ReturnType<typeof useIndex>[] = [];
    function Probe() {
      states.push(useIndex());
      return null;
    }

    await act(() => render(h(Probe, null), host));
    // Trigger visibility refresh while initial request is still pending
    await act(async () => emitVisibility());
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(states.at(-1)?.status).toBe("ready");
    if (states.at(-1)?.status === "ready") {
      expect(states.at(-1)!.data!.storms.map((s) => s.storm_date)).toEqual(["2025-05-01"]);
    }

    // Now settle the older initial request
    await act(async () => {
      resolveInitial(jsonResponse(makeIndex(["2024-05-28"], "2026-10-29T12:00:00Z")));
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(states.at(-1)?.status).toBe("ready");
    if (states.at(-1)?.status === "ready") {
      expect(states.at(-1)!.data!.storms.map((s) => s.storm_date)).toEqual(["2025-05-01"]);
    }
  });
});
