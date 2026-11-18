import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFetch } from "../data/fetch";
import type { Pairs, Receipt, ReportsFile, Storm } from "../data/types";
import { RULER } from "../ruler";
import { resetRadiusKm } from "../state/radius";
import { ScorePane } from "./score-pane";

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
    onchange: null,
    oninput: null,
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
      el.childNodes.push(child);
      child.parentNode = el;
      el.firstChild = el.childNodes[0] ?? null;
      return child;
    },
    insertBefore(child: FakeDomNode, ref: FakeDomNode | null) {
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

function classOf(n: FakeDomNode): string {
  return String(n["class"] ?? n["className"] ?? "");
}

function hasClass(n: FakeDomNode, cls: string): boolean {
  return classOf(n).split(/\s+/).includes(cls);
}

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "SPC", product: "WCM hail (wcm)", file: "240528.csv" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-06-01T00:00:00Z",
  package_version: "0.1.0",
};

const storm: Storm = {
  storm_date: "2024-05-28",
  report_count: 1,
  max_size_in: 2.0,
  report_source: "wcm",
  max_mesh_mm: 50,
  scored_reports: 1,
  excluded_reports: 0,
  table: [],
  parcel_total: 100,
  files: {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: null,
    warnings: null,
    power: null,
    internet: null,
  },
};

const pairs: Pairs = {
  receipt,
  radius_km_default: 5,
  radius_km_max: 20,
  edge_margin_m: 1000,
  classes: RULER.map((r) => ({
    threshold_mm: r.threshold_mm,
    threshold_in: r.threshold_in,
    label: r.object,
    swath_km2: 12,
    unverifiable_km2: Array.from({ length: 21 }, () => 3),
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

const reports: ReportsFile = {
  type: "FeatureCollection",
  receipt,
  features: [],
};

describe("ScorePane row PeekDrawer with ContingencyGrid (US-01.1, US-05.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRadiusKm();
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
    setFetch(async () =>
      new Response(JSON.stringify(pairs), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    setFetch(null);
    resetRadiusKm();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens PeekDrawer with ContingencyGrid when clicking a ScorePane size class row and closes on Close", async () => {
    const host = makeFakeElement("div");
    await act(() =>
      render(
        h(ScorePane, {
          storm,
          reports: { status: "ready", data: reports },
        }),
        host as unknown as HTMLElement,
      ),
    );
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));

    expect(findDomNodes(host, (n) => hasClass(n, "peek-drawer"))).toHaveLength(0);
    const classBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && hasClass(n, "class-pick"))[1]!;
    expect(classBtn).toBeDefined();

    await act(() => {
      (classBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });

    const drawers = findDomNodes(host, (n) => hasClass(n, "peek-drawer"));
    expect(drawers).toHaveLength(1);
    const drawer = drawers[0]!;
    expect(findDomNodes(drawer, (n) => hasClass(n, "cgrid"))).toHaveLength(1);
    expect(domText(drawer)).toContain("Scored reports");
    expect(domText(drawer)).toContain("Unverifiable km²");

    const closeBtn = findDomNodes(drawer, (n) => n.tagName === "BUTTON" && domText(n).trim() === "Close")[0]!;
    await act(() => {
      (closeBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    expect(findDomNodes(host, (n) => hasClass(n, "peek-drawer"))).toHaveLength(0);
  });
});
