import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/theme", () => ({
  useTheme: () => ({ pref: "system", resolved: "light", set: () => {} }),
}));

vi.mock("../storms/map/create-map", () => ({
  createMap: async () => ({
    basemap: false,
    map: { on() {}, queryRenderedFeatures: () => [] },
    setData() {},
    setCounties() {},
    setFill() {},
    setPoint() {},
    flyTo() {},
    fit() {},
    setTheme() {},
    setClassVisible() {},
    setLayerVisible() {},
    setWarnings() {},
    setReportCutoff() {},
    destroy() {},
  }),
}));

import { resetCounties } from "../county";
import { METRO_FIPS, STEP_MINUTES, STEPS } from "../data/constants";
import { setFetch } from "../data/fetch";
import type {
  InternetFile,
  PowerFile,
  Receipt,
  ReportsFile,
  Storm,
  StormsIndex,
  SwathFile,
  WarningsFile,
} from "../data/types";
import { clearFileCache } from "../state/pairs-all";
import { getPinState, resetPinStore, setPresetPin } from "../state/pin";
import { Inspector, InspectorView } from "../storms/map/inspector";
import { PointCheck } from "./point";

interface FakeDomNode {
  nodeType: number;
  tagName: string;
  data?: string;
  childNodes: FakeDomNode[];
  firstChild: FakeDomNode | null;
  parentNode: FakeDomNode | null;
  namespaceURI: string;
  style: Record<string, unknown>;
  [key: string]: unknown;
}

function makeFakeElement(tag: string, text = ""): FakeDomNode {
  const el: FakeDomNode = {
    nodeType: tag === "#text" ? 3 : 1,
    tagName: tag.toUpperCase(),
    data: text,
    childNodes: [],
    firstChild: null,
    parentNode: null,
    namespaceURI: "http://www.w3.org/1999/xhtml",
    style: {},
    onclick: null,
    onchange: null,
    oninput: null,
    onsubmit: null,
    setAttribute(k: string, v: unknown) {
      el[k] = v;
    },
    removeAttribute(k: string) {
      delete el[k];
    },
    addEventListener(type: string, fn: (e?: unknown) => void) {
      el[`on_${type}`] = fn.bind(el);
    },
    removeEventListener(type: string) {
      delete el[`on_${type}`];
    },
    appendChild(child: FakeDomNode) {
      if (child.parentNode) {
        const prev = child.parentNode.childNodes;
        const i = prev.indexOf(child);
        if (i >= 0) prev.splice(i, 1);
      }
      el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    insertBefore(child: FakeDomNode, ref: FakeDomNode | null) {
      if (child.parentNode) {
        const prev = child.parentNode.childNodes;
        const i = prev.indexOf(child);
        if (i >= 0) prev.splice(i, 1);
      }
      const idx = ref ? el.childNodes.indexOf(ref) : -1;
      if (idx >= 0) el.childNodes.splice(idx, 0, child);
      else el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    removeChild(child: FakeDomNode) {
      const idx = el.childNodes.indexOf(child);
      if (idx >= 0) el.childNodes.splice(idx, 1);
      child.parentNode = null;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    focus() {},
  };
  return el;
}

function domText(node: FakeDomNode): string {
  if (node.nodeType === 3) return String(node.data ?? "");
  return node.childNodes.map(domText).join("");
}

function findDomNodes(root: FakeDomNode, match: (n: FakeDomNode) => boolean, out: FakeDomNode[] = []): FakeDomNode[] {
  if (match(root)) out.push(root);
  for (const child of root.childNodes) findDomNodes(child, match, out);
  return out;
}

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "NOAA MRMS", product: "MESH_Max_1440min", file: "2024-05-28.grib2" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-05-29T12:00:00Z",
  package_version: "0.1.0",
};

const square = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const swathFixture: SwathFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: { threshold_mm: 25.4, threshold_in: 1.0, label: "quarter", area_km2: 45 },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.6, 29.7, -95.45, 29.85)]] },
    },
  ],
};

const reportsFixture: ReportsFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-95.5297, 29.7752] },
      properties: { id: 1, time: "2335", location: "Memorial", county: "Harris", state: "TX", size_in: 1.5 },
    },
  ],
};

const warningsFixture: WarningsFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: {
        phenomena: "SV",
        significance: "W",
        event_label: "Severe Thunderstorm Warning",
        eventid: 19,
        polygon_begin: "2024-05-28T23:30:00Z",
        polygon_end: "2024-05-29T00:15:00Z",
        product_id: "HGX-SV-19",
      },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.6, 29.7, -95.3, 29.85)]] },
    },
  ],
};

