import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METRO_FIPS, STEP_MINUTES, STEPS } from "../data/constants";
import { setFetch } from "../data/fetch";
import type {
  InternetFile,
  PowerFile,
  Receipt,
  ReportsFile,
  Storm,
  StormsIndex,
  SwathFile,
  WarningsFile,
} from "../data/types";
import { useInternetAll, usePowerAll, useReportsAll, useWarningsAll } from "../state/impact-all";
import { clearFileCache, useSparseFiles } from "../state/pairs-all";
import { analyzeStormAtPin, internetSeriesTrough, summarizeArchiveAtPin } from "./point-analysis";

const receipt: Receipt = {
  storm_date: "2024-05-28",
  sources: [{ source: "NOAA MRMS", product: "MESH_Max_1440min", file: "2024-05-28.grib2" }],
  confidence: "Radar-estimated hail size. Literature skill: HSS about 0.38 at 30 mm.",
  run_time: "2024-05-29T12:00:00Z",
  package_version: "0.1.0",
};

const square = (x0: number, y0: number, x1: number, y1: number) => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

const stormFixture: Storm = {
  storm_date: "2024-05-28",
  report_count: 2,
  max_size_in: 1.75,
  report_source: "wcm",
  max_mesh_mm: 38.1,
  scored_reports: 2,
  excluded_reports: 0,
  table: [],
  parcel_total: 120,
  files: {
    swath: "storms/2024-05-28/swath.geojson",
    reports: "storms/2024-05-28/reports.geojson",
    pairs: "storms/2024-05-28/pairs.json",
    zip_counts: null,
    power: "storms/2024-05-28/power.json",
    internet: "storms/2024-05-28/internet.json",
    warnings: "storms/2024-05-28/warnings.geojson",
  },
};

const swathFixture: SwathFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: { threshold_mm: 19.05, threshold_in: 0.75, label: "penny", area_km2: 80 },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.6, 29.7, -95.3, 29.85)]] },
    },
    {
      type: "Feature",
      properties: { threshold_mm: 38.1, threshold_in: 1.5, label: "walnut", area_km2: 25 },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.4, 29.74, -95.34, 29.78)]] },
    },
  ],
};

const reportsFixture: ReportsFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-95.3698, 29.7604] },
      properties: { id: 1, time: "2340", location: "Downtown", county: "Harris", state: "TX", size_in: 1.75 },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-95.9, 29.9] },
      properties: { id: 2, time: "2355", location: "Waller line", county: "Harris", state: "TX", size_in: 1.0 },
    },
  ],
};

const warningsFixture: WarningsFile = {
  type: "FeatureCollection",
  receipt,
  features: [
    {
      type: "Feature",
      properties: {
        phenomena: "SV",
        significance: "W",
        event_label: "Severe Thunderstorm Warning",
        eventid: 11,
        polygon_begin: "2024-05-28T23:45:00Z",
        polygon_end: "2024-05-29T00:30:00Z",
        product_id: "HGX-SV-11B",
      },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.6, 29.7, -94.7, 29.85)]] },
    },
    {
      type: "Feature",
      properties: {
        phenomena: "SV",
        significance: "W",
        event_label: "Severe Thunderstorm Warning",
        eventid: 11,
        polygon_begin: "2024-05-28T23:30:00Z",
        polygon_end: "2024-05-29T00:15:00Z",
        product_id: "HGX-SV-11A",
      },
      geometry: { type: "MultiPolygon", coordinates: [[square(-95.6, 29.7, -94.7, 29.85)]] },
    },
  ],
};

function makePowerFixture(): PowerFile {
  return {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: STEP_MINUTES, steps: STEPS },
    source: "eaglei",
    utilities: null,
    counties: METRO_FIPS.map((fips, idx) => {
      const out = Array<number | null>(STEPS).fill(0);
      if (fips === "48201") out[60] = 251830;
      if (fips === "48167") out[72] = 14200;
      return {
        fips,
        name: fips === "48201" ? "Harris" : fips === "48167" ? "Galveston" : `County ${idx}`,
        customers: fips === "48201" ? 2_200_000 : 160_000,
        out,
      };
    }),
  };
}

