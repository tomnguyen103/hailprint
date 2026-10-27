import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { describe, expect, it } from "vitest";
import { HARRIS_BBOX, PAD_DEG, contains } from "./county";

const outline = JSON.parse(
  readFileSync(fileURLToPath(new URL("../public/county.geojson", import.meta.url)), "utf8"),
) as FeatureCollection<MultiPolygon>;

describe("HARRIS_BBOX", () => {
  it("matches the Python county.bbox() oracle", () => {
    expect(HARRIS_BBOX.map((v) => Number(v.toFixed(4)))).toEqual([-96.0107, 29.4475, -94.8585, 30.2206]);
  });

  it("contains every outline vertex with the 0.05 degree pad", () => {
    expect(PAD_DEG).toBe(0.05);
    const [minLon, minLat, maxLon, maxLat] = HARRIS_BBOX;
    const points = outline.features.flatMap((f) => f.geometry.coordinates.flat(2)) as [number, number][];
    expect(points.length).toBeGreaterThan(100);
    expect(points.every((p) => contains(HARRIS_BBOX, p))).toBe(true);
    expect(points.every(([lon, lat]) => lon > minLon + PAD_DEG - 1e-6 && lat > minLat + PAD_DEG - 1e-6)).toBe(true);
    expect(points.every(([lon, lat]) => lon < maxLon - PAD_DEG + 1e-6 && lat < maxLat - PAD_DEG + 1e-6)).toBe(true);
  });
});
