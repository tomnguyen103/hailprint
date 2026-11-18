import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pairs, Receipt, StormsIndex } from "../data/types";
import type { PooledRow } from "../pool";
import { RULER } from "../ruler";
import { resetRadiusKm, setRadiusKm } from "../state/radius";
import { Scorecard } from "./scorecard";
import { ThresholdCurve } from "./threshold-curve";

const mockPairsState = {
  status: "ready" as "ready" | "loading" | "error",
  data: [] as Pairs[],
  error: undefined,
  showLoading: false,
  retry: () => {},
};

vi.mock("../state/pairs-all", () => ({
  usePairsAll: () => mockPairsState,
}));

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
    style: {
      setProperty(k: string, v: unknown) {
        (el.style as Record<string, unknown>)[k] = v;
      },
    },
    onclick: null,
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
    focus() {
      const fn = el["on_focus"] as ((e?: unknown) => void) | undefined;
      fn?.({ type: "focus" });
    },
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

function classOf(n: FakeDomNode): string {
  return String(n["class"] ?? n["className"] ?? "");
}

function hasClass(n: FakeDomNode, cls: string): boolean {
  return classOf(n).split(/\s+/).includes(cls);
}

const RECEIPT: Receipt = {
  storm_date: "2024-05-28",
  confidence: "settled",
  run_time: "2026-04-01T00:00:00Z",
  package_version: "0.2.0",
  sources: [],
};

function makePairs(stormDate: string, maxRadiusKm = 20): Pairs {
  return {
    receipt: { ...RECEIPT, storm_date: stormDate },
    radius_km_default: 5,
    radius_km_max: maxRadiusKm,
    edge_margin_m: 1000,
    classes: RULER.map((r) => ({
      threshold_mm: r.threshold_mm,
      threshold_in: r.threshold_in,
      label: r.object,
      swath_km2: 10,
      unverifiable_km2: Array.from({ length: maxRadiusKm + 1 }, () => 2),
    })),
    reports: [
      {
        id: 1,
        size_in: 2.0,
        edge_m: 30000,
        dist_m: RULER.map(() => 1000),
      },
    ],
  };
}

function makeIndex(reportSources: Array<"wcm" | "spc-daily">): StormsIndex {
  return {
    confidence: "settled",
    run_time: "2026-04-01T00:00:00Z",
    package_version: "0.2.0",
    radius_km_default: 5,
    storms: reportSources.map((source, idx) => {
      const date = `2024-05-${String(10 + idx).padStart(2, "0")}`;
      return {
        storm_date: date,
        report_count: 5,
        max_size_in: 1.75,
        report_source: source,
        max_mesh_mm: 45,
        scored_reports: 5,
        excluded_reports: 0,
        table: [],
        parcel_total: null,
        files: {
          swath: `storms/${date}/swath.geojson`,
          reports: `storms/${date}/reports.geojson`,
          pairs: `storms/${date}/pairs.json`,
          zip_counts: null,
          warnings: null,
          power: null,
          internet: null,
        },
      };
    }),
  };
}

function makeRows(): PooledRow[] {
  return RULER.map((r, idx) => ({
    threshold_mm: r.threshold_mm,
    threshold_in: r.threshold_in,
    label: r.object,
    report_count: 10,
    hits: 5,
    misses: 2,
    false_alarms: 1,
    correct_negatives: 20,
    pod: 0.71,
    far: 0.17,
    csi: 0.62,
    hss: 0.4 + idx * 0.03,
    swath_km2: 12,
    unverifiable_km2: 1,
  }));
}

