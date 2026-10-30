import { describe, expect, it } from "vitest";
import type { PooledRow } from "../pool";
import { csvOf } from "./csv";

const HEADER =
  "threshold_mm,threshold_in,label,report_count,hits,misses,false_alarms,correct_negatives,pod,far,csi,hss,swath_km2,unverifiable_km2";

function row(over: Partial<PooledRow> = {}): PooledRow {
  return {
    threshold_mm: 19.05,
    threshold_in: 0.75,
    label: ">= 0.75 in",
    report_count: 17,
    hits: 5,
    misses: 2,
    false_alarms: 3,
    correct_negatives: 7,
    pod: 0.7142857142857143,
    far: 0.375,
    csi: 0.5,
    hss: 0.4,
    swath_km2: 123.4,
    unverifiable_km2: 5.6,
    ...over,
  };
}

describe("csvOf", () => {
  it("starts with the spec header", () => {
    expect(csvOf([row()]).split("\n")[0]).toBe(HEADER);
  });

  it("writes a null metric as an empty cell and never the text null", () => {
    const text = csvOf([row({ hss: null })]);
    const cells = text.split("\n")[1]?.split(",") ?? [];
    expect(cells[10]).toBe("0.5");
    expect(cells[11]).toBe("");
    expect(cells[12]).toBe("123.4");
    expect(text).not.toContain("null");
  });

  it("ends with one newline and holds one line per row", () => {
    const text = csvOf([row(), row({ threshold_mm: 25.4 })]);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n")).toHaveLength(4);
  });

  it("quotes a label with a comma or a quote", () => {
    expect(csvOf([row({ label: 'a, "b"' })]).split("\n")[1]).toContain('"a, ""b"""');
  });

  it("prefixes leading formula triggers and control characters with a single quote", () => {
    for (const prefix of ["=cmd", "+1", "-2", "@sum", "\t=cmd"]) {
      const line = csvOf([row({ label: prefix })]).split("\n")[1]!;
      expect(line.split(",")[2]).toBe(`'${prefix}`);
    }
    expect(csvOf([row({ label: "\r=cmd" })])).toContain('"\'\r=cmd"');
  });
});

describe("zipCsvOf", () => {
  it("formats ZIP parcel rows with storm_date, threshold_mm, zip, parcel_count, and share_of_class", async () => {
    const { zipCsvOf } = await import("./csv");
    const csv = zipCsvOf(
      [
        { zip: "77002", parcel_count: 25, share: 0.25 },
        { zip: "77003", parcel_count: 75, share: 0.75 },
      ],
      "2024-05-28",
      19.05,
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("storm_date,threshold_mm,zip,parcel_count,share_of_class");
    expect(lines[1]).toBe("2024-05-28,19.05,77002,25,0.25");
    expect(lines[2]).toBe("2024-05-28,19.05,77003,75,0.75");
  });
});

describe("pointCsvOf", () => {
  it("formats 25-storm point history rows with coordinate, swath, reports, warnings, power, and internet columns", async () => {
    const { pointCsvOf } = await import("./csv");
    const csv = pointCsvOf(
      [
        {
          storm: {} as never,
          stormDate: "2024-05-28",
          point: [-95.3698, 29.7604],
          radiusKm: 5,
          fips: "48201",
          cropStatus: "inside",
          covering: {
            props: { threshold_mm: 25.4, threshold_in: 1.0, label: ">= 1.00 in", area_km2: 10 },
            threshold_mm: 25.4,
            threshold_in: 1.0,
            label: ">= 1.00 in",
            distanceKm: 0,
            distanceM: 0,
          },
          withinRadius: {
            props: { threshold_mm: 25.4, threshold_in: 1.0, label: ">= 1.00 in", area_km2: 10 },
            threshold_mm: 25.4,
            threshold_in: 1.0,
            label: ">= 1.00 in",
            distanceKm: 0,
            distanceM: 0,
          },
          nearest: {
            props: { threshold_mm: 25.4, threshold_in: 1.0, label: ">= 1.00 in", area_km2: 10 },
            threshold_mm: 25.4,
            threshold_in: 1.0,
            label: ">= 1.00 in",
            distanceKm: 0,
            distanceM: 0,
          },
          reportsWithinRadius: { count: 3, maxSizeIn: 1.75, nearest: null, within: [] },
          directWarnings: [
            {
              phenomena: "SV",
              event_label: "SV",
              eventid: 1,
              polygon_begin: "",
              polygon_end: "",
              product_id: "1",
              firstStep: 10,
            },
          ],
          nearbyWarnings: [],
          warningCounts: { SV: 1, TO: 0, FF: 0 },
          firstWarningStep: 10,
          powerPeak: {
            fips: "48201",
            countyName: "Harris",
            peakShare: 0.125,
            peakOut: 12000,
            peakStep: 20,
            peakTimeUtc: "",
            customers: 96000,
            source: "eaglei",
            utilities: [],
          },
          internetTrough: {
            fips: "48201",
            countyName: "Harris",
            minRatio: 0.85,
            maxDrop: 0.15,
            troughStep: 22,
            troughTimeUtc: "",
            baseline: 100,
          },
          hasActivityNearPin: true,
          swathReceipt: null,
        },
      ],
      [-95.3698, 29.7604],
      5,
    );
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "storm_date,lat,lon,radius_km,crop_status,covering_mm,within_radius_mm,nearest_swath_km,reports_within_radius,direct_warnings,power_peak_share,power_peak_out,internet_max_drop",
    );
    expect(lines[1]).toBe("2024-05-28,29.7604,-95.3698,5,inside,25.4,25.4,0,3,1,0.125,12000,0.15");
  });
});

