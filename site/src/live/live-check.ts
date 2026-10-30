// On-demand live status check for NWS Active Alerts, ORNL ODIN power outages, and Georgia Tech IODA reachability.
// Uses the shared injectable Fetch seam (`getFetch`) with a 15-second AbortController timeout.
import { FETCH_TIMEOUT_MS, getFetch } from "../data/fetch";
import { DataError } from "../data/types";
import { dropOf } from "../impact/internet";
import { ODIN_LABEL } from "../impact/power";

const SIGNAL_STEP_S = 600;
const MAX_IODA_COUNT = 2 ** 24;
const ODIN_LIMIT = 100;
const LIVE_IODA_WINDOW_S = 24 * 3600;

/** IODA v2 county codes matching `src/hailprint/internet.py:25-34`. */
export const IODA_COUNTY_CODES: Readonly<Record<string, string>> = {
  "48201": "3082",
  "48157": "3081",
  "48339": "3027",
  "48039": "3094",
  "48167": "3100",
  "48473": "3052",
  "48291": "3041",
  "48071": "3085",
};

const SORTED_METRO_FIPS = ["48039", "48071", "48157", "48167", "48201", "48291", "48339", "48473"] as const;

/** ORNL ODIN grouped query URL for the 8 Houston Metro counties (`src/hailprint/odin.py:26-40`). */
export const ODIN_METRO_URL =
  "https://ornl.opendatasoft.com/api/explore/v2.1/catalog/datasets/odin-real-time-outages-county/records?" +
  `select=${encodeURIComponent("communitydescriptor,name,sum(metersaffected) as customers_out")}` +
  `&where=${encodeURIComponent(`communitydescriptor IN (${SORTED_METRO_FIPS.map((f) => `"${f}"`).join(",")})`)}` +
  `&group_by=${encodeURIComponent("communitydescriptor,name")}` +
  `&limit=${ODIN_LIMIT}`;

