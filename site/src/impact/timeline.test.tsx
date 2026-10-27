import type { Feature, MultiPolygon, Point } from "geojson";
import type { ComponentChild, VNode } from "preact";
import { describe, expect, it } from "vitest";
import type { Phenomena, ReportProps, ReportsFile, Receipt, WarningProps, WarningsFile } from "../data/types";
import { Timeline, TimelineTables, reportTicks, stepAt, warningBars } from "./timeline";

type Node = VNode<Record<string, unknown>>;

const DATE = "2024-05-28";
const RECEIPT: Receipt = { storm_date: DATE, sources: [], confidence: "Radar-estimated hail size.", run_time: "2024-06-01T00:00:00Z", package_version: "0.6.0" };

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

function warning(phenomena: Phenomena, begin: string, end: string, eventid: number): Feature<MultiPolygon, WarningProps> {
  return {
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: [] },
    properties: { phenomena, significance: "W", event_label: `${phenomena} ${eventid}`, eventid, polygon_begin: begin, polygon_end: end, product_id: `p${eventid}` },
  };
}

function report(id: number, time: string, location = "Katy", size_in = 1.75): Feature<Point, ReportProps> {
  return { type: "Feature", geometry: { type: "Point", coordinates: [-95.5, 29.8] }, properties: { id, time, location, county: "HARRIS", state: "TX", size_in } };
}

const warnings = (...features: Feature<MultiPolygon, WarningProps>[]): WarningsFile => ({ type: "FeatureCollection", features, receipt: RECEIPT });
const reports = (...features: Feature<Point, ReportProps>[]): ReportsFile => ({ type: "FeatureCollection", features, receipt: RECEIPT });

// 11:00Z is before the window start (12:00Z on the storm date); 22:30Z to 23:15Z is steps 42 to 45.
const BEFORE_START = warning("SV", "2024-05-28T11:00:00Z", "2024-05-28T13:00:00Z", 101);
const INSIDE = warning("TO", "2024-05-28T22:30:00Z", "2024-05-28T23:15:00Z", 102);
const FLOOD = warning("FF", "2024-05-29T00:00:00Z", "2024-05-29T06:00:00Z", 103);

function chart(props: Partial<Parameters<typeof Timeline>[0]> = {}) {
  const calls: number[] = [];
  const tree = Timeline({
    date: DATE,
    step: 48,
    warnings: warnings(BEFORE_START, INSIDE, FLOOD),
    reports: reports(report(1, "1200"), report(2, "1145")),
    onStep: (next) => calls.push(next),
    ...props,
  });
  const svg = findAll(tree, (v) => v.type === "svg")[0]!;
  // The viewBox width holds the 192 steps, so one step is width / 192 user units.
  const unit = Number((svg.props["viewBox"] as string).split(" ")[2]) / 192;
  return { tree, svg, unit, calls };
}

describe("the report ticks", () => {
  it("sit at step 0 for 12:00 UTC and step 95 for 11:45 UTC", () => {
    const { tree, unit } = chart();
    const ticks = findAll(tree, withClass("timeline-tick")).map((v) => Number(v.props["x1"]) / unit);
    expect(ticks).toEqual([0, 95]);
  });

  it("skip a report with a bad time", () => {
    expect(reportTicks(reports(report(1, "1200"), report(2, "2575"), report(3, "noon"))).map((t) => t.step)).toEqual([0]);
  });
});

describe("the warning bars", () => {
  it("clip a warning that starts before the window at step 0", () => {
    const bars = warningBars(warnings(BEFORE_START), DATE);
    expect(bars).toMatchObject([{ phenomena: "SV", eventid: 101, from: 0, to: 4 }]);
  });

  it("place a warning inside the window at its begin and end steps", () => {
    expect(warningBars(warnings(INSIDE), DATE)).toMatchObject([{ phenomena: "TO", from: 42, to: 45 }]);
  });

  it("clip at step 192 and drop a warning that ends before the window", () => {
    const late = warning("SV", "2024-05-30T11:00:00Z", "2024-05-30T15:00:00Z", 104);
    const early = warning("SV", "2024-05-28T08:00:00Z", "2024-05-28T12:00:00Z", 105);
    expect(warningBars(warnings(late, early), DATE)).toMatchObject([{ eventid: 104, from: 188, to: 192 }]);
  });

  it("draw one bar per polygon, with a different line style for each type", () => {
    const { tree, unit } = chart();
    const bars = findAll(tree, withClass("timeline-bar"));
    expect(bars).toHaveLength(3);
    const first = bars.find((v) => v.props["data-phenomena"] === "SV")!;
    expect([Number(first.props["x1"]) / unit, Number(first.props["x2"]) / unit]).toEqual([0, 4]);
    const dash = Object.fromEntries(bars.map((v) => [v.props["data-phenomena"], v.props["stroke-dasharray"]]));
    expect(dash["TO"]).toBeUndefined();
    expect(dash["SV"]).toBeDefined();
    expect(dash["FF"]).toBeDefined();
    expect(dash["SV"]).not.toBe(dash["FF"]);
    const rows = new Set(bars.map((v) => v.props["y1"]));
    expect(rows.size).toBe(3);
  });
});

