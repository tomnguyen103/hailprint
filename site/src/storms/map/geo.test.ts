import type { Feature, Point } from "geojson";
import { describe, expect, it } from "vitest";
import type { ReportProps } from "../../data/types";
import { coveringClass, haversineKm, nearestReport } from "./geo";

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
