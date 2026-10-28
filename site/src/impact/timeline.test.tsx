import type { Feature, MultiPolygon, Point } from "geojson";
import type { ComponentChild, VNode } from "preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InternetFile, Phenomena, PowerFile, ReportProps, ReportsFile, Receipt, WarningProps, WarningsFile } from "../data/types";
import { FORBIDDEN_WORD } from "../method/prose";
import { ReceiptChip } from "../shell/receipt-chip";
import { FileItem } from "../storms/data-pane";
import { CountySection, InternetSection, countyRows } from "../storms/map/inspector";
import { createPlayer } from "../time/slider";
import { HARRIS_FIPS, ODIN_LABEL, percentText, shareOut } from "./power";
import {
  InternetTable,
  PowerTable,
  Timeline,
  TimelineTables,
  barKey,
  internetSeries,
  powerSeries,
  reportTicks,
  runsOf,
  stepAt,
  warningBars,
} from "./timeline";

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
    note: null,
    reports: reports(report(1, "1200"), report(2, "1145")),
    power: null,
    internet: null,
    internetNote: null,
    fips: HARRIS_FIPS,
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

  it("key two warnings of different types apart when the eventid and begin match", () => {
    const begin = "2024-05-28T22:30:00Z";
    const sv = warning("SV", begin, "2024-05-28T23:15:00Z", 7);
    const to = warning("TO", begin, "2024-05-28T23:15:00Z", 7);
    const [first, second] = warningBars(warnings(sv, to), DATE);
    expect(barKey(first!)).not.toBe(barKey(second!));
    const keys = findAll(chart({ warnings: warnings(sv, to) }).tree, withClass("timeline-bar")).map((v) => v.key);
    expect(new Set(keys).size).toBe(2);
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

  it("shows the note in the warnings strip when the warnings are null", () => {
    const note = "No warnings file for this storm date.";
    const { tree } = chart({ warnings: null, note });
    expect(findAll(tree, withClass("timeline-empty")).map((v) => textOf(v))).toEqual([note]);
  });

  it("shows no note line while the warnings load or when the file is present", () => {
    expect(findAll(chart({ warnings: null, note: null }).tree, withClass("timeline-empty"))).toHaveLength(0);
    expect(textOf(chart({ note: "Warnings off." }).tree)).not.toContain("Warnings off.");
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

  const titleOf = (props: Parameters<typeof chart>[0]) => textOf(findAll(chart(props).tree, (v) => v.type === "title")[0]);

  it("reads a null warnings file as unavailable and an empty file as zero", () => {
    const absent = titleOf({ warnings: null });
    expect(absent).toContain("warnings unavailable");
    expect(absent).not.toContain("0 warnings");
    expect(absent).toContain("2 reports");
    expect(titleOf({ warnings: warnings() })).toContain("0 warnings");
  });

  it("reads a null reports file as unavailable and an empty file as zero", () => {
    const absent = titleOf({ reports: null });
    expect(absent).toContain("reports unavailable");
    expect(absent).not.toContain("0 reports");
    expect(titleOf({ reports: reports() })).toContain("0 reports");
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

// A 192-step series: `over` sets single steps, `rest` fills the others.
function series(over: Record<number, number | null> = {}, rest: number | null = 0): (number | null)[] {
  return Array.from({ length: 192 }, (_, i) => (i in over ? (over[i] ?? null) : rest));
}

// Harris has 2000 customers and Fort Bend has 400, so 250 out in Harris is 12.5% and 100 out in Fort Bend is 25%.
function power(source: "eaglei" | "odin" = "eaglei", harris = series(), fortBend = series()): PowerFile {
  return {
    receipt: RECEIPT,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    source,
    utilities: source === "odin" ? ["CenterPoint"] : null,
    counties: [
      { fips: "48201", name: "Harris", customers: 2000, out: harris },
      { fips: "48157", name: "Fort Bend", customers: 400, out: fortBend },
    ],
  };
}

const FORT_BEND = "48157";
const lines = (tree: ComponentChild) => findAll(tree, withClass("timeline-power-line"));
const gaps = (tree: ComponentChild) => findAll(tree, withClass("timeline-power-gap"));
const pointsOf = (line: Node) =>
  String(line.props["d"])
    .split(/[ML]/)
    .filter((part) => part.trim() !== "")
    .map((part) => part.trim().split(" ").map(Number) as [number, number]);
const rowsOf = (tree: ComponentChild) =>
  findAll(tree, (v) => v.type === "tr")
    .map((tr) => findAll(tr, (v) => v.type === "td").map((td) => textOf(td).trim()))
    .filter((row) => row.length > 0);
const powerStrip = (tree: ComponentChild) => findAll(tree, (v) => v.props["data-strip"] === "power");

describe("the power runs", () => {
  it("split a series into runs of values and runs of gaps", () => {
    expect(runsOf([1, null, null, 2, 3])).toEqual([
      { from: 0, to: 1, gap: false },
      { from: 1, to: 3, gap: true },
      { from: 3, to: 5, gap: false },
    ]);
    expect(runsOf([])).toEqual([]);
    expect(runsOf([null, null])).toEqual([{ from: 0, to: 2, gap: true }]);
  });
});

describe("the power strip", () => {
  it("draws one line through every step and no gap when the county has no null", () => {
    const { tree } = chart({ power: power("eaglei", series({ 20: 250 })) });
    expect(lines(tree)).toHaveLength(1);
    expect(pointsOf(lines(tree)[0]!)).toHaveLength(192);
    expect(gaps(tree)).toHaveLength(0);
  });

  it("breaks the line at a null step and draws the gap as a gap", () => {
    const { tree, unit } = chart({ power: power("eaglei", series({ 12: null })) });
    expect(lines(tree)).toHaveLength(2);
    const steps = lines(tree)
      .flatMap(pointsOf)
      .map(([x]) => x / unit - 0.5);
    expect(steps).toHaveLength(191);
    expect(steps).not.toContain(12);
    const [gap] = gaps(tree);
    expect([Number(gap!.props["x"]) / unit, Number(gap!.props["width"]) / unit]).toEqual([12, 1]);
  });

  it("draws a zero share as a flat line and a county with no data as one gap", () => {
    const zero = chart({ power: power() }).tree;
    expect(gaps(zero)).toHaveLength(0);
    expect(new Set(pointsOf(lines(zero)[0]!).map(([, y]) => y)).size).toBe(1);
    const none = chart({ power: power("eaglei", series({}, null)) });
    expect(lines(none.tree)).toHaveLength(0);
    expect(gaps(none.tree)).toHaveLength(1);
    expect(Number(gaps(none.tree)[0]!.props["width"]) / none.unit).toBe(192);
  });

  it("follows the picked county and names it with the scale", () => {
    const file = power("eaglei", series(), series({ 20: 100 }));
    const harris = chart({ power: file, fips: HARRIS_FIPS });
    const fortBend = chart({ power: file, fips: FORT_BEND });
    expect(textOf(harris.tree)).toContain("Harris County");
    expect(textOf(fortBend.tree)).toContain("Fort Bend County");
    expect(textOf(fortBend.tree)).toContain("Scale 0 to 25.0%");
    const flat = pointsOf(lines(harris.tree)[0]!)[0]![1];
    const top = Math.min(...pointsOf(lines(fortBend.tree)[0]!).map(([, y]) => y));
    expect(top).toBeLessThan(flat);
  });

  it("reports the clicked step from the power strip", () => {
    const { tree, calls } = chart({ power: power() });
    const [strip] = powerStrip(tree);
    (strip!.props["onClick"] as (e: unknown) => void)({
      clientX: 580,
      currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 960 }) },
    });
    expect(calls).toEqual([96]);
  });

  it("draws no power row without a file or for a county the file lacks", () => {
    for (const props of [{ power: null }, { power: power(), fips: "99999" }]) {
      const { tree } = chart(props);
      expect(powerStrip(tree)).toHaveLength(0);
      expect(textOf(tree)).not.toContain("Scale 0 to");
    }
  });

  it("names the strip with a title that gives the peak and the steps without data", () => {
    const { tree } = chart({ power: power("eaglei", series({ 12: null, 20: 250 })) });
    const text = textOf(powerStrip(tree)[0]);
    expect(text).toContain("Harris County");
    expect(text).toContain("peak 12.5% at step 20");
    expect(text).toContain("1 step without data");
    expect(textOf(findAll(tree, (v) => v.type === "title")[0])).toContain("Harris power peak 12.5%");
    const empty = chart({ power: power("eaglei", series({}, null)) }).tree;
    expect(textOf(powerStrip(empty)[0])).toContain("no data");
    expect(textOf(findAll(empty, (v) => v.type === "title")[0])).toContain("Harris power unavailable");
  });

  it("labels an ODIN file on the strip and leaves an EAGLE-I file unlabelled", () => {
    expect(textOf(chart({ power: power("odin") }).tree)).toContain(ODIN_LABEL);
    expect(textOf(chart({ power: power("eaglei") }).tree)).not.toContain(ODIN_LABEL);
  });
});

describe("the power series", () => {
  it("returns the shares, the peak and the count of gap steps", () => {
    const series_ = powerSeries(power("eaglei", series({ 3: null, 20: 250 })), HARRIS_FIPS)!;
    expect(series_.county.name).toBe("Harris");
    expect(series_.shares[20]).toBe(shareOut(250, 2000));
    expect(series_.shares[3]).toBeNull();
    expect(series_).toMatchObject({ peak: 0.125, peakStep: 20, gapSteps: 1, scale: 0.125 });
  });

  it("holds the scale at 1% for a county with no outage and returns null for an unknown county", () => {
    expect(powerSeries(power(), HARRIS_FIPS)).toMatchObject({ peak: 0, scale: 0.01 });
    expect(powerSeries(power("eaglei", series({}, null)), HARRIS_FIPS)).toMatchObject({ peak: null, peakStep: null, gapSteps: 192 });
    expect(powerSeries(power(), "99999")).toBeNull();
    expect(powerSeries(null, HARRIS_FIPS)).toBeNull();
  });
});

describe("the Data pane power table", () => {
  const file = power("eaglei", series({ 12: null, 20: 250, 21: 100 }));
  const table = () => PowerTable({ date: DATE, power: file, fips: HARRIS_FIPS });

  it("lists every step with the customers out and the share, and says no data for a null step", () => {
    const rows = rowsOf(table());
    expect(rows).toHaveLength(192);
    expect(rows[20]).toEqual(["20", "2024-05-28 17:00", "250", "12.5%"]);
    expect(rows[12]).toEqual(["12", "2024-05-28 15:00", "no data", "no data"]);
    expect(rows[0]).toEqual(["0", "2024-05-28 12:00", "0", "0%"]);
  });

  it("shows the same numbers as the strip", () => {
    const { tree, unit } = chart({ power: file });
    const rows = rowsOf(table());
    const onStrip = lines(tree)
      .flatMap(pointsOf)
      .map(([x, y]) => ({ step: x / unit - 0.5, y }));
    expect(onStrip.map((p) => p.step)).toEqual(rows.filter((row) => row[3] !== "no data").map((row) => Number(row[0])));
    const top = onStrip.reduce((a, b) => (b.y < a.y ? b : a));
    expect(rows[top.step]![3]).toBe(percentText(shareOut(250, 2000)));
  });

  it("labels an ODIN file and says so for a county the file lacks", () => {
    expect(textOf(PowerTable({ date: DATE, power: power("odin"), fips: HARRIS_FIPS }))).toContain(ODIN_LABEL);
    expect(textOf(table())).not.toContain(ODIN_LABEL);
    expect(textOf(PowerTable({ date: DATE, power: file, fips: "99999" }))).toContain("No power data for this county");
  });
});

// Reachability over baseline: 1 is the baseline, 0.8 is a drop of 20% below it.
function internet(harris = series({}, 1), fortBend = series({}, 1)): InternetFile {
  return {
    receipt: RECEIPT,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: 15, steps: 192 },
    signal: "ping-slash24",
    baseline_days: 7,
    counties: [
      { fips: "48201", name: "Harris", baseline: 1000, ratio: harris },
      { fips: "48157", name: "Fort Bend", baseline: 400, ratio: fortBend },
    ],
  };
}

const netLines = (tree: ComponentChild) => findAll(tree, withClass("timeline-net-line"));
const netGaps = (tree: ComponentChild) => findAll(tree, withClass("timeline-net-gap"));
const netBase = (tree: ComponentChild) => findAll(tree, withClass("timeline-net-base"));
const netStrip = (tree: ComponentChild) => findAll(tree, (v) => v.props["data-strip"] === "internet");
const BANNED = new RegExp(`\\bdown\\b|${FORBIDDEN_WORD}|caused|because`, "i");

describe("the internet strip", () => {
  it("draws one line through every step and a dotted baseline, and no gap when the county has no null", () => {
    const { tree } = chart({ internet: internet(series({ 20: 0.8 }, 1)) });
    expect(netLines(tree)).toHaveLength(1);
    expect(pointsOf(netLines(tree)[0]!)).toHaveLength(192);
    expect(netGaps(tree)).toHaveLength(0);
    expect(netBase(tree)).toHaveLength(1);
  });

  it("draws a lower ratio lower on the row", () => {
    const [line] = netLines(chart({ internet: internet(series({ 20: 0.8 }, 1)) }).tree);
    const points = pointsOf(line!);
    expect(points[20]![1]).toBeGreaterThan(points[0]![1]);
    expect(points[0]![1]).toBe(points[100]![1]);
  });

  it("breaks the line at a null step and draws the gap as a gap", () => {
    const { tree, unit } = chart({ internet: internet(series({ 12: null, 20: 0.8 }, 1)) });
    expect(netLines(tree)).toHaveLength(2);
    const steps = netLines(tree)
      .flatMap(pointsOf)
      .map(([x]) => x / unit - 0.5);
    expect(steps).toHaveLength(191);
    expect(steps).not.toContain(12);
    const [gap] = netGaps(tree);
    expect([Number(gap!.props["x"]) / unit, Number(gap!.props["width"]) / unit]).toEqual([12, 1]);
  });

  it("names the scale from the lowest ratio to the baseline, with a floor of a 10% span", () => {
    expect(textOf(chart({ internet: internet(series({ 20: 0.8 }, 1)) }).tree)).toContain("Internet reachability, Harris County. Scale 0.80 to 1.00 of baseline.");
    expect(textOf(chart({ internet: internet() }).tree)).toContain("Scale 0.90 to 1.00 of baseline.");
  });

  it("follows the picked county", () => {
    const file = internet(series({}, 1), series({ 30: 0.5 }, 1));
    expect(textOf(chart({ internet: file, fips: HARRIS_FIPS }).tree)).toContain("Harris County");
    const fortBend = chart({ internet: file, fips: FORT_BEND });
    expect(textOf(fortBend.tree)).toContain("Fort Bend County");
    expect(textOf(fortBend.tree)).toContain("Scale 0.50 to 1.00 of baseline.");
  });

  it("reports the clicked step from the internet strip", () => {
    const { tree, calls } = chart({ internet: internet() });
    const [strip] = netStrip(tree);
    (strip!.props["onClick"] as (e: unknown) => void)({
      clientX: 580,
      currentTarget: { getBoundingClientRect: () => ({ left: 100, width: 960 }) },
    });
    expect(calls).toEqual([96]);
  });

  it("says No county signal for a county with no data at any step and draws no line", () => {
    const { tree } = chart({ internet: internet(series({}, null)) });
    expect(netStrip(tree)).toHaveLength(1);
    expect(netLines(tree)).toHaveLength(0);
    expect(netGaps(tree)).toHaveLength(0);
    expect(findAll(tree, withClass("timeline-empty")).map(textOf)).toContain("No county signal");
    expect(textOf(findAll(tree, (v) => v.type === "title")[0])).toContain("internet reachability unavailable");
    expect(textOf(netStrip(tree)[0])).toContain("no data");
  });

  it("shows the note, not No county signal, for a date with no file or a failed file, and draws no row while the file loads", () => {
    for (const internetNote of ["No internet file for this storm date.", "Internet reachability off. internet.json: HTTP 500"]) {
      const { tree } = chart({ internet: null, internetNote });
      expect(netStrip(tree)).toHaveLength(1);
      expect(netLines(tree)).toHaveLength(0);
      const lines = findAll(tree, withClass("timeline-empty")).map(textOf);
      expect(lines).toContain(internetNote);
      expect(lines).not.toContain("No county signal");
      expect(textOf(netStrip(tree)[0])).toContain(internetNote);
      const [note] = findAll(tree, withClass("timeline-empty-net"));
      expect(note!.type).toBe("p");
      expect((note!.props["children"] as { type: string }).type).toBe("span");
    }
    const loading = chart({ internet: null, internetNote: null }).tree;
    expect(netStrip(loading)).toHaveLength(0);
    expect(textOf(loading)).not.toContain("No county signal");
  });

  it("puts the internet row under the power row and moves the warnings and reports rows down", () => {
    const y = (tree: ComponentChild, strip: string) => Number(findAll(tree, (v) => v.props["data-strip"] === strip)[0]!.props["y"]);
    const without = chart({ power: power(), internet: null }).tree;
    const withNet = chart({ power: power(), internet: internet() }).tree;
    expect(y(withNet, "power")).toBe(0);
    expect(y(withNet, "internet")).toBe(48);
    expect(y(withNet, "warnings") - y(without, "warnings")).toBe(48);
    expect(y(withNet, "reports") - y(without, "reports")).toBe(48);
    expect(y(chart({ internet: internet() }).tree, "internet")).toBe(0);
  });

  it("names the strip with the largest drop and the steps without data", () => {
    const { tree } = chart({ internet: internet(series({ 12: null, 20: 0.8 }, 1)) });
    const text = textOf(netStrip(tree)[0]);
    expect(text).toContain("Harris County");
    expect(text).toContain("largest drop 20.0% below baseline at step 20");
    expect(text).toContain("1 step without data");
    expect(textOf(findAll(tree, (v) => v.type === "title")[0])).toContain("Harris internet reachability largest drop 20.0%");
    const steady = chart({ internet: internet() }).tree;
    expect(textOf(netStrip(steady)[0])).toContain("no drop below baseline");
    expect(textOf(findAll(steady, (v) => v.type === "title")[0])).toContain("Harris internet reachability no drop below baseline");
  });

  it("uses no word that blames the weather or says the line failed", () => {
    for (const file of [internet(series({ 20: 0.8 }, 1)), internet(series({}, null)), null]) {
      expect(textOf(chart({ internet: file, internetNote: file === null ? "No internet file for this storm date." : null }).tree)).not.toMatch(BANNED);
    }
  });
});

describe("the internet series", () => {
  it("returns the ratios, the lowest ratio and its step, the gap count, and the row scale", () => {
    const result = internetSeries(internet(series({ 3: null, 20: 0.8 }, 1)), HARRIS_FIPS)!;
    expect(result.county.name).toBe("Harris");
    expect(result.ratios[20]).toBe(0.8);
    expect(result.ratios[3]).toBeNull();
    expect(result).toMatchObject({ low: 0.8, lowStep: 20, gapSteps: 1, top: 1, bottom: 0.8 });
  });

  it("reports no low step at or above the baseline and widens the top for a ratio above it", () => {
    expect(internetSeries(internet(), HARRIS_FIPS)).toMatchObject({ low: 1, lowStep: null, top: 1 });
    expect(internetSeries(internet(series({ 5: 1.25 }, 1)), HARRIS_FIPS)).toMatchObject({ low: 1, lowStep: null, top: 1.25 });
  });

  it("keeps the baseline inside the row when every ratio is above it", () => {
    const above = internetSeries(internet(series({ 5: 1.25, 6: 1.1 }, 1.05)), HARRIS_FIPS)!;
    expect(above.low).toBe(1.05);
    expect(above.bottom).toBe(1);
    expect(above.top).toBe(1.25);
    const tree = chart({ internet: internet(series({ 5: 1.25, 6: 1.1 }, 1.05)) }).tree;
    const base = findAll(tree, withClass("timeline-net-base"))[0]!;
    expect(Number(base.props["y1"])).toBeLessThanOrEqual(36);
  });

  it("holds a 10% span for a drop smaller than that", () => {
    const tiny = internetSeries(internet(series({ 4: 0.98 }, 1)), HARRIS_FIPS)!;
    expect(tiny.lowStep).toBe(4);
    expect(tiny.top - tiny.bottom).toBeCloseTo(0.1, 10);
  });

  it("returns a null low for a county with no data and null for an unknown county or file", () => {
    expect(internetSeries(internet(series({}, null)), HARRIS_FIPS)).toMatchObject({ low: null, lowStep: null, gapSteps: 192 });
    expect(internetSeries(internet(), "99999")).toBeNull();
    expect(internetSeries(null, HARRIS_FIPS)).toBeNull();
  });
});

describe("the Data pane internet table", () => {
  const file = internet(series({ 12: null, 20: 0.8, 21: 0.9 }, 1));
  const table = () => InternetTable({ date: DATE, internet: file, fips: HARRIS_FIPS });

  it("lists every step with the ratio and the drop, and says no data for a null step", () => {
    const rows = rowsOf(table());
    expect(rows).toHaveLength(192);
    expect(rows[20]).toEqual(["20", "2024-05-28 17:00", "0.800", "20.0%"]);
    expect(rows[21]).toEqual(["21", "2024-05-28 17:15", "0.900", "10.0%"]);
    expect(rows[12]).toEqual(["12", "2024-05-28 15:00", "no data", "no data"]);
    expect(rows[0]).toEqual(["0", "2024-05-28 12:00", "1.000", "0%"]);
  });

  it("shows the same numbers as the strip", () => {
    const { tree, unit } = chart({ internet: file });
    const rows = rowsOf(table());
    const onStrip = netLines(tree)
      .flatMap(pointsOf)
      .map(([x, y]) => ({ step: x / unit - 0.5, y }));
    expect(onStrip.map((p) => p.step)).toEqual(rows.filter((row) => row[3] !== "no data").map((row) => Number(row[0])));
    const bottom = onStrip.reduce((a, b) => (b.y > a.y ? b : a));
    expect(rows[bottom.step]![2]).toBe("0.800");
  });

  it("names the county and says so for a county the file lacks", () => {
    expect(textOf(table())).toContain("Internet reachability for Harris County");
    expect(textOf(table())).not.toMatch(BANNED);
    expect(textOf(InternetTable({ date: DATE, internet: file, fips: "99999" }))).toContain("No internet data for this county");
  });
});

describe("the inspector internet section", () => {
  const file = internet(series({ 20: 0.8 }, 1), series({ 20: null }, 0.95));
  const section = (over: Partial<Parameters<typeof InternetSection>[0]> = {}) => InternetSection({ file, step: 20, fips: HARRIS_FIPS, ...over });
  const detail = (tree: ComponentChild) => textOf(findAll(tree, (v) => v.type === "dl"));

  it("shows the picked county with the drop below baseline, the ratio, and the receipt chip", () => {
    const tree = section();
    expect(detail(tree)).toContain("Harris County");
    expect(detail(tree)).toContain("20.0%");
    expect(detail(tree)).toContain("0.800");
    const [chip] = findAll(tree, (v) => v.type === ReceiptChip);
    expect(chip!.props["file"]).toBe("internet.json");
    expect(chip!.props["receipt"]).toBe(RECEIPT);
  });

  it("reads a null step as no data and never as 0%", () => {
    expect(detail(section({ fips: FORT_BEND }))).toContain("no data");
    expect(detail(section({ fips: FORT_BEND }))).not.toContain("0%");
  });

  it("reads a ratio of 1 as 0% and a step with a lower ratio as its drop", () => {
    expect(detail(section({ step: 0 }))).toContain("0%");
    expect(detail(section({ step: 0, fips: FORT_BEND }))).toContain("5.0%");
  });

  it("says none for a county the file lacks and uses no word that blames the weather", () => {
    expect(detail(section({ fips: "99999" }))).toContain("none");
    expect(textOf(section())).not.toMatch(BANNED);
  });
});

describe("the Data pane file list", () => {
  it("shows the receipt chip after a file that has a receipt", () => {
    const [chip] = findAll(FileItem({ name: "power.json", path: "storms/2024-05-28/power.json", receipt: RECEIPT }), (v) => v.type === ReceiptChip);
    expect(chip!.props["file"]).toBe("power.json");
    expect(chip!.props["receipt"]).toBe(RECEIPT);
  });

  it("shows none for a file the date lacks and no chip for a file without a receipt", () => {
    const missing = FileItem({ name: "power.json", path: null, receipt: null });
    expect(textOf(missing)).toContain("none");
    expect(findAll(missing, (v) => v.type === ReceiptChip)).toHaveLength(0);
    expect(findAll(FileItem({ name: "pairs.json", path: "p.json", receipt: null }), (v) => v.type === ReceiptChip)).toHaveLength(0);
  });
});

describe("the inspector county section", () => {
  const file = power("eaglei", series({ 20: 250 }), series({ 20: 100 }));
  const three: PowerFile = { ...file, counties: [...file.counties, { fips: "48339", name: "Montgomery", customers: 500, out: series({}, null) }] };
  const section = (over: Partial<Parameters<typeof CountySection>[0]> = {}) =>
    CountySection({ file: three, step: 20, fips: HARRIS_FIPS, onPick: () => undefined, ...over });

  it("lists the counties by share out, the largest first and a null step last", () => {
    expect(countyRows(three, 20).map((row) => [row.name, row.share])).toEqual([
      ["Fort Bend", 0.25],
      ["Harris", 0.125],
      ["Montgomery", null],
    ]);
    expect(countyRows(three, 20)[0]).toMatchObject({ fips: FORT_BEND, customers: 400, out: 100 });
  });

  it("shows the picked county with the share out, the customers out and the receipt chip", () => {
    const tree = section();
    const detail = textOf(findAll(tree, (v) => v.type === "dl"));
    expect(detail).toContain("12.5%");
    expect(detail).toContain("250");
    const [chip] = findAll(tree, (v) => v.type === ReceiptChip);
    expect(chip!.props["file"]).toBe("power.json");
    expect(chip!.props["receipt"]).toBe(RECEIPT);
  });

  it("reads a null step as no data and never as 0%", () => {
    const detail = textOf(findAll(section({ fips: "48339" }), (v) => v.type === "dl"));
    expect(detail).toContain("no data");
    expect(detail).not.toContain("0%");
  });

  it("marks the picked county and picks another on a click", () => {
    const picked: string[] = [];
    const buttons = findAll(section({ onPick: (fips) => picked.push(fips) }), (v) => v.type === "button");
    expect(buttons.map((b) => b.props["aria-pressed"])).toEqual([false, true, false]);
    (buttons[0]!.props["onClick"] as () => void)();
    expect(picked).toEqual([FORT_BEND]);
  });

  it("labels an ODIN file and leaves an EAGLE-I file unlabelled", () => {
    expect(textOf(section({ file: { ...three, source: "odin" } }))).toContain(ODIN_LABEL);
    expect(textOf(section())).not.toContain(ODIN_LABEL);
  });
});

describe("a county pick during play", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the step and the play state", () => {
    vi.useFakeTimers();
    let step = 48;
    let playing = false;
    let county: string = HARRIS_FIPS;
    const player = createPlayer({
      step: () => step,
      move: (next) => {
        step = next;
      },
      playing: (on) => {
        playing = on;
      },
      reduced: () => false,
    });
    player.toggle();
    vi.advanceTimersByTime(400);
    expect(step).toBe(52);

    const tree = CountySection({
      file: power(),
      step,
      fips: county,
      onPick: (fips) => {
        county = fips;
      },
    });
    const row = findAll(tree, (v) => v.type === "button" && v.props["data-fips"] === FORT_BEND)[0]!;
    (row.props["onClick"] as () => void)();

    expect(county).toBe(FORT_BEND);
    expect(step).toBe(52);
    expect(playing).toBe(true);
    vi.advanceTimersByTime(400);
    expect(step).toBe(56);
    player.stop();
    expect(playing).toBe(false);
  });
});