function makeInternetFixture(): InternetFile {
  return {
    receipt,
    window: { start: "2024-05-28T12:00:00Z", step_minutes: STEP_MINUTES, steps: STEPS },
    signal: "ping-slash24",
    baseline_days: 7,
    counties: METRO_FIPS.map((fips, idx) => {
      const ratio = Array<number | null>(STEPS).fill(1.0);
      if (fips === "48201") ratio[46] = 0.961;
      if (fips === "48167") ratio[50] = 0.912;
      return {
        fips,
        name: fips === "48201" ? "Harris" : fips === "48167" ? "Galveston" : `County ${idx}`,
        baseline: 2400,
        ratio,
      };
    }),
  };
}

describe("useSparseFiles and impact-all hooks (US-02.1, US-02.2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearFileCache();
    vi.stubGlobal("document", {});
    vi.stubGlobal("window", {
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
  });

  afterEach(() => {
    setFetch(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("makes 0 fetch calls when enabled is false, and fetches only non-null paths when enabled is true", async () => {
    const calls: string[] = [];
    setFetch(async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({ url }), { status: 200 });
    });

    const seen: Array<{ status: string; data: unknown }> = [];
    function Probe({ enabled, runTime }: { enabled: boolean; runTime: string }) {
      const res = useSparseFiles(
        ["storms/2024-05-28/a.json", null, "storms/2024-05-28/b.json"],
        (v) => (v as { url: string }).url,
        runTime,
        enabled,
      );
      seen.push({ status: res.status, data: res.data });
      return null;
    }

    const host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;
    await act(() => render(h(Probe, { enabled: false, runTime: "2024-05-29T12:00:00Z" }), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(calls).toHaveLength(0);
    expect(seen.at(-1)).toEqual({ status: "ready", data: [null, null, null] });

    await act(() => render(h(Probe, { enabled: true, runTime: "2024-05-29T12:00:00Z" }), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(calls).toHaveLength(2);
    expect(seen.at(-1)).toEqual({
      status: "ready",
      data: ["/data/storms/2024-05-28/a.json", null, "/data/storms/2024-05-28/b.json"],
    });

    // Changing runTime mid-flight immediately returns loading, never stale data from old runTime (US-02.2)
    const beforeSwitchLen = seen.length;
    await act(() => render(h(Probe, { enabled: true, runTime: "2024-05-30T12:00:00Z" }), host));
    expect(seen[beforeSwitchLen]).toEqual({ status: "loading", data: undefined });
  });

  it("exposes useReportsAll, useWarningsAll, usePowerAll, and useInternetAll", async () => {
    setFetch(async () => new Response("{}", { status: 200 }));
    const index: StormsIndex = {
      confidence: receipt.confidence,
      run_time: receipt.run_time,
      package_version: receipt.package_version,
      radius_km_default: 5,
      storms: [stormFixture],
    };
    let statusSummary = "";
    function AllProbe() {
      const r = useReportsAll(index, false);
      const w = useWarningsAll(index, false);
      const p = usePowerAll(index, false);
      const i = useInternetAll(index, false);
      statusSummary = `${r.status}:${w.status}:${p.status}:${i.status}`;
      return null;
    }
    const host = { firstChild: null, childNodes: [], namespaceURI: "http://www.w3.org/1999/xhtml" } as unknown as HTMLElement;
    await act(() => render(h(AllProbe, {}), host));
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)));
    expect(statusSummary).toBe("ready:ready:ready:ready");
  });
});

describe("analyzeStormAtPin and summarizeArchiveAtPin (US-02.3, US-02.4, US-02.5)", () => {
  it("computes swath, report proximity, deduplicated warnings, power peak, and internet trough for Harris (48201)", () => {
    const power = makePowerFixture();
    const internet = makeInternetFixture();
    const row = analyzeStormAtPin({
      storm: stormFixture,
      point: [-95.3698, 29.7604],
      radiusKm: 5,
      fips: "48201",
      swath: swathFixture,
      reports: reportsFixture,
      warnings: warningsFixture,
      power,
      internet,
    });

    expect(row.cropStatus).toBe("inside");
    expect(row.covering?.threshold_mm).toBe(38.1);
    expect(row.withinRadius?.threshold_mm).toBe(38.1);
    expect(row.reportsWithinRadius.count).toBe(1);
    expect(row.reportsWithinRadius.maxSizeIn).toBe(1.75);
    expect(row.warningCounts).toEqual({ SV: 1, TO: 0, FF: 0 });
    expect(row.firstWarningStep).toBe(46);

    expect(row.powerPeak?.peakOut).toBe(251830);
    expect(row.powerPeak?.peakStep).toBe(60);
    expect(row.powerPeak?.peakShare).toBeCloseTo(251830 / 2_200_000, 6);

    expect(row.internetTrough?.minRatio).toBe(0.961);
    expect(row.internetTrough?.maxDrop).toBe(0.039);
    expect(row.internetTrough?.troughStep).toBe(46);
    expect(internetSeriesTrough(internet, "48201", "2024-05-28")?.maxDrop).toBe(0.039);

    const summary = summarizeArchiveAtPin([row]);
    expect(summary.totalStorms).toBe(1);
    expect(summary.stormsWithSwathWithinRadius).toBe(1);
    expect(summary.maxSwathWithinRadius?.threshold_mm).toBe(38.1);
    expect(summary.stormsWithReportsWithinRadius).toBe(1);
    expect(summary.stormsWithDirectWarnings).toBe(1);
    expect(summary.worstPowerPeak?.peakOut).toBe(251830);
    expect(summary.deepestInternetTrough?.maxDrop).toBe(0.039);
  });

  it("marks cropStatus as outside-crop in Galveston (48167) while preserving warnings, power peak, and internet trough (US-02.4)", () => {
    const row = analyzeStormAtPin({
      storm: stormFixture,
      point: [-94.7977, 29.75],
      radiusKm: 5,
      fips: "48167",
      swath: swathFixture,
      reports: reportsFixture,
      warnings: warningsFixture,
      power: makePowerFixture(),
      internet: makeInternetFixture(),
    });

    expect(row.cropStatus).toBe("outside-crop");
    expect(row.covering).toBeNull();
    expect(row.withinRadius).toBeNull();
    expect(row.warningCounts).toEqual({ SV: 1, TO: 0, FF: 0 });
    expect(row.powerPeak?.peakOut).toBe(14200);
    expect(row.powerPeak?.peakStep).toBe(72);
    expect(row.internetTrough?.minRatio).toBe(0.912);
    expect(row.internetTrough?.maxDrop).toBe(0.088);
    expect(row.internetTrough?.troughStep).toBe(50);
    expect(row.swathReceipt).toEqual(receipt);
  });

  it("sets hasActivityNearPin when county power peak >= 1% or internet drop >= 2% even with no local swath, report, or warning (CR-02.4)", () => {
    const power = makePowerFixture();
    const internet = makeInternetFixture();

    // Point far from swath/reports/warnings in Harris (48201), where power peak is ~11.4% (>= 1%)
    const activeByPower = analyzeStormAtPin({
      storm: stormFixture,
      point: [-95.9, 30.1],
      radiusKm: 1,
      fips: "48201",
      swath: null,
      reports: null,
      warnings: null,
      power,
      internet: null,
    });
    expect(activeByPower.hasActivityNearPin).toBe(true);

    // Point with only internet drop 3.9% (>= 2%)
    const activeByInternet = analyzeStormAtPin({
      storm: stormFixture,
      point: [-95.9, 30.1],
      radiusKm: 1,
      fips: "48201",
      swath: null,
      reports: null,
      warnings: null,
      power: null,
      internet,
    });
    expect(activeByInternet.hasActivityNearPin).toBe(true);

    // County with 0% power and 0% internet drop has hasActivityNearPin = false
    const quiet = analyzeStormAtPin({
      storm: stormFixture,
      point: [-95.9, 30.1],
      radiusKm: 1,
      fips: "48157",
      swath: null,
      reports: null,
      warnings: null,
      power,
      internet,
    });
    expect(quiet.hasActivityNearPin).toBe(false);
  });
});
