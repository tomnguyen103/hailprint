import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { SwathFile } from "./data/types";
import {
  containsPoint,
  cropEdgeDistanceM,
  cropStatusAt,
  distanceM,
  pointInMultiPolygon,
  pointInRing,
  pointToMultiPolygonDistanceM,
  pointToRingDistanceM,
  pointToSegmentDistanceM,
} from "./geometry";

const square = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const swath20240528Path = join(dataDir, "storms/2024-05-28/swath.geojson");

describe("containsPoint and pointInMultiPolygon", () => {
  const holed: Polygon = { type: "Polygon", coordinates: [square(0, 0, 10, 10), square(4, 4, 6, 6)] };

  it("is outside inside the hole, inside the ring, outside the ring", () => {
    expect(containsPoint(holed, [5, 5])).toBe(false);
    expect(containsPoint(holed, [2, 2])).toBe(true);
    expect(containsPoint(holed, [12, 5])).toBe(false);
    expect(pointInRing([2, 2], square(0, 0, 10, 10))).toBe(true);
  });

  it("is inside a MultiPolygon when any polygon holds the point", () => {
    const two: MultiPolygon = { type: "MultiPolygon", coordinates: [[square(0, 0, 1, 1)], [square(5, 5, 6, 6)]] };
    expect(containsPoint(two, [5.5, 5.5])).toBe(true);
    expect(containsPoint(two, [3, 3])).toBe(false);
    expect(pointInMultiPolygon([5.5, 5.5], two)).toBe(true);
    expect(pointInMultiPolygon([3, 3], two)).toBe(false);
  });

  it("gives a fixed answer on a vertex (half-open edge test)", () => {
    const unit: Polygon = { type: "Polygon", coordinates: [square(0, 0, 1, 1)] };
    expect(containsPoint(unit, [0, 0])).toBe(true);
  });
});

describe("WGS84 ellipsoidal tangent-plane distances", () => {
  it("computes segment and ring distances in metres", () => {
    const d0 = pointToSegmentDistanceM([-95.3698, 29.7604], [-95.3698, 29.7604], [-95.35, 29.7604]);
    expect(d0).toBe(0);
    const ring = square(-95.37, 29.75, -95.36, 29.76);
    expect(pointToRingDistanceM([-95.37, 29.755], ring)).toBeCloseTo(0, 5);
    expect(distanceM([-95.3698, 29.7604], [-95.3698, 29.7604])).toBe(0);
  });

  it("returns positive distance to hole boundary when point lies inside an interior hole (US-01.2)", () => {
    const holedMulti: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [[square(-95.6, 29.7, -95.4, 29.9), square(-95.52, 29.78, -95.48, 29.82)]],
    };
    const inHole: [number, number] = [-95.5, 29.8];
    expect(pointInMultiPolygon(inHole, holedMulti)).toBe(false);
    const dist = pointToMultiPolygonDistanceM(inHole, holedMulti);
    expect(dist).not.toBeNull();
    expect(dist!).toBeGreaterThan(1800);
    expect(dist!).toBeLessThan(2300);

    const inSolid: [number, number] = [-95.56, 29.75];
    expect(pointInMultiPolygon(inSolid, holedMulti)).toBe(true);
    expect(pointToMultiPolygonDistanceM(inSolid, holedMulti)).toBe(0);
  });

  it("returns null for an empty MultiPolygon", () => {
    expect(pointToMultiPolygonDistanceM([-95.37, 29.76], { type: "MultiPolygon", coordinates: [] })).toBeNull();
  });

  it.skipIf(!existsSync(swath20240528Path))(
    "matches Python score.py EPSG:32615 oracle on 2024-05-28 19.05 mm swath (US-01.1)",
    () => {
      const swath = JSON.parse(readFileSync(swath20240528Path, "utf8")) as SwathFile;
      const feat19 = swath.features.find((f) => f.properties.threshold_mm === 19.05)!;
      const d1 = pointToMultiPolygonDistanceM([-95.8, 29.8], feat19.geometry);
      const d2 = pointToMultiPolygonDistanceM([-95.45, 29.55], feat19.geometry);
      expect(d1).not.toBeNull();
      expect(d2).not.toBeNull();
      expect(d1!).toBeCloseTo(5316.4, 1);
      expect(Math.abs(d1! - 5320.4)).toBeLessThanOrEqual(6);
      expect(d2!).toBeCloseTo(8864.8, 1);
      expect(Math.abs(d2! - 8870.2)).toBeLessThanOrEqual(6);
    },
  );
});

describe("cropEdgeDistanceM and cropStatusAt (US-01.3)", () => {
  it("classifies interior, near-edge, and outside-crop points against HARRIS_BBOX", () => {
    // Downtown Houston is well inside Harris bbox
    expect(cropEdgeDistanceM([-95.3698, 29.7604])).toBeGreaterThan(25_000);
    expect(cropStatusAt([-95.3698, 29.7604], 5)).toBe("inside");

    // Near western edge of HARRIS_BBOX (-96.010733): -95.98 is ~3 km inside, within 5 km + 1 km margin
    expect(cropEdgeDistanceM([-95.98, 29.8])).toBeGreaterThan(0);
    expect(cropEdgeDistanceM([-95.98, 29.8])).toBeLessThan(6000);
    expect(cropStatusAt([-95.98, 29.8], 5)).toBe("near-edge");

    // Galveston (29.3013, -94.7977) is outside HARRIS_BBOX
    expect(cropEdgeDistanceM([-94.7977, 29.3013])).toBeLessThan(0);
    expect(cropStatusAt([-94.7977, 29.3013], 5)).toBe("outside-crop");
  });
});