describe("Compare helpers", () => {
  it("defaults to 2024-05-28 vs 2023-06-23 when present and computes A-vs-B deltas", async () => {
    const { COMPARE_PRESETS, defaultComparePair, compareDelta } = await import("./compare");
    expect(COMPARE_PRESETS.map((p) => [p.dateA, p.dateB])).toEqual([
      ["2024-05-28", "2023-06-23"],
      ["2024-05-28", "2024-03-15"],
      ["2024-12-24", "2024-03-21"],
    ]);
    const storms = [
      {
        storm_date: "2026-03-27",
        report_count: 1,
        max_size_in: 1.0,
        report_source: "spc-daily",
        max_mesh_mm: 30,
        scored_reports: 1,
        excluded_reports: 0,
        table: [{ threshold_mm: 19.05, threshold_in: 0.75, label: ">= 0.75 in", hits: 1, misses: 0, false_alarms: 0, correct_negatives: 0, pod: 1, far: 0, csi: 1, hss: 0.5, swath_km2: 100, unverifiable_km2: 50 }],
        parcel_total: 1000,
        files: { swath: "", reports: "", pairs: "", zip_counts: null, power: null, internet: null, warnings: null },
      },
      {
        storm_date: "2024-05-28",
        report_count: 9,
        max_size_in: 1.75,
        report_source: "wcm",
        max_mesh_mm: 65.0,
        scored_reports: 8,
        excluded_reports: 0,
        table: [
          { threshold_mm: 19.05, threshold_in: 0.75, label: ">= 0.75 in", hits: 10, misses: 0, false_alarms: 0, correct_negatives: 0, pod: 1, far: 0, csi: 1, hss: null, swath_km2: 850.5, unverifiable_km2: 400 },
          { threshold_mm: 38.1, threshold_in: 1.5, label: ">= 1.50 in", hits: 4, misses: 0, false_alarms: 5, correct_negatives: 1, pod: 1, far: 0.55, csi: 0.44, hss: 0.42, swath_km2: 118.9, unverifiable_km2: 63.7 },
        ],
        parcel_total: 245000,
        files: { swath: "", reports: "", pairs: "", zip_counts: null, power: null, internet: null, warnings: null },
      },
      {
        storm_date: "2023-06-23",
        report_count: 4,
        max_size_in: 2.0,
        report_source: "wcm",
        max_mesh_mm: 72.0,
        scored_reports: 3,
        excluded_reports: 0,
        table: [
          { threshold_mm: 19.05, threshold_in: 0.75, label: ">= 0.75 in", hits: 13, misses: 0, false_alarms: 0, correct_negatives: 0, pod: 1, far: 0, csi: 1, hss: null, swath_km2: 410.0, unverifiable_km2: 200 },
          { threshold_mm: 44.45, threshold_in: 1.75, label: ">= 1.75 in", hits: 2, misses: 3, false_alarms: 3, correct_negatives: 5, pod: 0.4, far: 0.6, csi: 0.25, hss: 0.31, swath_km2: 2.1, unverifiable_km2: 0 },
        ],
        parcel_total: 95000,
        files: { swath: "", reports: "", pairs: "", zip_counts: null, power: null, internet: null, warnings: null },
      },
    ];
    expect(defaultComparePair(storms)).toEqual(["2024-05-28", "2023-06-23"]);
    const delta = compareDelta(storms[1], storms[2]);
    expect(delta.deltaParcels).toBe(150000);
    expect(delta.deltaSwathKm2).toBeCloseTo(440.5, 2);
    expect(delta.deltaMaxMeshMm).toBeCloseTo(-7.0, 2);
    expect(delta.deltaReports).toBe(5);
    expect(delta.deltaHss).toBeCloseTo(0.11, 2);
  });
});

