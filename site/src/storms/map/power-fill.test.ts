import type { FeatureCollection, MultiPolygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternetFile, PowerFile } from "../../data/types";
import { makeHandle } from "./create-map";
import { countyTags, labelPoint, powerLayers } from "./layers";

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

function internetFile(ratio: Record<string, (number | null)[]> = {}): InternetFile {
  return {
    receipt: { ...receipt, sources: [{ source: "ioda", product: "ping-slash24", file: "internet-2024-05-28.parquet" }] },
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    signal: "ping-slash24",
    baseline_days: 7,
    counties: METRO.map(([fips, name]) => ({ fips, name, baseline: 100, ratio: ratio[fips] ?? Array<number | null>(192).fill(1) })),
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
      expect(text).toContain(`--net-${n}`);
      expect(text).toContain(`light--net-${n}`);
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

  it("draws the internet drop bins at the step with the drop as the label", () => {
    const { handle, layout, sources } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("internet", internetFile({ "48201": at(60, 0.8, 1), "48157": at(60, null, 1) }), 60);

    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("visible");
    const features = (sources["power"]!.data as FeatureCollection).features;
    expect(features.map((f) => (f.properties as { bin: string }).bin).slice(0, 3)).toEqual(["--net-5", "gap", "none"]);
    expect(live().map((e) => e.element.textContent).slice(0, 3)).toEqual(["Harris 20.0%", "Fort Bend no data", "Montgomery 0%"]);
  });

  it("hides the layers when the file kind does not match the fill", () => {
    const { handle, layout } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("internet", internetFile(), 10);
    handle.setFill("internet", powerFile(), 10);
    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("none");
    expect(live()).toEqual([]);
    handle.setFill("power", internetFile(), 10);
    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("none");
    expect(live()).toEqual([]);
  });

  it("swaps the power fill for the internet fill without a second layer", () => {
    const { handle, layout, sources } = stubMap();
    handle.setCounties(OUTLINES);
    handle.setFill("power", powerFile({ "48201": at(60, 251_830) }), 60);
    handle.setFill("internet", internetFile({ "48201": at(60, 0.9, 1) }), 60);
    for (const id of POWER_IDS) expect(layout[id]!["visibility"]).toBe("visible");
    expect((sources["power"]!.data as FeatureCollection).features[0]!.properties).toMatchObject({ bin: "--net-4", drop: 0.1 });
    expect(live()).toHaveLength(8);
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
    expect(countyTags([], () => "").length).toBe(0);
  });
});