const powerFixture: PowerFile = {
  receipt,
  window: { start: "2024-05-28T12:00:00Z", step_minutes: STEP_MINUTES, steps: STEPS },
  source: "eaglei",
  utilities: null,
  counties: METRO_FIPS.map((fips, idx) => {
    const out = Array<number | null>(STEPS).fill(0);
    if (fips === "48201") out[60] = 251830;
    return {
      fips,
      name: fips === "48201" ? "Harris" : `County ${idx}`,
      customers: 2_200_000,
      out,
    };
  }),
};

const internetFixture: InternetFile = {
  receipt,
  window: { start: "2024-05-28T12:00:00Z", step_minutes: STEP_MINUTES, steps: STEPS },
  signal: "ping-slash24",
  baseline_days: 7,
  counties: METRO_FIPS.map((fips, idx) => {
    const ratio = Array<number | null>(STEPS).fill(1.0);
    if (fips === "48201") ratio[46] = 0.961;
    return {
      fips,
      name: fips === "48201" ? "Harris" : `County ${idx}`,
      baseline: 2400,
      ratio,
    };
  }),
};

const countiesFixture = {
  type: "FeatureCollection",
  features: METRO_FIPS.map((fips) => ({
    type: "Feature",
    properties: { fips, name: fips === "48201" ? "Harris" : `County ${fips}` },
    geometry: {
      type: "MultiPolygon",
      coordinates: [[square(fips === "48201" ? -96.0 : -95.0, 29.4, -95.0, 30.2)]],
    },
  })),
};

const stormRow: Storm = {
  storm_date: "2024-05-28",
  report_count: 1,
  max_size_in: 1.5,
  report_source: "wcm",
  max_mesh_mm: 25.4,
  scored_reports: 1,
  excluded_reports: 0,
  table: [],
  parcel_total: 100,
  files: {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: null,
    power: "storms/2024-05-28/power.json",
    internet: "storms/2024-05-28/internet.json",
    warnings: "storms/2024-05-28/warnings.geojson",
  },
};

const indexFixture: StormsIndex = {
  confidence: receipt.confidence,
  run_time: receipt.run_time,
  package_version: receipt.package_version,
  radius_km_default: 5,
  storms: [stormRow],
};

