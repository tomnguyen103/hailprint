import type { MultiPolygon } from "geojson";
import type { ComponentChild, VNode } from "preact";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataError, type ReportsFile, type WarningsFile } from "../../data/types";
import { RULER } from "../../ruler";
import type { Load } from "../../state/load";
import { LayersControl } from "../map-pane";
import { sliderCell } from "../stamp";
import { makeHandle } from "./create-map";
import { activeWarnings, warningLayers, warningTags, warningsNote } from "./layers";

// map-pane.tsx reads window.matchMedia when it loads; this node environment has no window.
vi.hoisted(() => {
  const media = { matches: false, addEventListener() {} };
  (globalThis as { window?: unknown }).window = { matchMedia: () => media };
});

const stub = vi.hoisted(() => {
  type Entry = { element: { hidden: boolean; textContent: string }; lngLat: number[] | null; removed: boolean };
  const list: Entry[] = [];
  class Marker {
    private entry: Entry;
    constructor(options: { element: Entry["element"] }) {
      this.entry = { element: options.element, lngLat: null, removed: false };
      list.push(this.entry);
    }
    setLngLat(lngLat: number[]) {
      this.entry.lngLat = lngLat;
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.entry.removed = true;
      return this;
    }
    getElement() {
      return this.entry.element;
    }
  }
  return { Marker, list };
});

vi.mock("maplibre-gl", () => ({
  Marker: stub.Marker,
  Map: class {},
  NavigationControl: class {},
  addProtocol() {},
  setWorkerUrl() {},
}));

// The document answers each token with a theme-specific literal.
const THEME = { now: "light" as "light" | "dark" };
const KNOWN = {
  light: { "--warn-sv": "#8a5300", "--warn-to": "#a3175f", "--warn-ff": "#0a6b73" },
  dark: { "--warn-sv": "#f2b84b", "--warn-to": "#ff7eb6", "--warn-ff": "#4dd0be" },
};

beforeEach(() => {
  THEME.now = "light";
  stub.list.length = 0;
  vi.stubGlobal("document", {
    documentElement: {},
    createElement: () => ({ className: "", textContent: "", title: "", hidden: false }),
  });
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (name: string) => (KNOWN[THEME.now] as Record<string, string>)[name] ?? `${THEME.now}${name}`,
  }));
});
afterEach(() => vi.unstubAllGlobals());

const LAYER_IDS = [
  "paper",
  ...RULER.map((m) => `swath-fill-${m.threshold_mm}`),
  "swath-outline",
  "county-line",
  "report-points",
  "point-check",
  "warnings-sv",
  "warnings-to",
  "warnings-ff",
];

/** A map whose style is still loading: isStyleLoaded is false and every set call is accepted. */
function stubMap(zoom = 8) {
  const layout: Record<string, Record<string, unknown>> = {};
  const paint: Record<string, Record<string, unknown>> = {};
  const sources = Object.fromEntries(
    ["swath", "county", "reports", "point", "warnings"].map((id) => [
      id,
      {
        data: undefined as unknown,
        setData(next: unknown) {
          this.data = next;
        },
      },
    ]),
  );
  const listeners: Record<string, (() => void)[]> = {};
  let zoomNow = zoom;
  const need = (id: string) => {
    if (!LAYER_IDS.includes(id)) throw new Error(`no layer ${id}`);
  };
  const map = {
    isStyleLoaded: () => false,
    getZoom: () => zoomNow,
    on(event: string, listener: () => void) {
      (listeners[event] ??= []).push(listener);
    },
    getSource: (id: string) => sources[id],
    setLayoutProperty(id: string, prop: string, value: unknown) {
      need(id);
      (layout[id] ??= {})[prop] = value;
    },
    setPaintProperty(id: string, prop: string, value: unknown) {
      need(id);
      (paint[id] ??= {})[prop] = value;
    },
    getStyle: () => ({ layers: [] }),
    removeLayer() {},
    addLayer() {},
  };
  return {
    handle: makeHandle(map as unknown as MapLibreMap, false),
    layout,
    paint,
    sources,
    zoomTo(next: number) {
      zoomNow = next;
      for (const listener of listeners["zoom"] ?? []) listener();
    },
  };
}

const receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "iem", product: "sbw", file: "warnings.parquet" }],
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
};

const rect = (x: number, y: number): MultiPolygon["coordinates"] => [[[[x, y], [x + 4, y], [x + 4, y + 2], [x, y + 2], [x, y]]]];

function warning(eventid: number, phenomena: "SV" | "TO" | "FF", begin: string, end: string, x: number) {
  return {
    type: "Feature" as const,
    properties: {
      phenomena,
      significance: "W" as const,
      event_label: `${phenomena} warning`,
      eventid,
      polygon_begin: begin,
      polygon_end: end,
      product_id: `product-${eventid}`,
    },
    geometry: { type: "MultiPolygon" as const, coordinates: rect(x, 29) },
  };
}

// Storm date 2024-05-28: step 48 is 00:00Z on 29 May, a step is 15 minutes.
const WARNINGS: WarningsFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    warning(1, "SV", "2024-05-29T00:00:00Z", "2024-05-29T01:00:00Z", -96), // steps 48 to 51
    warning(2, "TO", "2024-05-29T00:30:00Z", "2024-05-29T01:30:00Z", -90), // steps 50 to 53
    warning(3, "FF", "2024-05-29T02:00:00Z", "2024-05-29T03:00:00Z", -84), // steps 56 to 59
  ],
};

const eventids = (features: { properties: { eventid: number } }[]) => features.map((f) => f.properties.eventid);
const drawn = (source: { data: unknown }) => eventids((source.data as { features: { properties: { eventid: number } }[] }).features);

describe("which warnings are active at a step", () => {
  it.each([
    [47, []],
    [48, [1]],
    [49, [1]],
    [50, [1, 2]],
    [51, [1, 2]],
    [52, [2]],
    [53, [2]],
    [54, []],
    [56, [3]],
    [59, [3]],
    [60, []],
  ])("step %i draws %j", (step, expected) => {
    expect(eventids(activeWarnings(WARNINGS, "2024-05-28", step))).toEqual(expected);
    const { handle, sources } = stubMap();
    handle.setWarnings(WARNINGS, "2024-05-28", step);
    expect(drawn(sources["warnings"]!)).toEqual(expected);
  });

  it("draws nothing without a file", () => {
    expect(activeWarnings(null, "2024-05-28", 48)).toEqual([]);
    const { handle, sources } = stubMap();
    handle.setWarnings(null, "2024-05-28", 48);
    expect(drawn(sources["warnings"]!)).toEqual([]);
  });
});

describe("report opacity by step", () => {
  const reports = {
    type: "FeatureCollection",
    receipt,
    features: ["2345", "0000", "0030", "late"].map((time, id) => ({
      type: "Feature",
      properties: { id, time, location: "x", county: "Harris", state: "TX", size_in: 1 },
      geometry: { type: "Point", coordinates: [-95, 29] },
    })),
  } as unknown as ReportsFile;
  // The report times map to steps 47, 48, 50, and none.
  const alphas = (source: { data: unknown }) =>
    (source.data as { features: { properties: { alpha: number } }[] }).features.map((f) => f.properties.alpha);

  it.each([
    [48, [1, 1, 0.3, 1]],
    [50, [1, 1, 1, 1]],
    [47, [1, 0.3, 0.3, 1]],
    [0, [0.3, 0.3, 0.3, 1]],
  ])("a cutoff at step %i gives alphas %j", (cutoff, expected) => {
    const { handle, sources } = stubMap();
    handle.setData(null, reports, null);
    handle.setReportCutoff(cutoff);
    expect(alphas(sources["reports"]!)).toEqual(expected);
  });

  it("gives the same result when the cutoff arrives before the reports", () => {
    const { handle, sources } = stubMap();
    handle.setReportCutoff(48);
    handle.setData(null, reports, null);
    expect(alphas(sources["reports"]!)).toEqual([1, 1, 0.3, 1]);
  });

  it("draws every report in full until a cutoff arrives", () => {
    const { handle, sources } = stubMap();
    handle.setData(null, reports, null);
    expect(alphas(sources["reports"]!)).toEqual([1, 1, 1, 1]);
  });
});