export function nwsAlertsUrl([lon, lat]: [number, number]): string {
  return `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function iodaSignalUrl(fips: string, fromSec: number, untilSec: number): string {
  const code = IODA_COUNTY_CODES[fips];
  if (!code) {
    throw new DataError("ioda", `unknown metro county fips ${fips}`);
  }
  return `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/county/${code}?from=${fromSec}&until=${untilSec}&datasource=ping-slash24`;
}

type Rec = Record<string, unknown>;

function rec(source: string, value: unknown, path: string): Rec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DataError(source, `${path} is not an object`);
  }
  return value as Rec;
}

function list(source: string, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DataError(source, `${path} is not an array`);
  }
  return value;
}

export interface LiveAlert {
  id: string;
  event: string;
  headline: string | null;
  severity: string;
  onset: string | null;
  expires: string | null;
}

export function parseNwsAlerts(value: unknown): LiveAlert[] {
  const root = rec("nws", value, "alerts");
  const features = list("nws", root["features"], "features");
  return features.map((item, i): LiveAlert => {
    const feature = rec("nws", item, `features[${i}]`);
    const props = rec("nws", feature["properties"], `features[${i}].properties`);
    const event = props["event"];
    if (typeof event !== "string" || event.trim() === "") {
      throw new DataError("nws", `features[${i}].properties.event is not a non-empty string`);
    }
    const id =
      typeof props["id"] === "string"
        ? props["id"]
        : typeof feature["id"] === "string"
          ? feature["id"]
          : `alert-${i}`;
    return {
      id,
      event,
      headline: typeof props["headline"] === "string" ? props["headline"] : null,
      severity: typeof props["severity"] === "string" ? props["severity"] : "Unknown",
      onset:
        typeof props["onset"] === "string"
          ? props["onset"]
          : typeof props["effective"] === "string"
            ? props["effective"]
            : null,
      expires:
        typeof props["expires"] === "string"
          ? props["expires"]
          : typeof props["ends"] === "string"
            ? props["ends"]
            : null,
    };
  });
}

export interface LivePowerSnapshot {
  fips: string;
  customersOut: number;
  utilities: string[];
  note: string;
}

export function parseOdinSnapshot(value: unknown, fips: string): LivePowerSnapshot {
  const root = rec("odin", value, "snapshot");
  const results = list("odin", root["results"], "results");
  const total = root["total_count"];
  if (total === undefined || total === null) {
    if (results.length >= ODIN_LIMIT) {
      throw new DataError("odin", "response may be truncated");
    }
  } else if (typeof total !== "number" || !Number.isInteger(total) || total < 0 || total > ODIN_LIMIT) {
    throw new DataError("odin", "invalid or truncated total_count");
  }

  let customersOut = 0;
  const utilities: string[] = [];
  results.forEach((item, i) => {
    const row = rec("odin", item, `results[${i}]`);
    const rowFips = row["communitydescriptor"];
    const name = row["name"];
    const count = row["customers_out"];
    if (typeof rowFips !== "string" || typeof name !== "string") {
      throw new DataError("odin", `results[${i}] lacks communitydescriptor or name`);
    }
    const utility = name.split(",")[0]?.trim() ?? "";
    if (!utility) {
      throw new DataError("odin", `results[${i}] has empty utility name`);
    }
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw new DataError("odin", `results[${i}].customers_out is not a non-negative integer`);
    }
    if (rowFips === fips) {
      customersOut += count;
      if (!utilities.includes(utility)) {
        utilities.push(utility);
      }
    }
  });

  return {
    fips,
    customersOut,
    utilities,
    note: ODIN_LABEL,
  };
}

export interface LiveIodaSnapshot {
  latestValue: number | null;
  baselineMedian: number | null;
  ratio: number | null;
  drop: number | null;
  pointCount: number;
}

function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function parseIodaSignal(value: unknown): LiveIodaSnapshot {
  const root = rec("ioda", value, "signal");
  if (root["error"] !== null && root["error"] !== undefined) {
    throw new DataError("ioda", `response holds error ${String(root["error"])}`);
  }
  const outer = list("ioda", root["data"], "data");
  if (outer.length === 0) {
    throw new DataError("ioda", "data is empty");
  }
  const series = list("ioda", outer[0], "data[0]");
  if (series.length === 0) {
    return { latestValue: null, baselineMedian: null, ratio: null, drop: null, pointCount: 0 };
  }
  if (series.length > 1) {
    throw new DataError("ioda", "expected one signal series");
  }
  const firstSeries = rec("ioda", series[0], "data[0][0]");
  const from = firstSeries["from"];
  const step = firstSeries["step"];
  const rawValues = list("ioda", firstSeries["values"], "data[0][0].values");
  if (typeof from !== "number" || !Number.isInteger(from) || step !== SIGNAL_STEP_S) {
    throw new DataError("ioda", `signal does not step ${SIGNAL_STEP_S} s from an integer epoch`);
  }

  const valid: number[] = [];
  rawValues.forEach((v, i) => {
    if (v === null) return;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_IODA_COUNT) {
      throw new DataError("ioda", `values[${i}] is not a finite count in [0, ${MAX_IODA_COUNT}]`);
    }
    valid.push(v);
  });

  if (valid.length === 0) {
    return { latestValue: null, baselineMedian: null, ratio: null, drop: null, pointCount: 0 };
  }
  const latestValue = valid[valid.length - 1]!;
  const baselineMedian = medianOf(valid);
  const ratio =
    baselineMedian !== null && baselineMedian > 0
      ? Math.round((latestValue / baselineMedian) * 1000) / 1000
      : null;
  const drop = dropOf(ratio);
  return {
    latestValue,
    baselineMedian,
    ratio,
    drop,
    pointCount: valid.length,
  };
}

async function fetchLiveJson<T>(source: string, url: string, guard: (body: unknown) => T): Promise<T> {
  const run = getFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let body: unknown;
  try {
    let response: Response;
    try {
      response = await run(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    } catch (error) {
      throw new DataError(source, `network error, ${String(error)}`);
    }
    if (!response.ok) {
      throw new DataError(source, `HTTP ${response.status}`);
    }
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DataError(source, `network error, ${String(error)}`);
      }
      throw new DataError(source, "body is not JSON");
    }
  } finally {
    clearTimeout(timer);
  }
  return guard(body);
}

export type LiveFeedBlock<T> = ({ status: "ready" } & T) | { status: "error"; message: string };

export interface LiveStatusResult {
  checkedAtUtc: string;
  point: [number, number];
  fips: string | null;
  alerts: LiveFeedBlock<{ alerts: LiveAlert[] }>;
  power: LiveFeedBlock<LivePowerSnapshot>;
  internet: LiveFeedBlock<LiveIodaSnapshot & { fips: string }>;
}

/** Query live NWS Active Alerts, ORNL ODIN power outages, and IODA reachability in parallel with per-feed isolation. */
export async function fetchLiveStatus(
  point: [number, number],
  fips: string | null,
  nowMs = Date.now(),
): Promise<LiveStatusResult> {
  const untilSec = Math.floor(nowMs / 1000);
  const fromSec = untilSec - LIVE_IODA_WINDOW_S;

  const alertsPromise: Promise<LiveFeedBlock<{ alerts: LiveAlert[] }>> = fetchLiveJson(
    "nws",
    nwsAlertsUrl(point),
    parseNwsAlerts,
  )
    .then((alerts): LiveFeedBlock<{ alerts: LiveAlert[] }> => ({ status: "ready", alerts }))
    .catch((err: unknown): LiveFeedBlock<{ alerts: LiveAlert[] }> => ({
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    }));

  const powerPromise: Promise<LiveFeedBlock<LivePowerSnapshot>> =
    fips === null
      ? Promise.resolve({ status: "error", message: "odin: no metro county resolved for point" })
      : fetchLiveJson("odin", ODIN_METRO_URL, (body) => parseOdinSnapshot(body, fips))
          .then((snap): LiveFeedBlock<LivePowerSnapshot> => ({ status: "ready", ...snap }))
          .catch((err: unknown): LiveFeedBlock<LivePowerSnapshot> => ({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          }));

  const internetPromise: Promise<LiveFeedBlock<LiveIodaSnapshot & { fips: string }>> =
    fips === null || !IODA_COUNTY_CODES[fips]
      ? Promise.resolve({ status: "error", message: "ioda: no metro county resolved for point" })
      : fetchLiveJson("ioda", iodaSignalUrl(fips, fromSec, untilSec), parseIodaSignal)
          .then((snap): LiveFeedBlock<LiveIodaSnapshot & { fips: string }> => ({
            status: "ready",
            fips,
            ...snap,
          }))
          .catch((err: unknown): LiveFeedBlock<LiveIodaSnapshot & { fips: string }> => ({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          }));

  const [alerts, power, internet] = await Promise.all([alertsPromise, powerPromise, internetPromise]);
  return {
    checkedAtUtc: new Date(nowMs).toISOString(),
    point,
    fips,
    alerts,
    power,
    internet,
  };
}
