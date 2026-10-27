import type { FeatureCollection, MultiPolygon } from "geojson";
import type { ComponentChild, VNode } from "preact";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerFile } from "../data/types";
import { makeHandle } from "../storms/map/create-map";
import { countyTags, labelPoint, powerLayers } from "../storms/map/layers";
import { ODIN_LABEL } from "./power";
import { PowerFillControl, PowerLegend } from "./power-fill";

const stub = vi.hoisted(() => {
  type Entry = { element: { className: string; textContent: string }; lngLat: number[] | null; removed: boolean };
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

const THEME = { now: "light" as "light" | "dark" };
const KNOWN = {
  light: { "--ink-muted": "#5f6b7a" },
  dark: { "--ink-muted": "#a3adba" },
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

const BASE_IDS = ["paper", "swath-outline", "county-line", "report-points", "point-check", "warnings-sv", "warnings-to", "warnings-ff"];
const POWER_IDS = ["power-fill", "power-gap", "power-outline"];

/** A map whose style is still loading; `ids` are the layers it knows. */
function stubMap(ids: string[] = [...BASE_IDS, ...POWER_IDS]) {
  const layout: Record<string, Record<string, unknown>> = {};
  const paint: Record<string, Record<string, unknown>> = {};
  const images: { id: string; image: { width: number; height: number; data: Uint8ClampedArray } }[] = [];
  const removed: string[] = [];
  const sources = Object.fromEntries(
    ["swath", "county", "reports", "point", "warnings", "power"].map((id) => [
      id,
      { data: undefined as unknown, setData(next: unknown) { this.data = next; } },
    ]),
  );
  const have = new Set<string>();
  const need = (id: string) => {
    if (!id.startsWith("swath-fill-") && !ids.includes(id)) throw new Error(`no layer ${id}`);
  };
  const map = {
    isStyleLoaded: () => false,
    getZoom: () => 10,
    on() {},
    getSource: (id: string) => sources[id],
    setLayoutProperty(id: string, prop: string, value: unknown) {
      need(id);
      (layout[id] ??= {})[prop] = value;
    },
    setPaintProperty(id: string, prop: string, value: unknown) {
      need(id);
      (paint[id] ??= {})[prop] = value;
    },
    hasImage: (id: string) => have.has(id),
    addImage(id: string, image: { width: number; height: number; data: Uint8ClampedArray }) {
      have.add(id);
      images.push({ id, image });
    },
    removeImage(id: string) {
      have.delete(id);
      removed.push(id);
    },
    getStyle: () => ({ layers: [] }),
    removeLayer() {},
    addLayer() {},
  };
  return { handle: makeHandle(map as unknown as MapLibreMap, false), layout, paint, images, removed, sources };
}

const receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "eaglei", product: "customers-out", file: "power-2024-05-28.parquet" }],
  confidence: "radar-estimated hail size",
  run_time: "2026-10-26T23:02:33Z",
  package_version: "0.1.0",
};

const METRO = [
  ["48201", "Harris", 1_827_686],
  ["48157", "Fort Bend", 694_780],
  ["48339", "Montgomery", 230_040],
  ["48039", "Brazoria", 144_164],
  ["48167", "Galveston", 144_421],
  ["48473", "Waller", 18_532],
  ["48291", "Liberty", 44_189],
  ["48071", "Chambers", 26_381],
] as const;

function powerFile(out: Record<string, (number | null)[]> = {}, source: "eaglei" | "odin" = "eaglei"): PowerFile {
  return {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    source,
    utilities: source === "odin" ? ["CenterPoint"] : null,
    counties: METRO.map(([fips, name, customers]) => ({
      fips,
      name,
      customers,
      out: out[fips] ?? Array<number | null>(192).fill(0),
    })),
  };
}

const at = (step: number, value: number | null, rest: number | null = 0) =>
  Array.from({ length: 192 }, (_, i) => (i === step ? value : rest));

