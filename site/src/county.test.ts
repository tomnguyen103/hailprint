import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { afterEach, describe, expect, it } from "vitest";
import { setFetch, type Fetch } from "./data/fetch";
import { DataError } from "./data/types";
import { HARRIS_BBOX, METRO_BBOX, PAD_DEG, combineCountyFailure, contains, fetchCounties, fetchCounty, harrisFeature, resetCounties } from "./county";

const FILE = fileURLToPath(new URL("../public/counties.geojson", import.meta.url));
const text = readFileSync(FILE, "utf8");
const counties = JSON.parse(text) as FeatureCollection<MultiPolygon>;

type Corner = [number, number];
const harris = counties.features.filter((f) => f.properties?.["fips"] === "48201");
const corners = (features: typeof counties.features): Corner[] =>
  features.flatMap((f) => f.geometry.coordinates.flat(2)) as Corner[];

afterEach(() => {
  setFetch(null);
  resetCounties();
});

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

  function counted(respond: () => Response = () => new Response(text, { status: 200 })) {
    let calls = 0;
    const fetcher: Fetch = async () => {
      calls += 1;
      return respond();
    };
    return { fetcher, calls: () => calls };
  }

  it("makes one request for two fetchCounties calls and gives both the same outline", async () => {
    const { fetcher, calls } = counted();
    setFetch(fetcher);
    const first = await fetchCounties();
    const second = await fetchCounties();
    expect(calls()).toBe(1);
    expect(second).toBe(first);
  });

  it("makes no second request when fetchCounty follows fetchCounties", async () => {
    const { fetcher, calls } = counted();
    setFetch(fetcher);
    await fetchCounties();
    const result = await fetchCounty();
    expect(calls()).toBe(1);
    expect(result.features.map((f) => f.properties?.["fips"])).toEqual(["48201"]);
  });

  it("does not cache a rejection, so the next call fetches again", async () => {
    const failing = counted(() => new Response("", { status: 500 }));
    setFetch(failing.fetcher);
    await expect(fetchCounties()).rejects.toThrow("counties.geojson: HTTP 500");
    const working = counted();
    setFetch(working.fetcher);
    expect((await fetchCounties()).features).toHaveLength(8);
    expect(failing.calls()).toBe(1);
    expect(working.calls()).toBe(1);
  });

  it("shares one promise between two calls that start before the first resolves", async () => {
    const { fetcher, calls } = counted();
    setFetch(fetcher);
    const first = fetchCounties();
    const second = fetchCounties();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(calls()).toBe(1);
  });

  it("keeps a newer promise when an older request fails late", async () => {
    let failOld: (error: Error) => void = () => {};
    setFetch(() => new Promise<Response>((_, reject) => (failOld = reject)));
    const old = fetchCounties();
    resetCounties();
    const { fetcher, calls } = counted();
    setFetch(fetcher);
    const fresh = fetchCounties();
    failOld(new Error("late"));
    await expect(old).rejects.toThrow("late");
    expect(fetchCounties()).toBe(fresh);
    await fresh;
    expect(calls()).toBe(1);
  });

  it("combineCountyFailure catches either county or metro error and retries both on Retry", () => {
    let countyRetries = 0;
    let metroRetries = 0;
    const err = new DataError("/counties.geojson", "HTTP 500");
    const ready = { status: "ready" as const, data: counties };
    const failed = { status: "error" as const, error: err };

    expect(
      combineCountyFailure(
        { ...ready, retry: () => countyRetries++ },
        { ...ready, retry: () => metroRetries++ },
      ),
    ).toBeNull();

    const bothFail = combineCountyFailure(
      { ...failed, retry: () => countyRetries++ },
      { ...failed, retry: () => metroRetries++ },
    );
    expect(bothFail?.error).toBe(err);
    bothFail?.retry();
    expect(countyRetries).toBe(1);
    expect(metroRetries).toBe(1);

    const metroOnlyFails = combineCountyFailure(
      { ...ready, retry: () => countyRetries++ },
      { ...failed, retry: () => metroRetries++ },
    );
    expect(metroOnlyFails?.error).toBe(err);
    metroOnlyFails?.retry();
    expect(countyRetries).toBe(2);
    expect(metroRetries).toBe(2);
  });

  it("harrisFeature extracts the Harris County feature synchronously and throws DataError when absent", () => {
    const extracted = harrisFeature(counties);
    expect(extracted.features).toHaveLength(1);
    expect(extracted.features[0]?.properties?.["fips"]).toBe("48201");

    expect(() => harrisFeature({ type: "FeatureCollection", features: [] })).toThrow(DataError);
  });
});

