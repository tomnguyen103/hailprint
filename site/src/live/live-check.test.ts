import { afterEach, describe, expect, it } from "vitest";
import { getFetch, setFetch } from "../data/fetch";
import {
  IODA_COUNTY_CODES,
  LIVE_IODA_WINDOW_S,
  ODIN_METRO_URL,
  fetchLiveStatus,
  iodaSignalUrl,
  nwsAlertsUrl,
  parseIodaSignal,
  parseNwsAlerts,
  parseOdinSnapshot,
} from "./live-check";

afterEach(() => {
  setFetch(null);
});

const nwsPayload = {
  type: "FeatureCollection",
  features: [
    {
      id: "urn:oid:2.49.0.1.840.0.1",
      type: "Feature",
      properties: {
        id: "NWS-SV-1",
        event: "Severe Thunderstorm Warning",
        headline: "Severe Thunderstorm Warning issued May 16 at 6:00PM CDT",
        severity: "Severe",
        onset: "2024-05-16T23:00:00Z",
        expires: "2024-05-17T00:00:00Z",
      },
    },
  ],
};

const odinPayload = {
  total_count: 2,
  results: [
    {
      communitydescriptor: "48201",
      name: "CENTERPOINT ENERGY,8901",
      customers_out: 1420,
    },
    {
      communitydescriptor: "48157",
      name: "CENTERPOINT ENERGY,8901",
      customers_out: 85,
    },
  ],
};

const iodaPayload = {
  error: null,
  data: [
    [
      {
        from: 1715817600,
        step: 600,
        values: [2400, null, 2388],
      },
    ],
  ],
};

describe("fetchLiveStatus 3-feed snapshot and partial failure isolation (US-03.1, US-03.2)", () => {
  it("queries NWS, ODIN, and IODA via injectable Fetch seam and returns structured ready blocks", async () => {
    const requestedUrls: string[] = [];
    setFetch(async (input) => {
      requestedUrls.push(String(input));
      if (String(input).startsWith("https://api.weather.gov/")) {
        return new Response(JSON.stringify(nwsPayload), { status: 200 });
      }
      if (String(input).startsWith("https://ornl.opendatasoft.com/")) {
        return new Response(JSON.stringify(odinPayload), { status: 200 });
      }
      if (String(input).startsWith("https://api.ioda.inetintel.cc.gatech.edu/")) {
        return new Response(JSON.stringify(iodaPayload), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    expect(typeof getFetch()).toBe("function");
    expect(IODA_COUNTY_CODES["48201"]).toBe("3082");
    expect(nwsAlertsUrl([-95.3698, 29.7604])).toBe("https://api.weather.gov/alerts/active?point=29.7604,-95.3698");
    expect(iodaSignalUrl("48201", 100, 700)).toContain("/3082?from=100&until=700&datasource=ping-slash24");
    expect(ODIN_METRO_URL).toContain("odin-real-time-outages-county");

    const res = await fetchLiveStatus([-95.3698, 29.7604], "48201", 1715904000000);
    expect(requestedUrls).toHaveLength(3);

    expect(res.alerts.status).toBe("ready");
    if (res.alerts.status === "ready") {
      expect(res.alerts.alerts).toHaveLength(1);
      expect(res.alerts.alerts[0]?.event).toBe("Severe Thunderstorm Warning");
    }

    expect(res.power.status).toBe("ready");
    if (res.power.status === "ready") {
      expect(res.power.customersOut).toBe(1420);
      expect(res.power.utilities).toEqual(["CENTERPOINT ENERGY"]);
    }

    expect(res.internet.status).toBe("ready");
    expect(LIVE_IODA_WINDOW_S).toBe(7200);
    expect(requestedUrls[2]).toContain("?from=1715896800&until=1715904000&datasource=ping-slash24");
    if (res.internet.status === "ready") {
      expect(res.internet.latestValue).toBe(2388);
      expect(res.internet.pointCount).toBe(2);
    }
  });

  it("isolates a single feed HTTP 503 failure while preserving the other two ready blocks (US-03.2)", async () => {
    setFetch(async (input) => {
      if (String(input).startsWith("https://api.weather.gov/")) {
        return new Response(JSON.stringify(nwsPayload), { status: 200 });
      }
      if (String(input).startsWith("https://ornl.opendatasoft.com/")) {
        return new Response(JSON.stringify(odinPayload), { status: 200 });
      }
      return new Response("unavailable", { status: 503 });
    });

    const res = await fetchLiveStatus([-95.3698, 29.7604], "48201", 1715904000000);
    expect(res.alerts.status).toBe("ready");
    expect(res.power.status).toBe("ready");
    expect(res.internet).toEqual({ status: "error", message: "ioda: HTTP 503" });
  });
});

describe("strict runtime schema validation (US-03.3)", () => {
  it("rejects non-object payloads, negative outage counts, and non-finite IODA values", () => {
    expect(() => parseNwsAlerts(null)).toThrow(/nws/);
    expect(() => parseNwsAlerts({ features: "bad" })).toThrow(/nws/);

    expect(() =>
      parseOdinSnapshot(
        { results: [{ communitydescriptor: "48201", name: "CENTERPOINT,1", customers_out: -5 }] },
        "48201",
      ),
    ).toThrow(/odin/);

    expect(() =>
      parseIodaSignal({
        error: null,
        data: [[{ from: 1000, step: 600, values: [-1] }]],
      }),
    ).toThrow(/ioda/);

    expect(() =>
      parseOdinSnapshot(
        {
          total_count: 5,
          results: [{ communitydescriptor: "48201", name: "CENTERPOINT,1", customers_out: 10 }],
        },
        "48201",
      ),
    ).toThrow(/odin/);

    expect(() => iodaSignalUrl("__proto__", 0, 600)).toThrow(/ioda/);
  });

  it("notes the IODA 2022-03 to 2024-05 county coverage window when latestValue is null", async () => {
    const { LiveStatusList } = await import("./live-status-list");
    const vnode = LiveStatusList({
      data: {
        checkedAtUtc: "2026-10-27T12:00:00Z",
        point: [-95.3698, 29.7604],
        fips: "48201",
        alerts: { status: "ready", alerts: [] },
        power: { status: "ready", fips: "48201", customersOut: 0, utilities: [], note: "0 utilities" },
        internet: { status: "ready", fips: "48201", latestValue: null, pointCount: 0 },
      },
      onRetry: () => {},
    });
    const text = JSON.stringify(vnode);
    expect(text).toContain("IODA county series covers 2022-03 to 2024-05");
  });
});
