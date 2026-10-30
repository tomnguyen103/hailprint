import type { Feature, Point } from "geojson";
import { describe, expect, it } from "vitest";
import type { ReportProps, SwathFile, WarningsFile } from "../../data/types";
import {
  coveringAt,
  coveringClass,
  distanceKm,
  haversineKm,
  nearestReport,
  reportsWithinRadius,
  swathExposureAt,
  warningsAtPoint,
} from "./geo";

function report(id: number, lon: number, lat: number, size_in = 1.5): Feature<Point, ReportProps> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { id, time: "1823", location: `R${id}`, county: "Harris", state: "TX", size_in },
  };
}

describe("haversineKm and distanceKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm([-95.5, 29.8], [-95.5, 29.8])).toBe(0);
    expect(distanceKm([-95.5, 29.8], [-95.5, 29.8])).toBe(0);
  });

  it("is about 96.5 km for one degree of longitude at 29.5 N", () => {
    expect(Math.abs(haversineKm([-95.0, 29.5], [-96.0, 29.5]) - 96.5)).toBeLessThan(0.5);
    expect(Math.abs(distanceKm([-95.0, 29.5], [-96.0, 29.5]) - 96.8)).toBeLessThan(0.5);
  });
});

describe("nearestReport and reportsWithinRadius", () => {
  it("returns the closest feature and its distance", () => {
    const near = report(1, -95.51, 29.8, 1.25);
    const mid = report(2, -95.53, 29.8, 2.0);
    const far = report(3, -96.0, 29.8, 2.75);
    const hit = nearestReport([-95.5, 29.8], [far, near]);
    expect(hit?.feature.properties.id).toBe(1);
    expect(hit && Math.abs(hit.km - 0.966)).toBeLessThan(0.01);

    const prox = reportsWithinRadius([-95.5, 29.8], [far, mid, near], 5);
    expect(prox.count).toBe(2);
    expect(prox.maxSizeIn).toBe(2.0);
    expect(prox.nearest?.feature.properties.id).toBe(1);
  });

  it("returns null with no features", () => {
    expect(nearestReport([-95.5, 29.8], [])).toBeNull();
    expect(reportsWithinRadius([-95.5, 29.8], [], 5)).toEqual({
      count: 0,
      maxSizeIn: null,
      nearest: null,
      within: [],
    });
  });
});

describe("coveringClass", () => {
  it("returns the highest threshold among the hit features", () => {
    const hits = [
      { properties: { threshold_mm: 19.05 } },
      { properties: { threshold_mm: 38.1 } },
      { properties: { threshold_mm: 25.4 } },
    ];
    expect(coveringClass(hits)).toBe(38.1);
  });

  it("returns null for no hit", () => {
    expect(coveringClass([])).toBeNull();
  });
});

const square = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

describe("coveringAt and swathExposureAt", () => {
  const receipt = {} as SwathFile["receipt"];
  const feature = (mm: number, lonMax: number): SwathFile["features"][number] => ({
    type: "Feature",
    properties: { threshold_mm: mm, threshold_in: mm / 25.4, label: `>= ${mm}`, area_km2: 10 },
    geometry: { type: "MultiPolygon", coordinates: [[square(-95.5, 29.7, lonMax, 29.8)]] },
  });
  const swath: SwathFile = {
    type: "FeatureCollection",
    receipt,
    features: [feature(19.05, -95.4), feature(25.4, -95.45)],
  };

  it("returns covering, withinRadius, and nearest swath classes", () => {
    expect(coveringAt(swath, [-95.48, 29.75])?.threshold_mm).toBe(25.4);
    expect(coveringAt(swath, [-95.42, 29.75])?.threshold_mm).toBe(19.05);
    expect(coveringAt(swath, [-95.3, 29.75])).toBeNull();

    // Point at -95.39, 29.75 is ~1 km east of 19.05 mm (-95.4) and ~5.8 km east of 25.4 mm (-95.45)
    const exp = swathExposureAt(swath, [-95.39, 29.75], 5);
    expect(exp.covering).toBeNull();
    expect(exp.withinRadius?.threshold_mm).toBe(19.05);
    expect(exp.nearest?.threshold_mm).toBe(19.05);
    expect(exp.nearest?.distanceKm).toBeCloseTo(0.966, 2);
  });
});

describe("warningsAtPoint", () => {
  const receipt = {
    storm_date: "2024-05-28",
    sources: [],
    confidence: "radar-estimated hail size",
    run_time: "2024-05-29T00:00:00Z",
    package_version: "0.1.0",
  };

  it("deduplicates polygons with same (phenomena, eventid) and computes earliest firstWarningStep", () => {
    const warnings: WarningsFile = {
      type: "FeatureCollection",
      receipt,
      features: [
        {
          type: "Feature",
          properties: {
            phenomena: "SV",
            significance: "W",
            event_label: "Severe Thunderstorm Warning",
            eventid: 42,
            polygon_begin: "2024-05-28T23:45:00Z",
            polygon_end: "2024-05-29T00:30:00Z",
            product_id: "P2",
          },
          geometry: { type: "MultiPolygon", coordinates: [[square(-95.5, 29.7, -95.3, 29.8)]] },
        },
        {
          type: "Feature",
          properties: {
            phenomena: "SV",
            significance: "W",
            event_label: "Severe Thunderstorm Warning",
            eventid: 42,
            polygon_begin: "2024-05-28T23:30:00Z",
            polygon_end: "2024-05-29T00:15:00Z",
            product_id: "P1",
          },
          geometry: { type: "MultiPolygon", coordinates: [[square(-95.5, 29.7, -95.3, 29.8)]] },
        },
        {
          type: "Feature",
          properties: {
            phenomena: "TO",
            significance: "W",
            event_label: "Tornado Warning",
            eventid: 7,
            polygon_begin: "2024-05-29T00:00:00Z",
            polygon_end: "2024-05-29T00:30:00Z",
            product_id: "P3",
          },
          geometry: { type: "MultiPolygon", coordinates: [[square(-95.5, 29.7, -95.3, 29.8)]] },
        },
      ],
    };

    const res = warningsAtPoint([-95.4, 29.75], warnings, "2024-05-28");
    expect(res.directWarnings).toHaveLength(2);
    expect(res.warningCounts).toEqual({ SV: 1, TO: 1, FF: 0 });
    expect(res.firstWarningStep).toBe(46);
  });
});