describe("the cursor", () => {
  it("sits at the slider step", () => {
    for (const step of [0, 48, 191]) {
      const { tree, unit } = chart({ step });
      const [cursor] = findAll(tree, withClass("timeline-cursor"));
      expect(Number(cursor!.props["x1"]) / unit).toBe(step);
    }
  });
});

describe("the strips", () => {
  const rect = { left: 100, width: 960 };

  it("turn a click position into a step from 0 to 191", () => {
    expect(stepAt(100, rect)).toBe(0);
    expect(stepAt(580, rect)).toBe(96);
    expect(stepAt(1060, rect)).toBe(191);
    expect(stepAt(40, rect)).toBe(0);
  });

  it("report the clicked step from either strip", () => {
    const { tree, calls } = chart();
    for (const name of ["warnings", "reports"]) {
      const strip = findAll(tree, (v) => v.props["data-strip"] === name)[0]!;
      (strip.props["onClick"] as (e: unknown) => void)({ clientX: 580, currentTarget: { getBoundingClientRect: () => rect } });
    }
    expect(calls).toEqual([96, 96]);
  });
});

describe("the empty and labelled states", () => {
  it("shows the empty line in the warnings strip when the date has no warning", () => {
    const { tree } = chart({ warnings: warnings() });
    expect(textOf(tree)).toContain("No warnings in the window");
    expect(findAll(tree, withClass("timeline-bar"))).toHaveLength(0);
  });

  it("shows no empty line while the warnings file is absent", () => {
    expect(textOf(chart({ warnings: null }).tree)).not.toContain("No warnings in the window");
  });

  it("names the chart with a title that the svg points at", () => {
    const { tree, svg } = chart();
    const [title] = findAll(tree, (v) => v.type === "title");
    expect(title).toBeDefined();
    expect(textOf(title)).toContain("3 warnings");
    expect(textOf(title)).toContain("2 reports");
    expect(svg.props["role"]).toBe("img");
    expect(svg.props["aria-labelledby"]).toBe(title!.props["id"]);
  });

  it("labels the rows with the type codes and the reports row", () => {
    const text = textOf(chart().tree);
    for (const word of ["SV", "TO", "FF", "Reports"]) expect(text).toContain(word);
  });
});

describe("the Data pane tables", () => {
  const props = { date: DATE, warnings: warnings(BEFORE_START, INSIDE, FLOOD), reports: reports(report(1, "1200", "Katy"), report(2, "1145", "Pearland", 2)) };

  const cells = (tree: ComponentChild) =>
    findAll(tree, (v) => v.type === "tr")
      .map((tr) => findAll(tr, (v) => v.type === "td").map((td) => textOf(td).trim()))
      .filter((row) => row.length > 0);

  it("lists each bar with the same steps as the chart", () => {
    const { tree, unit } = chart();
    const bars = findAll(tree, withClass("timeline-bar")).map((v) => [Number(v.props["x1"]) / unit, Number(v.props["x2"]) / unit]);
    const rows = cells(TimelineTables(props)).filter((row) => ["SV", "TO", "FF"].includes(row[0]!));
    expect(rows.map((row) => [Number(row[2]), Number(row[3])])).toEqual(bars);
    expect(rows[0]).toEqual(["SV", "101", "0", "4", "2024-05-28 11:00", "2024-05-28 13:00"]);
  });

  it("lists each tick with the same step as the chart", () => {
    const { tree, unit } = chart();
    const ticks = findAll(tree, withClass("timeline-tick")).map((v) => Number(v.props["x1"]) / unit);
    const rows = cells(TimelineTables(props)).filter((row) => row.includes("Katy") || row.includes("Pearland"));
    expect(rows.map((row) => Number(row[0]))).toEqual(ticks);
    expect(rows[1]).toEqual(["95", "11:45", "Pearland", "2.00 in"]);
  });

  it("says so when there is no warning", () => {
    expect(textOf(TimelineTables({ ...props, warnings: warnings() }))).toContain("No warnings in the window");
  });
});
