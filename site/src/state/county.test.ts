import type { FeatureCollection, MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { countyAt } from "./county";

const square = (west: number, south: number, east: number, north: number): MultiPolygon => ({
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  ],
});

const outlines: FeatureCollection<MultiPolygon> = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { fips: "48201", name: "Harris" }, geometry: square(-96, 29, -95, 30) },
    { type: "Feature", properties: { fips: "48157", name: "Fort Bend" }, geometry: square(-96, 28, -95, 29) },
  ],
};

describe("the county under a map click", () => {
  it("returns the fips of the outline that holds the point", () => {
    expect(countyAt([-95.5, 29.5], outlines)).toBe("48201");
    expect(countyAt([-95.5, 28.5], outlines)).toBe("48157");
  });

  it("returns null outside every outline", () => {
    expect(countyAt([-94, 29.5], outlines)).toBeNull();
  });

  it("returns null while the outlines are not loaded", () => {
    expect(countyAt([-95.5, 29.5], null)).toBeNull();
  });
});
