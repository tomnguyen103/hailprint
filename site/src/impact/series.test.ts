import type { Feature, MultiPolygon, Point } from "geojson";
import { describe, expect, it } from "vitest";
import { HARRIS_FIPS } from "../data/constants";
import type { InternetFile, Phenomena, PowerFile, ReportProps, ReportsFile, Receipt, WarningProps, WarningsFile } from "../data/types";
import { resolveStep } from "../time/step";
import { shareOut } from "./power";
import {
  harrisPeak,
  internetSeries,
  internetSeriesTrough,
  powerSeries,
  powerSeriesPeak,
  reportTicks,
  runsOf,
  stepAt,
  warningBars,
} from "./series";

const DATE = "2024-05-28";
const RECEIPT: Receipt = { storm_date: DATE, sources: [], confidence: "Radar-estimated hail size.", run_time: "2024-06-01T00:00:00Z", package_version: "0.6.0" };

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

const powerFile = (out: Record<string, (number | null)[]> = {}): PowerFile => power("eaglei", out[HARRIS_FIPS] ?? series(), out["48157"] ?? series());

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

describe("the report ticks", () => {
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
});

describe("the strips", () => {
  const rect = { left: 100, width: 960 };

  it("turn a click position into a step from 0 to 191", () => {
    expect(stepAt(100, rect)).toBe(0);
    expect(stepAt(580, rect)).toBe(96);
    expect(stepAt(1060, rect)).toBe(191);
    expect(stepAt(40, rect)).toBe(0);
  });
});

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

describe("the Harris peak", () => {
  it("is the first step of the largest Harris value", () => {
    const file = powerFile({ [HARRIS_FIPS]: series({ 40: 5, 80: 9, 90: 9, 100: 3 }) });
    expect(harrisPeak(file)).toBe(80);
  });

  it("ignores a gap and another county", () => {
    const file = powerFile({ [HARRIS_FIPS]: series({ 10: 4, 12: null }, null), "48157": series({ 5: 999 }) });
    expect(harrisPeak(file)).toBe(10);
  });

  it("is null without a file, with no outage, or with only gaps", () => {
    expect(harrisPeak(null)).toBeNull();
    expect(harrisPeak(powerFile())).toBeNull();
    expect(harrisPeak(powerFile({ [HARRIS_FIPS]: series({}, null) }))).toBeNull();
  });

  it("is null for a file with no Harris row and for a file with no county", () => {
    const fortBendOnly = { ...powerFile({ "48157": series({ 5: 999 }) }), counties: powerFile().counties.slice(1) };
    expect(harrisPeak(fortBendOnly)).toBeNull();
    expect(harrisPeak({ ...powerFile(), counties: [] })).toBeNull();
  });

  it("opens the map at the peak with a valid file and at step 48 without one", () => {
    const file = powerFile({ [HARRIS_FIPS]: series({ 77: 12 }) });
    expect(resolveStep(null, harrisPeak(file))).toBe(77);
    expect(resolveStep(null, harrisPeak(null))).toBe(48);
    expect(resolveStep(20, harrisPeak(file))).toBe(20);
  });

  it("delegates powerSeriesPeak and internetSeriesTrough to powerSeries and internetSeries (CR-02.3)", () => {
    const pFile = power("odin", series({ 12: 250 }));
    const peak = powerSeriesPeak(pFile, HARRIS_FIPS, DATE);
    expect(peak?.peakOut).toBe(250);
    expect(peak?.peakShare).toBe(0.125);
    expect(peak?.peakStep).toBe(12);
    expect(peak?.source).toBe("odin");
    expect(powerSeriesPeak(pFile, "99999", DATE)).toBeNull();

    const iFile = internet(series({ 20: 0.85 }, 1));
    const trough = internetSeriesTrough(iFile, HARRIS_FIPS, DATE);
    expect(trough?.minRatio).toBe(0.85);
    expect(trough?.maxDrop).toBe(0.15);
    expect(trough?.troughStep).toBe(20);
    expect(internetSeriesTrough(iFile, "99999", DATE)).toBeNull();

    // When raw outage counts exceed county.customers (share clamped at 1.0), peakStep tracks the highest raw count
    const cappedFile = power("odin", series({ 0: 2000, 1: 2500 }));
    const cappedPeak = powerSeriesPeak(cappedFile, HARRIS_FIPS, DATE);
    expect(cappedPeak?.peakOut).toBe(2500);
    expect(cappedPeak?.peakShare).toBe(1);
    expect(cappedPeak?.peakStep).toBe(1);
  });
});