describe("the warning line style", () => {
  it("tells SV, TO, and FF apart without colour", () => {
    const layers = warningLayers() as unknown as { id: string; paint: Record<string, unknown> }[];
    expect(layers.map((l) => l.id)).toEqual(["warnings-sv", "warnings-to", "warnings-ff"]);
    expect(layers.map((l) => l.paint["line-width"])).toEqual([2, 2, 2]);
    expect(layers.map((l) => l.paint["line-dasharray"])).toEqual([[4, 2], undefined, [1, 2]]);
  });

  it("puts one text label at the centre of each active polygon", () => {
    const tags = warningTags(activeWarnings(WARNINGS, "2024-05-28", 50));
    expect(tags.map((t) => t.text)).toEqual(["SV", "TO"]);
    expect(tags[0]!.lngLat[0]).toBeCloseTo(-94);
    expect(tags[0]!.lngLat[1]).toBeCloseTo(30);
  });

  it("skips a warning with no polygon", () => {
    const empty = { ...WARNINGS.features[0]!, geometry: { type: "MultiPolygon" as const, coordinates: [] } };
    expect(warningTags([empty])).toEqual([]);
  });
});

describe("the warning labels", () => {
  const live = () => stub.list.filter((e) => !e.removed);

  it("shows at zoom 9 and up and hides below it", () => {
    const { handle, zoomTo } = stubMap(8);
    handle.setWarnings(WARNINGS, "2024-05-28", 50);
    expect(live().map((e) => e.element.textContent)).toEqual(["SV", "TO"]);
    expect(live().map((e) => e.element.hidden)).toEqual([true, true]);
    zoomTo(8.99);
    expect(live().map((e) => e.element.hidden)).toEqual([true, true]);
    zoomTo(9);
    expect(live().map((e) => e.element.hidden)).toEqual([false, false]);
  });

  it("replaces the labels at each step and clears them when no warning is active", () => {
    const { handle } = stubMap(10);
    handle.setWarnings(WARNINGS, "2024-05-28", 50);
    handle.setWarnings(WARNINGS, "2024-05-28", 56);
    expect(live().map((e) => e.element.textContent)).toEqual(["FF"]);
    handle.setWarnings(WARNINGS, "2024-05-28", 60);
    expect(live()).toEqual([]);
  });

  it("hides with the warnings layer", () => {
    const { handle } = stubMap(10);
    handle.setWarnings(WARNINGS, "2024-05-28", 50);
    handle.setLayerVisible("warnings", false);
    expect(live().map((e) => e.element.hidden)).toEqual([true, true]);
    handle.setLayerVisible("warnings", true);
    expect(live().map((e) => e.element.hidden)).toEqual([false, false]);
  });
});

describe("a toggle and a theme switch while the style loads", () => {
  it("end in the final control state without a readiness guard", () => {
    const { handle, layout, paint } = stubMap();
    handle.setLayerVisible("warnings", false);
    THEME.now = "dark";
    handle.setTheme("dark");
    handle.setLayerVisible("swath", false);
    handle.setLayerVisible("warnings", true);
    handle.setLayerVisible("reports", false);

    for (const id of ["warnings-sv", "warnings-to", "warnings-ff"]) expect(layout[id]!["visibility"]).toBe("visible");
    for (const id of ["swath-outline", "report-points", ...RULER.map((m) => `swath-fill-${m.threshold_mm}`)]) {
      expect(layout[id]!["visibility"]).toBe("none");
    }
    expect(paint["warnings-sv"]!["line-color"]).toBe("#f2b84b");
    expect(paint["warnings-to"]!["line-color"]).toBe("#ff7eb6");
    expect(paint["warnings-ff"]!["line-color"]).toBe("#4dd0be");
    expect(paint["report-points"]!["circle-color"]).toBe("dark--report");
  });

  it("keeps a hidden size class hidden when the swath comes back", () => {
    const { handle, layout } = stubMap();
    handle.setClassVisible(19.05, false);
    handle.setLayerVisible("swath", false);
    handle.setLayerVisible("swath", true);
    expect(layout["swath-fill-19.05"]!["visibility"]).toBe("none");
    expect(layout["swath-fill-25.4"]!["visibility"]).toBe("visible");
    expect(layout["swath-outline"]!["visibility"]).toBe("visible");
  });
});

