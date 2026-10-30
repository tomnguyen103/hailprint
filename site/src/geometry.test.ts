import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MultiPolygon, Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import type { ReportsFile, SwathFile } from "./data/types";
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
const reports20240528Path = join(dataDir, "storms/2024-05-28/reports.geojson");

function toUtm15N(lonDeg: number, latDeg: number): [number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const lon0 = (-93 * Math.PI) / 180;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const phi = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180 - lon0;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * lam;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) -
      ((35 * e6) / 3072) * Math.sin(6 * phi));
  const x =
    500000 +
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y =
    k0 *
    (M +
      N *
        tanPhi *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

function utmSegmentDistM(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function utmMultiPolygonDistM(lonLat: [number, number], geom: MultiPolygon): number {
  if (pointInMultiPolygon(lonLat, geom)) return 0;
  const p = toUtm15N(lonLat[0], lonLat[1]);
  let minD = Number.POSITIVE_INFINITY;
  for (const poly of geom.coordinates) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = toUtm15N(ring[i]![0] ?? 0, ring[i]![1] ?? 0);
        const b = toUtm15N(ring[i + 1]![0] ?? 0, ring[i + 1]![1] ?? 0);
        const d = utmSegmentDistM(p, a, b);
        if (d < minD) minD = d;
      }
    }
  }
  return minD;
}

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

  it.skipIf(!existsSync(swath20240528Path) || !existsSync(reports20240528Path))(
    "matches Python score.py EPSG:32615 oracle on 2024-05-28 swath.geojson and reports.geojson within <= 6 m (<= 10 km) and <= 25 m (<= 20 km) (S16 / CR-02.5)",
    () => {
      const swath = JSON.parse(readFileSync(swath20240528Path, "utf8")) as SwathFile;
      const reports = JSON.parse(readFileSync(reports20240528Path, "utf8")) as ReportsFile;
      const feat19 = swath.features.find((f) => f.properties.threshold_mm === 19.05)!;
      const d1 = pointToMultiPolygonDistanceM([-95.8, 29.8], feat19.geometry);
      const d2 = pointToMultiPolygonDistanceM([-95.45, 29.55], feat19.geometry);
      expect(d1).not.toBeNull();
      expect(d2).not.toBeNull();
      expect(Math.abs(d1! - 5320.4)).toBeLessThanOrEqual(6);
      expect(Math.abs(d2! - 8870.2)).toBeLessThanOrEqual(6);

      let checked10Km = 0;
      let checked20Km = 0;

      // Report-to-report pairs across 2024-05-28 reports.geojson
      for (let i = 0; i < reports.features.length; i++) {
        const c1 = reports.features[i]!.geometry.coordinates;
        const p1: [number, number] = [c1[0] ?? 0, c1[1] ?? 0];
        const u1 = toUtm15N(p1[0], p1[1]);
        for (let j = i + 1; j < reports.features.length; j++) {
          const c2 = reports.features[j]!.geometry.coordinates;
          const p2: [number, number] = [c2[0] ?? 0, c2[1] ?? 0];
          const u2 = toUtm15N(p2[0], p2[1]);
          const utmDist = Math.hypot(u1[0] - u2[0], u1[1] - u2[1]);
          const jsDist = distanceM(p1, p2);
          const err = Math.abs(jsDist - utmDist);
          if (utmDist > 0 && utmDist <= 10_000) {
            expect(err).toBeLessThanOrEqual(6);
            checked10Km += 1;
          } else if (utmDist > 10_000 && utmDist <= 20_000) {
            expect(err).toBeLessThanOrEqual(25);
            checked20Km += 1;
          }
        }

        // Report-to-swath polygon pairs across 2024-05-28 swath.geojson
        for (const feat of swath.features) {
          const utmDist = utmMultiPolygonDistM(p1, feat.geometry);
          const jsDist = pointToMultiPolygonDistanceM(p1, feat.geometry);
          expect(jsDist).not.toBeNull();
          const err = Math.abs(jsDist! - utmDist);
          if (utmDist > 0 && utmDist <= 10_000) {
            expect(err).toBeLessThanOrEqual(6);
            checked10Km += 1;
          } else if (utmDist > 10_000 && utmDist <= 20_000) {
            expect(err).toBeLessThanOrEqual(25);
            checked20Km += 1;
          }
        }
      }

      expect(checked10Km).toBeGreaterThan(20);
      expect(checked20Km).toBeGreaterThan(4);
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
