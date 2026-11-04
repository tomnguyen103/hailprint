// Pure cross-storm and per-storm proximity & impact analyzer for a pinned location. No MapLibre, no Preact.
import type {
  InternetFile,
  Phenomena,
  PowerFile,
  Receipt,
  ReportsFile,
  Storm,
  SwathFile,
  WarningsFile,
} from "../data/types";
import { type CropStatus, cropStatusAt } from "../geometry";
import {
  type InternetTroughSummary,
  type PowerPeakSummary,
  internetSeriesTrough,
  powerSeriesPeak,
} from "../impact/series";
import {
  type DirectWarning,
  type NearbyWarning,
  type ReportHit,
  type ReportsProximity,
  type SwathDistance,
  type SwathExposure,
  type WarningsAtPoint,
  reportsWithinRadius,
  swathExposureAt,
  warningsAtPoint,
} from "../storms/map/geo";

export { type InternetTroughSummary, type PowerPeakSummary, internetSeriesTrough, powerSeriesPeak };

const MAX_DISTANCE_RADIUS_KM = 1000;

export interface StormPointDistancesInput {
  storm: Storm;
  point: [number, number];
  fips: string | null;
  swath: SwathFile | null;
  reports: ReportsFile | null;
  warnings: WarningsFile | null;
  power: PowerFile | null;
  internet: InternetFile | null;
}

export interface StormPointDistances {
  storm: Storm;
  stormDate: string;
  point: [number, number];
  fips: string | null;
  swathExposure: SwathExposure;
  reportHits: ReportHit[];
  nearestReportHit: ReportHit | null;
  warningsBase: WarningsAtPoint;
  powerPeak: PowerPeakSummary | null;
  internetTrough: InternetTroughSummary | null;
  swathReceipt: Receipt | null;
}

export interface AnalyzeStormInput extends StormPointDistancesInput {
  radiusKm: number;
}

export interface StormPinRow {
  storm: Storm;
  stormDate: string;
  point: [number, number];
  radiusKm: number;
  fips: string | null;
  cropStatus: CropStatus;
  covering: SwathDistance | null;
  withinRadius: SwathDistance | null;
  nearest: SwathDistance | null;
  reportsWithinRadius: ReportsProximity;
  directWarnings: DirectWarning[];
  nearbyWarnings: NearbyWarning[];
  warningCounts: Record<Phenomena, number>;
  firstWarningStep: number | null;
  powerPeak: PowerPeakSummary | null;
  internetTrough: InternetTroughSummary | null;
  hasActivityNearPin: boolean;
  swathReceipt: Receipt | null;
}

/** Distance pass for one storm date: computes swath, report, and warning distances once per (point, files). */
export function computeStormPointDistances(input: StormPointDistancesInput): StormPointDistances {
  const { storm, point, fips, swath, reports, warnings, power, internet } = input;
  const stormDate = storm.storm_date;
  const swathExposure = swathExposureAt(swath, point, MAX_DISTANCE_RADIUS_KM);
  const allReports = reportsWithinRadius(point, reports, MAX_DISTANCE_RADIUS_KM);
  const warningsBase = warningsAtPoint(point, warnings, stormDate, MAX_DISTANCE_RADIUS_KM);
  const powerPeak = powerSeriesPeak(power, fips, stormDate);
  const internetTrough = internetSeriesTrough(internet, fips, stormDate);
  return {
    storm,
    stormDate,
    point,
    fips,
    swathExposure,
    reportHits: allReports.within,
    nearestReportHit: allReports.nearest,
    warningsBase,
    powerPeak,
    internetTrough,
    swathReceipt: swath?.receipt ?? null,
  };
}

/** Cheap radius threshold pass over precomputed per-storm point distances. */
export function applyRadiusToStormDistances(distances: StormPointDistances, radiusKm: number): StormPinRow {
  const {
    storm,
    stormDate,
    point,
    fips,
    swathExposure,
    reportHits,
    nearestReportHit,
    warningsBase,
    powerPeak,
    internetTrough,
    swathReceipt,
  } = distances;
  const radiusM = radiusKm * 1000;
  const cropStatus = cropStatusAt(point, radiusKm);
  const covering = cropStatus === "outside-crop" ? null : swathExposure.covering;
  let withinRadius: SwathDistance | null = null;
  if (cropStatus !== "outside-crop") {
    for (const entry of swathExposure.classes) {
      if (entry.distanceM <= radiusM && (withinRadius === null || entry.threshold_mm > withinRadius.threshold_mm)) {
        withinRadius = entry;
      }
    }
  }
  const within = reportHits.filter((hit) => hit.distanceM <= radiusM);
  let maxSizeIn: number | null = null;
  for (const hit of within) {
    if (maxSizeIn === null || hit.feature.properties.size_in > maxSizeIn) {
      maxSizeIn = hit.feature.properties.size_in;
    }
  }
  const reportsProx: ReportsProximity = {
    count: within.length,
    maxSizeIn,
    nearest: nearestReportHit,
    within,
  };
  const nearbyWarnings =
    radiusKm > 0 ? warningsBase.nearbyWarnings.filter((w) => w.distanceKm * 1000 <= radiusM) : [];
  const hasActivityNearPin =
    withinRadius !== null ||
    reportsProx.count > 0 ||
    warningsBase.directWarnings.length > 0 ||
    (powerPeak?.peakShare ?? 0) >= 0.01 ||
    (internetTrough?.maxDrop ?? 0) >= 0.02;

  return {
    storm,
    stormDate,
    point,
    radiusKm,
    fips,
    cropStatus,
    covering,
    withinRadius,
    nearest: swathExposure.nearest,
    reportsWithinRadius: reportsProx,
    directWarnings: warningsBase.directWarnings,
    nearbyWarnings,
    warningCounts: warningsBase.warningCounts,
    firstWarningStep: warningsBase.firstWarningStep,
    powerPeak,
    internetTrough,
    hasActivityNearPin,
    swathReceipt,
  };
}