type Node = VNode<Record<string, unknown>>;

function findAll(node: ComponentChild, match: (vnode: Node) => boolean, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ComponentChild, match, out);
    return out;
  }
  if (node === null || typeof node !== "object") return out;
  const vnode = node as Node;
  if (match(vnode)) out.push(vnode);
  return findAll(vnode.props["children"] as ComponentChild, match, out);
}

function textOf(node: ComponentChild): string {
  if (Array.isArray(node)) return node.map((child) => textOf(child as ComponentChild)).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  return textOf((node as Node).props["children"] as ComponentChild);
}

describe("the layers control", () => {
  const all = { swath: true, reports: true, warnings: true };
  const boxes = (tree: ComponentChild) => findAll(tree, (v) => v.type === "input");

  it("lists the three layers and reports a toggle", () => {
    const toggles: [string, boolean][] = [];
    const tree = LayersControl({
      layers: all,
      warnings: { available: true, note: null },
      onToggle: (name, on) => void toggles.push([name, on]),
    });
    expect(textOf(tree)).toContain("Hail swath");
    expect(textOf(tree)).toContain("SPC reports");
    expect(textOf(tree)).toContain("NWS warnings");
    const inputs = boxes(tree);
    expect(inputs.map((i) => i.props["checked"])).toEqual([true, true, true]);
    (inputs[1]!.props["onChange"] as (e: unknown) => void)({ currentTarget: { checked: false } });
    expect(toggles).toEqual([["reports", false]]);
  });

  it("names SV, TO, and FF in text beside a line sample of each style", () => {
    const tree = LayersControl({ layers: all, warnings: { available: true, note: null }, onToggle: () => {} });
    const text = textOf(tree);
    for (const word of ["SV", "TO", "FF"]) expect(text).toContain(word);
    const samples = findAll(tree, (v) => v.type === "line").map((v) => v.props["stroke-dasharray"]);
    expect(samples).toEqual(["8 4", undefined, "2 4"]);
  });

  it("turns the warnings box off and shows one line when the file is unavailable", () => {
    const tree = LayersControl({
      layers: all,
      warnings: { available: false, note: "Warnings off. warnings.geojson: HTTP 404" },
      onToggle: () => {},
    });
    const warnings = boxes(tree)[2]!;
    expect(warnings.props["checked"]).toBe(false);
    expect(warnings.props["disabled"]).toBe(true);
    expect(textOf(tree)).toContain("Warnings off. warnings.geojson: HTTP 404");
    expect(findAll(tree, (v) => v.type === "line")).toEqual([]);
  });
});

describe("the warnings line in the control", () => {
  const file = "storms/2024-05-28/warnings.geojson";

  it("says the storm date has no warnings file when the index names none", () => {
    expect(warningsNote(null, { status: "ready", data: null })).toBe("No warnings file for this storm date.");
  });

  it("names the failed file and reason", () => {
    const failed: Load<WarningsFile | null> = { status: "error", error: new DataError("warnings.geojson", "HTTP 404") };
    expect(warningsNote(file, failed)).toBe("Warnings off. warnings.geojson: HTTP 404");
  });

  it("stays quiet while the file loads and once it is ready", () => {
    expect(warningsNote(file, { status: "loading" })).toBeNull();
    expect(warningsNote(file, { status: "ready", data: WARNINGS })).toBeNull();
  });
});

describe("the storm stamp marks the slider hour", () => {
  it.each([
    [0, 0],
    [3, 0],
    [4, 1],
    [48, 12],
    [95, 23],
    [96, null],
    [191, null],
  ])("step %i marks cell %s", (step, cell) => {
    expect(sliderCell(step)).toBe(cell);
  });
});
