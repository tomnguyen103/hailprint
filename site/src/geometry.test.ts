import type { MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { containsPoint } from "./geometry";

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