const OUTLINES: FeatureCollection<MultiPolygon> = {
  type: "FeatureCollection",
  features: METRO.map(([fips, name], i) => ({
    type: "Feature" as const,
    properties: { fips, name },
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [[[[-96 + i, 29], [-95 + i, 29], [-95 + i, 31], [-96 + i, 31], [-96 + i, 29]]]],
    },
  })),
};

const live = () => stub.list.filter((e) => !e.removed);

describe("the power layers", () => {
  const layers = () => powerLayers() as unknown as { id: string; type: string; layout: Record<string, unknown>; filter?: unknown; paint: Record<string, unknown> }[];

  it("start hidden, so a map without power draws nothing extra", () => {
    expect(layers().map((l) => [l.id, l.layout["visibility"]])).toEqual(POWER_IDS.map((id) => [id, "none"]));
  });

  it("fill the five bins from tokens and leave the zero bin and the gap unfilled", () => {
    const fill = layers()[0]!;
    const text = JSON.stringify([fill.filter, fill.paint["fill-color"]]);
    for (let n = 1; n <= 5; n++) {
      expect(text).toContain(`--out-${n}`);
      expect(text).toContain(`light--out-${n}`);
    }
    expect(text).not.toContain("none");
    expect(text).not.toContain("gap");
  });

  it("draw a gap as the hatch pattern and never as a bin colour", () => {
    const gap = layers()[1]!;
    expect(JSON.stringify(gap.filter)).toContain("gap");
    expect(gap.paint["fill-pattern"]).toBe("power-hatch");
    expect(gap.paint["fill-color"]).toBeUndefined();
  });
});

describe("the county fill on the map handle", () => {
  it("draws the bins at the step and labels each county", () => {
    const { handle, layout, sources, images } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("power", powerFile({ "48201": at(60, 251_830), "48157": at(60, null) }), 60);

    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("visible");
    const features = (sources["power"]!.data as FeatureCollection).features;
    expect(features.map((f) => (f.properties as { bin: string }).bin)).toEqual([
      "--out-3",
      "gap",
      "none",
      "none",
      "none",
      "none",
      "none",
      "none",
    ]);
    expect(images.map((i) => i.id)).toEqual(["power-hatch"]);
    expect(live().map((e) => e.element.textContent)).toEqual([
      "Harris 13.8%",
      "Fort Bend no data",
      "Montgomery 0%",
      "Brazoria 0%",
      "Galveston 0%",
      "Waller 0%",
      "Liberty 0%",
      "Chambers 0%",
    ]);
    expect(live().every((e) => e.element.className === "county-tag")).toBe(true);
  });

  it("redraws at a new step and replaces the labels", () => {
    const { handle, sources } = stubMap();
    const file = powerFile({ "48201": at(60, 251_830, null) });
    handle.setCounties(OUTLINES);
    handle.setFill("power", file, 60);
    handle.setFill("power", file, 61);
    const first = (sources["power"]!.data as FeatureCollection).features[0]!.properties as { bin: string };
    expect(first.bin).toBe("gap");
    expect(live()).toHaveLength(8);
  });

  it("hides the layers and the labels with the fill off", () => {
    const { handle, layout } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("power", powerFile(), 10);
    handle.setFill("none", powerFile(), 10);
    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("none");
    expect(live()).toEqual([]);
  });

  it("hides the layers when the file failed, whatever the fill choice", () => {
    const { handle, layout } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("power", powerFile(), 10);
    handle.setFill("power", null, 10);
    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("none");
    expect(live()).toEqual([]);
  });

  it("draws once the outlines arrive after the file", () => {
    const { handle, sources } = stubMap();
    handle.setFill("power", powerFile(), 10);
    expect((sources["power"]!.data as FeatureCollection | undefined)?.features ?? []).toHaveLength(0);
    handle.setCounties(OUTLINES);
    expect((sources["power"]!.data as FeatureCollection).features).toHaveLength(8);
  });

  it("repaints on a theme switch and rebuilds the hatch in the new token colour", () => {
    const { handle, paint, images, removed } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("power", powerFile(), 10);
    THEME.now = "dark";
    handle.setTheme("dark");
    expect(JSON.stringify(paint["power-fill"]!["fill-color"])).toContain("dark--out-5");
    expect(removed).toEqual(["power-hatch"]);
    expect(images).toHaveLength(2);
    const [r, g, b] = [0xa3, 0xad, 0xba];
    const line = images[1]!.image.data.slice(0, 4);
    expect([...line]).toEqual([r, g, b, 255]);
  });

  it("touches no power layer while the fill stays off", () => {
    const { handle, layout } = stubMap(BASE_IDS);
    handle.setCounties(OUTLINES);
    handle.setFill("none", null, 48);
    handle.setTheme("dark");
    handle.setLayerVisible("warnings", false);
    expect(Object.keys(layout).filter((id) => id.startsWith("power"))).toEqual([]);
  });
});