describe("Inspector upgrade (US-04.3)", () => {
  beforeEach(() => {
    resetPinStore();
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nearest swath distance when coveringMm is null, warnings with Jump button, power peak and internet trough Jump buttons, Pin toggle, and /try/point link", async () => {
    const jumpedSteps: number[] = [];
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(Inspector, {
          pick: {
            lngLat: [-95.3698, 29.7604],
            coveringMm: null,
            nearest: {
              feature: reportsFixture.features[0]!,
              km: 15.5,
            },
          },
          receipt,
          swath: swathFixture,
          warnings: warningsFixture,
          power: powerFixture,
          internet: internetFixture,
          step: 46,
          onStep: (s) => jumpedSteps.push(s),
          fips: "48201",
          onCounty: () => {},
          onClose: () => {},
        }),
        host as unknown as HTMLElement,
      ),
    );

    const text = domText(host);
    expect(text).toContain("Nearest swath");
    expect(text).toContain("7.8 km");
    expect(text).toContain("Warnings at point");
    expect(text).toContain("Severe Thunderstorm Warning");
    expect(text).toContain("Pin point");
    expect(text).toContain("Open in Point check");

    const buttons = findDomNodes(host, (n) => n.tagName === "BUTTON");
    const jumpWarn = buttons.find(
      (b) => domText(b).includes("Jump") && !domText(b).includes("peak") && !domText(b).includes("trough"),
    );
    const jumpPeak = buttons.find((b) => domText(b).includes("Jump to peak"));
    const jumpTrough = buttons.find((b) => domText(b).includes("Jump to trough"));
    expect(jumpWarn).toBeDefined();
    expect(jumpPeak).toBeDefined();
    expect(jumpTrough).toBeDefined();

    await act(() => {
      (jumpWarn!["on_click"] as (e: { type: string }) => void)({ type: "click" });
      (jumpPeak!["on_click"] as (e: { type: string }) => void)({ type: "click" });
      (jumpTrough!["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(jumpedSteps).toEqual([46, 60, 46]);

    const pinBtn = buttons.find((b) => domText(b).includes("Pin point"))!;
    await act(() => {
      (pinBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(getPinState().pin?.lngLat).toEqual([-95.3698, 29.7604]);
    expect(typeof InspectorView).toBe("function");
  });
});

describe("PointCheck workbench (US-04.1, US-04.2, US-04.4)", () => {
  const storageWrites: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    storageWrites.length = 0;
    resetPinStore();
    clearFileCache();
    resetCounties();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: (k: string) => storageWrites.push(k),
    });
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
    setFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("/counties.geojson")) {
        return new Response(JSON.stringify(countiesFixture), { status: 200 });
      }
      if (url.endsWith("swath.geojson")) {
        return new Response(JSON.stringify(swathFixture), { status: 200 });
      }
      if (url.endsWith("reports.geojson")) {
        return new Response(JSON.stringify(reportsFixture), { status: 200 });
      }
      if (url.endsWith("warnings.geojson")) {
        return new Response(JSON.stringify(warningsFixture), { status: 200 });
      }
      if (url.endsWith("power.json")) {
        return new Response(JSON.stringify(powerFixture), { status: 200 });
      }
      if (url.endsWith("internet.json")) {
        return new Response(JSON.stringify(internetFixture), { status: 200 });
      }
      if (url.startsWith("https://api.weather.gov/")) {
        return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 });
      }
      if (url.startsWith("https://ornl.opendatasoft.com/")) {
        return new Response(JSON.stringify({ total_count: 0, results: [] }), { status: 200 });
      }
      if (url.startsWith("https://api.ioda.inetintel.cc.gatech.edu/")) {
        return new Response(
          JSON.stringify({ error: null, data: [[{ from: 1000, step: 600, values: [2400, 2400] }]] }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });
  });

  afterEach(() => {
    setFetch(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("updates shared pin on preset selection, renders stamp strip, 4 rollup facts, live check bar, and 7-column proximity table, and writes 0 coordinates to localStorage", async () => {
    setPresetPin("memorial");
    expect(getPinState().pin?.label).toBe("Memorial (77024)");

    const host = makeFakeElement("div");
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));

    const text = domText(host);
    expect(text).toContain("Pin my location");
    expect(text).toContain("Clear pin");
    expect(text).toContain("Memorial (77024)");
    expect(text).toContain("Harris County (48201)");
    expect(text).toContain("Inside Harris MESH crop");
    expect(text).toContain("Check live NWS & outage feeds");
    expect(text).toContain("2024-05-28");
    expect(text).toContain("quarter");

    const headers = findDomNodes(host, (n) => n.tagName === "TH");
    expect(headers).toHaveLength(7);

    // Trigger on-demand live check button
    const liveBtn = findDomNodes(
      host,
      (n) => n.tagName === "BUTTON" && domText(n).includes("Check live NWS & outage feeds"),
    )[0]!;
    await act(async () => {
      (liveBtn["on_click"] as (e: { type: string; preventDefault(): void }) => void)({
        type: "click",
        preventDefault() {},
      });
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(domText(host)).toContain("0 active alerts at pinned point");
    expect(storageWrites).toEqual([]);
  });

  it("isolates a single failed impact file (e.g. 2024-05-28/power.json HTTP 500) to its cell with an inline Retry button while rendering hail, reports, warnings, and other storms normally (CR-03.1, CR-03.2)", async () => {
    let failPower = true;
    const storm2: Storm = {
      ...stormRow,
      storm_date: "2024-05-16",
      files: {
        swath: "storms/2024-05-16/swath.geojson",
        reports: "storms/2024-05-16/reports.geojson",
        pairs: "storms/2024-05-16/pairs.json",
        zip_counts: null,
        power: "storms/2024-05-16/power.json",
        internet: "storms/2024-05-16/internet.json",
        warnings: "storms/2024-05-16/warnings.geojson",
      },
    };
    const twoStormIndex: StormsIndex = {
      ...indexFixture,
      storms: [stormRow, storm2],
    };

    setFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("/counties.geojson")) {
        return new Response(JSON.stringify(countiesFixture), { status: 200 });
      }
      if (url.endsWith("swath.geojson")) {
        return new Response(JSON.stringify(swathFixture), { status: 200 });
      }
      if (url.endsWith("reports.geojson")) {
        return new Response(JSON.stringify(reportsFixture), { status: 200 });
      }
      if (url.endsWith("warnings.geojson")) {
        return new Response(JSON.stringify(warningsFixture), { status: 200 });
      }
      if (url.endsWith("2024-05-28/power.json") && failPower) {
        return new Response("upstream failure", { status: 500 });
      }
      if (url.endsWith("power.json")) {
        return new Response(JSON.stringify(powerFixture), { status: 200 });
      }
      if (url.endsWith("internet.json")) {
        return new Response(JSON.stringify(internetFixture), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    setPresetPin("memorial");
    const host = makeFakeElement("div");
    await act(() => render(h(PointCheck, { index: twoStormIndex }), host as unknown as HTMLElement));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    await act(() => render(h(PointCheck, { index: twoStormIndex }), host as unknown as HTMLElement));

    const text = domText(host);
    // Hail swath, SPC reports, warnings, and the other storm row still render normally!
    expect(text).toContain("Radar-estimated hail size (at pin / \u2264 5 km)");
    expect(text).toContain("SPC reports \u2264 5 km");
    expect(text).toContain("quarter");
    expect(text).toContain("2024-05-16");
    // Only the failed cell renders the isolated error + Retry button
    expect(text).toContain("Power off (power.json: HTTP 500)");
    expect(text).toContain("Retry");

    // Clicking Retry refetches the evicted 2024-05-28/power.json and resolves the cell
    failPower = false;
    const retryBtn = findDomNodes(
      host,
      (n) => n.tagName === "BUTTON" && domText(n).trim() === "Retry",
    )[0]!;
    await act(() => {
      (retryBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    await act(() => render(h(PointCheck, { index: twoStormIndex }), host as unknown as HTMLElement));
    expect(domText(host)).not.toContain("Power off (power.json: HTTP 500)");
    expect(domText(host)).toContain("251,830");
  });

  it("ignores stale fetchLiveStatus response when the pin changes while live check is in flight", async () => {
    let resolveFirstNws: ((res: Response) => void) | null = null;
    setFetch(async (input) => {
      const url = String(input);
      if (url.endsWith("/counties.geojson")) {
        return new Response(JSON.stringify(countiesFixture), { status: 200 });
      }
      if (url.endsWith("swath.geojson")) {
        return new Response(JSON.stringify(swathFixture), { status: 200 });
      }
      if (url.endsWith("reports.geojson")) {
        return new Response(JSON.stringify(reportsFixture), { status: 200 });
      }
      if (url.endsWith("warnings.geojson")) {
        return new Response(JSON.stringify(warningsFixture), { status: 200 });
      }
      if (url.endsWith("power.json")) {
        return new Response(JSON.stringify(powerFixture), { status: 200 });
      }
      if (url.endsWith("internet.json")) {
        return new Response(JSON.stringify(internetFixture), { status: 200 });
      }
      if (url.startsWith("https://api.weather.gov/")) {
        return new Promise<Response>((resolve) => {
          resolveFirstNws = resolve;
        });
      }
      if (url.startsWith("https://ornl.opendatasoft.com/")) {
        return new Response(JSON.stringify({ total_count: 0, results: [] }), { status: 200 });
      }
      if (url.startsWith("https://api.ioda.inetintel.cc.gatech.edu/")) {
        return new Response(
          JSON.stringify({ error: null, data: [[{ from: 1000, step: 600, values: [2400, 2400] }]] }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    setPresetPin("memorial");
    const host = makeFakeElement("div");
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));
    await act(async () => void (await vi.advanceTimersByTimeAsync(50)));
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));

    const liveBtn = findDomNodes(
      host,
      (n) => n.tagName === "BUTTON" && domText(n).includes("Check live NWS & outage feeds"),
    )[0]!;
    await act(async () => {
      (liveBtn["on_click"] as (e: { type: string; preventDefault(): void }) => void)({
        type: "click",
        preventDefault() {},
      });
    });
    expect(domText(host)).toContain("Checking live feeds");

    // Switch pin while fetchLiveStatus is in flight
    await act(() => {
      setPresetPin("downtown");
    });
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));
    expect(domText(host)).toContain("Check live NWS & outage feeds");

    // Resolve stale first request; it must be ignored
    await act(async () => {
      resolveFirstNws!(new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 }));
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(() => render(h(PointCheck, { index: indexFixture }), host as unknown as HTMLElement));
    expect(domText(host)).not.toContain("0 active alerts at pinned point");
  });
});
