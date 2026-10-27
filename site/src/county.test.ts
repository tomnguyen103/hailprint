import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { afterEach, describe, expect, it } from "vitest";
import { setFetch } from "./data/fetch";
import { HARRIS_BBOX, METRO_BBOX, PAD_DEG, contains, fetchCounties, fetchCounty } from "./county";

const FILE = fileURLToPath(new URL("../public/counties.geojson", import.meta.url));
const text = readFileSync(FILE, "utf8");
const counties = JSON.parse(text) as FeatureCollection<MultiPolygon>;

type Corner = [number, number];
const harris = counties.features.filter((f) => f.properties?.["fips"] === "48201");
const corners = (features: typeof counties.features): Corner[] =>
  features.flatMap((f) => f.geometry.coordinates.flat(2)) as Corner[];

afterEach(() => setFetch(null));

describe("counties.geojson", () => {
  it("holds the 8 metro counties", () => {
    expect(counties.features.map((f) => f.properties?.["name"])).toEqual([
      "Harris",
      "Fort Bend",
      "Montgomery",
      "Brazoria",
      "Galveston",
      "Waller",
      "Liberty",
      "Chambers",
    ]);
    expect(counties.features.every((f) => f.geometry.type === "MultiPolygon")).toBe(true);
  });
});

describe("HARRIS_BBOX", () => {
  it("matches the Python county.bbox() oracle", () => {
    expect(HARRIS_BBOX.map((v) => Number(v.toFixed(4)))).toEqual([-96.0107, 29.4475, -94.8585, 30.2206]);
  });

  it("contains every Harris vertex with the 0.05 degree pad", () => {
    expect(PAD_DEG).toBe(0.05);
    const [minLon, minLat, maxLon, maxLat] = HARRIS_BBOX;
    const points = corners(harris);
    expect(points.length).toBeGreaterThan(100);
    expect(points.every((p) => contains(HARRIS_BBOX, p))).toBe(true);
    expect(points.every(([lon, lat]) => lon > minLon + PAD_DEG - 1e-6 && lat > minLat + PAD_DEG - 1e-6)).toBe(true);
    expect(points.every(([lon, lat]) => lon < maxLon - PAD_DEG + 1e-6 && lat < maxLat - PAD_DEG + 1e-6)).toBe(true);
  });
});

describe("METRO_BBOX", () => {
  it("equals the file bounds with the 0.05 degree pad", () => {
    const points = corners(counties.features);
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    METRO_BBOX.forEach((value, i) => expect(value).toBeCloseTo(bounds[i]! + (i < 2 ? -PAD_DEG : PAD_DEG), 6));
  });

  it("contains every Harris bbox corner", () => {
    expect(contains(METRO_BBOX, [HARRIS_BBOX[0], HARRIS_BBOX[1]])).toBe(true);
    expect(contains(METRO_BBOX, [HARRIS_BBOX[2], HARRIS_BBOX[3]])).toBe(true);
  });
});

describe("fetchCounties and fetchCounty", () => {
  const fake = async (input: RequestInfo | URL) => {
    expect(String(input)).toBe("/counties.geojson");
    return new Response(text, { status: 200 });
  };

  it("fetchCounties returns all 8 features", async () => {
    setFetch(fake);
    expect((await fetchCounties()).features).toHaveLength(8);
  });

  it("fetchCounty returns the Harris feature alone", async () => {
    setFetch(fake);
    const result = await fetchCounty();
    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.properties?.["fips"]).toBe("48201");
  });
});