describe("the county labels", () => {
  it("sit at the middle of the largest ring", () => {
    const [harris] = OUTLINES.features;
    expect(labelPoint(harris!.geometry)).toEqual([-95.5, 30]);
    expect(countyTags([]).length).toBe(0);
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

const withClass = (name: string) => (v: Node) => typeof v.props["class"] === "string" && v.props["class"].split(" ").includes(name);

describe("the fill control", () => {
  it("offers None and Power and reports a pick", () => {
    const picks: string[] = [];
    const tree = PowerFillControl({ fill: "none", available: true, note: null, onFill: (fill) => void picks.push(fill) });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios.map((r) => r.props["type"])).toEqual(["radio", "radio"]);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false]);
    expect(textOf(tree)).toContain("None");
    expect(textOf(tree)).toContain("Power");
    (radios[1]!.props["onChange"] as () => void)();
    expect(picks).toEqual(["power"]);
  });

  it("turns Power off and shows one line when the file is unavailable", () => {
    const tree = PowerFillControl({ fill: "power", available: false, note: "Power off. power.json: HTTP 404", onFill: () => {} });
    const radios = findAll(tree, (v) => v.type === "input");
    expect(radios[1]!.props["disabled"]).toBe(true);
    expect(radios.map((r) => r.props["checked"])).toEqual([true, false]);
    expect(textOf(tree)).toContain("Power off. power.json: HTTP 404");
  });
});

describe("the power legend", () => {
  it("draws nothing with the fill off", () => {
    expect(PowerLegend({ fill: "none", source: "eaglei" })).toBeNull();
  });

  it("lists the five bins with text, a plain None swatch, and a hatched Missing swatch", () => {
    const tree = PowerLegend({ fill: "power", source: "eaglei" });
    const text = textOf(tree);
    for (const label of ["0%", "0 to 1%", "1 to 5%", "5 to 15%", "15 to 30%", "30% or more", "Missing"]) {
      expect(text).toContain(label);
    }
    const swatches = findAll(tree, withClass("power-swatch"));
    const gap = findAll(tree, withClass("power-swatch-gap"));
    expect(swatches.length).toBeGreaterThanOrEqual(7);
    expect(gap).toHaveLength(1);
    const colours = swatches.map((s) => (s.props["style"] as { background?: string } | undefined)?.background);
    expect(colours.slice(1, 6)).toEqual(["var(--out-1)", "var(--out-2)", "var(--out-3)", "var(--out-4)", "var(--out-5)"]);
    expect(gap[0]!.props["style"]).toBeUndefined();
  });

  it("shows the CenterPoint label for an ODIN file and none for EAGLE-I", () => {
    const odin = textOf(PowerLegend({ fill: "power", source: "odin" }));
    expect(odin).toContain(ODIN_LABEL);
    expect(odin).toContain("Lower bound");
    expect(textOf(PowerLegend({ fill: "power", source: "eaglei" }))).not.toContain(ODIN_LABEL);
  });
});