/** Pure per-storm proximity & outage analysis for a pinned coordinate and Metro county FIPS. */
export function analyzeStormAtPin(input: AnalyzeStormInput): StormPinRow {
  return applyRadiusToStormDistances(computeStormPointDistances(input), input.radiusKm);
}

export interface ArchivePinSummary {
  totalStorms: number;
  stormsWithSwathWithinRadius: number;
  stormsWithDirectSwath: number;
  maxSwathWithinRadius: SwathDistance | null;
  stormsWithReportsWithinRadius: number;
  totalReportsWithinRadius: number;
  maxReportSizeIn: number | null;
  stormsWithDirectWarnings: number;
  totalDirectWarnings: number;
  worstPowerPeak: (PowerPeakSummary & { stormDate: string }) | null;
  deepestInternetTrough: (InternetTroughSummary & { stormDate: string }) | null;
}

/** Rollup summary across all storm dates in the archive for a pinned location. */
export function summarizeArchiveAtPin(rows: readonly StormPinRow[]): ArchivePinSummary {
  let stormsWithSwathWithinRadius = 0;
  let stormsWithDirectSwath = 0;
  let maxSwathWithinRadius: SwathDistance | null = null;
  let stormsWithReportsWithinRadius = 0;
  let totalReportsWithinRadius = 0;
  let maxReportSizeIn: number | null = null;
  let stormsWithDirectWarnings = 0;
  let totalDirectWarnings = 0;
  let worstPowerPeak: (PowerPeakSummary & { stormDate: string }) | null = null;
  let deepestInternetTrough: (InternetTroughSummary & { stormDate: string }) | null = null;

  for (const row of rows) {
    if (row.covering !== null) stormsWithDirectSwath += 1;
    if (row.withinRadius !== null) {
      stormsWithSwathWithinRadius += 1;
      if (
        maxSwathWithinRadius === null ||
        row.withinRadius.threshold_mm > maxSwathWithinRadius.threshold_mm ||
        (row.withinRadius.threshold_mm === maxSwathWithinRadius.threshold_mm &&
          row.withinRadius.distanceM < maxSwathWithinRadius.distanceM)
      ) {
        maxSwathWithinRadius = row.withinRadius;
      }
    }
    if (row.reportsWithinRadius.count > 0) {
      stormsWithReportsWithinRadius += 1;
      totalReportsWithinRadius += row.reportsWithinRadius.count;
      const rowMax = row.reportsWithinRadius.maxSizeIn;
      if (rowMax !== null && (maxReportSizeIn === null || rowMax > maxReportSizeIn)) {
        maxReportSizeIn = rowMax;
      }
    }
    if (row.directWarnings.length > 0) {
      stormsWithDirectWarnings += 1;
      totalDirectWarnings += row.directWarnings.length;
    }
    if (row.powerPeak !== null && row.powerPeak.peakOut !== null && row.powerPeak.peakOut > 0) {
      if (
        worstPowerPeak === null ||
        (row.powerPeak.peakShare ?? 0) > (worstPowerPeak.peakShare ?? 0) ||
        ((row.powerPeak.peakShare ?? 0) === (worstPowerPeak.peakShare ?? 0) &&
          row.powerPeak.peakOut > (worstPowerPeak.peakOut ?? 0))
      ) {
        worstPowerPeak = { ...row.powerPeak, stormDate: row.stormDate };
      }
    }
    if (row.internetTrough !== null && row.internetTrough.maxDrop !== null && row.internetTrough.maxDrop > 0) {
      if (
        deepestInternetTrough === null ||
        row.internetTrough.maxDrop > (deepestInternetTrough.maxDrop ?? 0)
      ) {
        deepestInternetTrough = { ...row.internetTrough, stormDate: row.stormDate };
      }
    }
  }

  return {
    totalStorms: rows.length,
    stormsWithSwathWithinRadius,
    stormsWithDirectSwath,
    maxSwathWithinRadius,
    stormsWithReportsWithinRadius,
    totalReportsWithinRadius,
    maxReportSizeIn,
    stormsWithDirectWarnings,
    totalDirectWarnings,
    worstPowerPeak,
    deepestInternetTrough,
  };
}
