import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { ReportProps, SwathFile } from "../../data/types";
import { containsPoint, coveringAt, coveringClass, haversineKm, nearestReport } from "./geo";

function report(id: number, lon: number, lat: number): Feature<Point, ReportProps> {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: { id, time: "1823", location: `R${id}`, county: "Harris", state: "TX", size_in: 1.5 },
  };
}

describe("haversineKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm([-95.5, 29.8], [-95.5, 29.8])).toBe(0);
  });

  it("is about 96.5 km for one degree of longitude at 29.5 N", () => {
    expect(Math.abs(haversineKm([-95.0, 29.5], [-96.0, 29.5]) - 96.5)).toBeLessThan(0.5);
  });
});

describe("nearestReport", () => {
  it("returns the closest feature and its distance", () => {
    const near = report(1, -95.51, 29.8);
    const far = report(2, -96.0, 29.8);
    const hit = nearestReport([-95.5, 29.8], [far, near]);
    expect(hit?.feature.properties.id).toBe(1);
    expect(hit && Math.abs(hit.km - 0.966)).toBeLessThan(0.01);
  });

  it("returns null with no features", () => {
    expect(nearestReport([-95.5, 29.8], [])).toBeNull();
  });
});

describe("coveringClass", () => {
  it("returns the highest threshold among the hit features", () => {
    const hits = [{ properties: { threshold_mm: 19.05 } }, { properties: { threshold_mm: 38.1 } }, { properties: { threshold_mm: 25.4 } }];
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

describe("containsPoint", () => {
  const holed: Polygon = { type: "Polygon", coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] };

  it("is outside inside the hole, inside the ring, outside the ring", () => {
    expect(containsPoint(holed, [5, 5])).toBe(false);
    expect(containsPoint(holed, [2, 2])).toBe(true);
    expect(containsPoint(holed, [12, 5])).toBe(false);
  });

  it("is inside a MultiPolygon when any polygon holds the point", () => {
    const two: MultiPolygon = { type: "MultiPolygon", coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]] };
    expect(containsPoint(two, [5.5, 5.5])).toBe(true);
    expect(containsPoint(two, [3, 3])).toBe(false);
  });

  it("gives a fixed answer on a vertex (half-open edge test)", () => {
    const unit: Polygon = { type: "Polygon", coordinates: [square(0, 0, 1, 1)] };
    expect(containsPoint(unit, [0, 0])).toBe(true);
  });
});

describe("coveringAt", () => {
  const receipt = {} as SwathFile["receipt"];
  const feature = (mm: number, size: number): SwathFile["features"][number] => ({
    type: "Feature",
    properties: { threshold_mm: mm, threshold_in: mm / 25.4, label: `>= ${mm}`, area_km2: size * size },
    geometry: { type: "MultiPolygon", coordinates: [[square(0, 0, size, size)]] },
  });
  const swath: SwathFile = { type: "FeatureCollection", receipt, features: [feature(19.05, 10), feature(25.4, 5)] };

  it("returns the largest threshold whose feature holds the point", () => {
    expect(coveringAt(swath, [2, 2])?.threshold_mm).toBe(25.4);
    expect(coveringAt(swath, [8, 8])?.threshold_mm).toBe(19.05);
    expect(coveringAt(swath, [20, 20])).toBeNull();
  });
});