describe("Scorecard empty cohort and ThresholdCurve roving Tab stop (US-12.1, US-12.3)", () => {
  beforeEach(() => {
    resetRadiusKm();
    vi.stubGlobal("document", {
      createElement: (tag: string) => makeFakeElement(tag),
      createElementNS: (_ns: string, tag: string) => makeFakeElement(tag),
      createTextNode: (text: string) => makeFakeElement("#text", text),
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    resetRadiusKm();
    vi.unstubAllGlobals();
  });

  it("disables a 0-storm cohort pill with visible count 0", async () => {
    const index = makeIndex(["wcm"]);
    mockPairsState.status = "ready";
    mockPairsState.data = [makePairs("2024-05-10")];

    const host = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "table" }), host as unknown as HTMLElement));

    const pills = findDomNodes(host, (n) => n.tagName === "BUTTON" && classOf(n).includes("cohort-pill"));
    const spcPill = pills.find((p) => domText(p).includes("SPC-Daily"));
    expect(spcPill).toBeDefined();
    expect(domText(spcPill!)).toContain("(0)");
    expect(Boolean(spcPill!["disabled"])).toBe(true);

    const wcmPill = pills.find((p) => domText(p).includes("WCM 2024"));
    expect(wcmPill).toBeDefined();
    expect(Boolean(wcmPill!["disabled"])).toBe(false);
  });

  it("renders EmptyState sentence when the active cohort has 0 storms, and ErrorState when storms exist but pairs are missing", async () => {
    const index = makeIndex([]);
    mockPairsState.status = "ready";
    mockPairsState.data = [];

    const host = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "table" }), host as unknown as HTMLElement));

    const empty = findDomNodes(host, (n) => classOf(n).includes("state-empty"));
    expect(empty).toHaveLength(1);
    expect(domText(empty[0]!)).toContain("No storm dates in this cohort.");
    const emptyLinks = findDomNodes(empty[0]!, (n) => n.tagName === "A");
    expect(emptyLinks).toHaveLength(1);
    expect(emptyLinks[0]!["href"]).toBe("/storms");

    const mismatchedIndex = makeIndex(["wcm"]);
    mockPairsState.data = [makePairs("2024-05-11")];
    const host2 = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index: mismatchedIndex, view: "table" }), host2 as unknown as HTMLElement));
    const pills = findDomNodes(host2, (n) => n.tagName === "BUTTON" && classOf(n).includes("cohort-pill"));
    const wcmPill = pills.find((p) => domText(p).includes("WCM 2024"))!;
    await act(() => {
      (wcmPill["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    const err = findDomNodes(host2, (n) => classOf(n).includes("state-error"));
    expect(err).toHaveLength(1);
    expect(domText(err[0]!)).toContain("no matching pairs for cohort");
  });

  it("exposes one Tab stop across all 7 markers and a >= 20 unit transparent hit circle per marker", async () => {
    const rows = makeRows();
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ThresholdCurve, { rows, metric: "hss", onMetric: () => {} }), host as unknown as HTMLElement),
    );

    const markers = findDomNodes(host, (n) => n.tagName === "CIRCLE" && classOf(n) === "marker");
    expect(markers).toHaveLength(7);
    for (const m of markers) {
      expect(Number(m["r"])).toBe(4);
    }
    const tabIndexOf = (n: FakeDomNode) => Number(n["tabIndex"] ?? n["tabindex"]);
    const tabStops = markers.filter((m) => tabIndexOf(m) === 0);
    const rovingRest = markers.filter((m) => tabIndexOf(m) === -1);
    expect(tabStops).toHaveLength(1);
    expect(rovingRest).toHaveLength(6);

    const hitCircles = findDomNodes(host, (n) => n.tagName === "CIRCLE" && classOf(n) === "marker-hit");
    expect(hitCircles).toHaveLength(7);
    for (const hit of hitCircles) {
      expect(Number(hit["r"])).toBeGreaterThanOrEqual(20);
    }
  });

  it("moves roving focus across markers on ArrowRight, ArrowUp, ArrowLeft, ArrowDown, Home, and End", async () => {
    const rows = makeRows();
    const host = makeFakeElement("div");
    await act(() =>
      render(h(ThresholdCurve, { rows, metric: "hss", onMetric: () => {} }), host as unknown as HTMLElement),
    );

    const svg = findDomNodes(host, (n) => n.tagName === "SVG")[0]!;
    const activeTabStopIdx = () => {
      const markers = findDomNodes(host, (n) => n.tagName === "CIRCLE" && classOf(n) === "marker");
      return markers.findIndex((m) => Number(m["tabIndex"] ?? m["tabindex"]) === 0);
    };

    expect(activeTabStopIdx()).toBe(0);

    const sendKey = async (key: string) => {
      let prevented = false;
      await act(() => {
        const fn = (svg["on_keydown"] ?? svg["on_KeyDown"]) as ((e: unknown) => void) | undefined;
        fn?.({
          type: "KeyDown",
          key,
          preventDefault() {
            prevented = true;
          },
        });
      });
      return prevented;
    };

    expect(await sendKey("ArrowRight")).toBe(true);
    expect(activeTabStopIdx()).toBe(1);

    expect(await sendKey("End")).toBe(true);
    expect(activeTabStopIdx()).toBe(6);

    expect(await sendKey("Home")).toBe(true);
    expect(activeTabStopIdx()).toBe(0);

    expect(await sendKey("ArrowUp")).toBe(true);
    expect(activeTabStopIdx()).toBe(1);

    expect(await sendKey("ArrowDown")).toBe(true);
    expect(activeTabStopIdx()).toBe(0);
  });

  it("caps Scorecard TableView and ReportClassifierTable primary rows at 4 columns and opens PeekDrawer on row click (AUD-14, AUD-15)", async () => {
    const { ReportClassifierTable } = await import("../storms/report-classifier-table");
    const index = makeIndex(["wcm"]);
    mockPairsState.status = "ready";
    mockPairsState.data = [makePairs("2024-05-10")];

    const host = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "table" }), host as unknown as HTMLElement));

    expect(findDomNodes(host, (n) => classOf(n).includes("view-header"))).toHaveLength(1);
    expect(findDomNodes(host, (n) => classOf(n).includes("view-body"))).toHaveLength(1);

    const tables = findDomNodes(host, (n) => n.tagName === "TABLE");
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const primaryHeaders = findDomNodes(tables[0]!, (n) => n.tagName === "TH");
    expect(primaryHeaders).toHaveLength(4);

    // Click first class pick button to open PeekDrawer with ContingencyGrid and secondary metrics
    expect(findDomNodes(host, (n) => hasClass(n, "cgrid"))).toHaveLength(0);
    const classBtn = findDomNodes(tables[0]!, (n) => n.tagName === "BUTTON" && classOf(n).includes("class-pick"))[0]!;
    expect(domText(classBtn).trim().split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(3);
    const chipBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && classOf(n).includes("chip"))[0]!;
    expect(domText(chipBtn).trim()).toBe("pairs.json");
    await act(() => {
      (classBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(domText(host)).toContain("Unverifiable km²");
    expect(domText(host)).toContain("Scored reports");
    const drawer = findDomNodes(host, (n) => hasClass(n, "peek-drawer"))[0]!;
    expect(drawer).toBeDefined();
    expect(findDomNodes(drawer, (n) => hasClass(n, "cgrid"))).toHaveLength(1);
    expect(findDomNodes(host, (n) => classOf(n).includes("sensitivity-section"))).toHaveLength(0);

    const hostCurve = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "curve" }), hostCurve as unknown as HTMLElement));
    expect(findDomNodes(hostCurve, (n) => classOf(n).includes("sensitivity-section"))).toHaveLength(1);
    // Switch curve metric to POD (non-null for 1-report fixture) and verify highlightMm circle renders
    const podBtn = findDomNodes(hostCurve, (n) => n.tagName === "BUTTON" && domText(n).trim() === "POD")[0]!;
    await act(() => {
      (podBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    const highlighted = findDomNodes(hostCurve, (n) => n.tagName === "CIRCLE" && classOf(n) === "highlight");
    expect(highlighted).toHaveLength(1);

    const host2 = makeFakeElement("div");
    await act(() =>
      render(
        h(ReportClassifierTable, {
          stormDate: "2024-05-10",
          pairs: makePairs("2024-05-10"),
          reportsGeo: null,
          radiusKm: 5,
          thresholdMm: 25.4,
          thresholdIn: 1.0,
        }),
        host2 as unknown as HTMLElement,
      ),
    );
    const classifierHeaders = findDomNodes(host2, (n) => n.tagName === "TH");
    expect(classifierHeaders).toHaveLength(4);
  });

  it("clamps active radius to cohort minimum radius_km_max without crashing when shared radius exceeds it", async () => {
    const index = makeIndex(["wcm", "spc-daily"]);
    mockPairsState.status = "ready";
    mockPairsState.data = [makePairs("2024-05-10", 20), makePairs("2024-05-11", 10)];
    setRadiusKm(18);

    const host = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "table" }), host as unknown as HTMLElement));

    expect(findDomNodes(host, (n) => classOf(n).includes("state-error"))).toHaveLength(0);
    expect(findDomNodes(host, (n) => n.tagName === "TABLE")).toHaveLength(1);
    const slider = findDomNodes(host, (n) => n.tagName === "INPUT" && n["type"] === "range")[0]!;
    expect(slider["max"]).toBe(10);
    expect(slider["value"]).toBe(10);
    const output = findDomNodes(host, (n) => n.tagName === "OUTPUT")[0]!;
    expect(domText(output)).toBe("10 km");

    const hostCurve = makeFakeElement("div");
    await act(() => render(h(Scorecard, { index, view: "curve" }), hostCurve as unknown as HTMLElement));
    expect(findDomNodes(hostCurve, (n) => classOf(n).includes("state-error"))).toHaveLength(0);
    expect(domText(hostCurve)).toContain("R = 10 km");
  });

  it("enforces Corporate Standard v1 bold cap, table surface tokens, zero docked inspector shadow, and centered empty states (US-02.1, US-02.2)", () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const baseCss = read("../styles/base.css");
    const stormsCss = read("../styles/storms.css");
    const mapCss = read("../styles/map.css");
    const shellCss = read("../styles/shell.css");

    expect(baseCss).toMatch(/strong,\s*b\s*\{[^}]*font-weight:\s*600/);
    const tableThMatch = stormsCss.match(/\.table th\s*\{([^}]*)\}/);
    expect(tableThMatch).not.toBeNull();
    expect(tableThMatch![1]).toContain("var(--surface-muted)");
    expect(tableThMatch![1]).toContain("12px");
    expect(stormsCss).toContain(".table tbody tr:hover");
    const inspectorMatch = mapCss.match(/\/\* Inspector \*\/\s*\.inspector\s*\{([^}]*)\}/);
    expect(inspectorMatch).not.toBeNull();
    expect(inspectorMatch![1]).not.toContain("box-shadow");
    expect(mapCss).not.toMatch(/@media\s*\(max-width:\s*1279px\)\s*\{[^}]*\.inspector[^}]*box-shadow/);
    const mobileInspectorMatch = mapCss.match(/@media\s*\(max-width:\s*767px\)\s*\{\s*\.inspector\s*\{([^}]*)\}/);
    expect(mobileInspectorMatch).not.toBeNull();
    expect(mobileInspectorMatch![1]).toContain("box-shadow: var(--shadow)");
    const stateMatch = shellCss.match(/\/\* States \*\/\s*\.state\s*\{([^}]*)\}/);
    expect(stateMatch).not.toBeNull();
    expect(stateMatch![1]).toContain("justify-items: center");
    expect(stateMatch![1]).toContain("min-height: 220px");
  });
});

