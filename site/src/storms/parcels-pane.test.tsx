import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setFetch } from "../data/fetch";
import type { Receipt, Storm, ZipCounts } from "../data/types";
import { ParcelsPane } from "./parcels-pane";

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
  };
  return el;
}

function findDomNodes(root: FakeDomNode, match: (n: FakeDomNode) => boolean, out: FakeDomNode[] = []): FakeDomNode[] {
  if (match(root)) out.push(root);
  for (const child of root.childNodes) findDomNodes(child, match, out);
  return out;
}

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "MRMS", product: "MESH_Max_1440min_00.50", file: "20240529-120000.grib2" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-06-01T00:00:00Z",
  package_version: "0.1.0",
};

const storm: Storm = {
  storm_date: "2024-05-28",
  report_count: 5,
  max_size_in: 1.5,
  report_source: "wcm",
  max_mesh_mm: 40,
  scored_reports: 5,
  excluded_reports: 0,
  table: [],
  parcel_total: 120,
  files: {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: "storms/2024-05-28/zip-counts.json",
    warnings: null,
    power: null,
    internet: null,
  },
};

const zipCounts: ZipCounts = {
  receipt,
  classes: [{ threshold_mm: 19.05, threshold_in: 0.75, label: "0.75 in", parcel_count: 120 }],
  zips: [
    { zip: "77002", threshold_mm: 19.05, parcel_count: 80 },
    { zip: "77008", threshold_mm: 19.05, parcel_count: 40 },
  ],
};

describe("ParcelsPane form input name (US-01.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
      new Response(JSON.stringify(zipCounts), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    setFetch(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("gives the ZIP filter search input a non-empty name attribute, omits heading subtitles, and keeps ledger headings <=5 words (US-02.1, US-02.5)", async () => {
    const host = makeFakeElement("div");
    const index = {
      confidence: receipt.confidence,
      run_time: receipt.run_time,
      package_version: receipt.package_version,
      radius_km_default: 5,
      storms: [storm],
    };
    await act(() => render(h(ParcelsPane, { storm, index }), host as unknown as HTMLElement));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));

    const inputs = findDomNodes(host, (n) => n.tagName === "INPUT");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!["type"]).toBe("search");
    expect(inputs[0]!["name"]).toBe("zip-filter");

    // Zero muted .pane-note subtitle directly beneath "Parcels by size class" heading
    const notes = findDomNodes(host, (n) => n["class"] === "pane-note");
    expect(notes).toHaveLength(0);

    // Click ZIP button to open cross-storm ledger and confirm heading <= 5 words
    const zipBtn = findDomNodes(host, (n) => n.tagName === "BUTTON" && String(n["class"] ?? "").includes("zip-pick"))[0]!;
    await act(() => {
      (zipBtn["on_click"] as (e: { type: string }) => void)({ type: "click" });
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));

    const ledgerH2 = findDomNodes(host, (n) => n.tagName === "H2").at(-1)!;
    const textOf = (n: FakeDomNode): string => (n.nodeType === 3 ? String(n.data ?? "") : n.childNodes.map(textOf).join(""));
    const words = textOf(ledgerH2).trim().split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(5);

    // Empty state when zip_counts is null includes an actionable recovery link
    const emptyHost = makeFakeElement("div");
    const missingZipStorm: Storm = { ...storm, files: { ...storm.files, zip_counts: null } };
    await act(() => render(h(ParcelsPane, { storm: missingZipStorm }), emptyHost as unknown as HTMLElement));
    const emptyLink = findDomNodes(emptyHost, (n) => n.tagName === "A")[0];
    expect(emptyLink).toBeDefined();
    expect(emptyLink!["href"]).toBe("/try/run");
  });
});
