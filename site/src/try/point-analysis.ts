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
  type ReportsProximity,
  type SwathDistance,
  reportsWithinRadius,
  swathExposureAt,
  warningsAtPoint,
} from "../storms/map/geo";

export { type InternetTroughSummary, type PowerPeakSummary, internetSeriesTrough, powerSeriesPeak };

export interface AnalyzeStormInput {
  storm: Storm;
  point: [number, number];
  radiusKm: number;
  fips: string | null;
  swath: SwathFile | null;
  reports: ReportsFile | null;
  warnings: WarningsFile | null;
  power: PowerFile | null;
  internet: InternetFile | null;
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

/** Pure per-storm proximity & outage analysis for a pinned coordinate and Metro county FIPS. */
export function analyzeStormAtPin(input: AnalyzeStormInput): StormPinRow {
  const { storm, point, radiusKm, fips, swath, reports, warnings, power, internet } = input;
  const stormDate = storm.storm_date;
  const cropStatus = cropStatusAt(point, radiusKm);
  const rawExposure = swathExposureAt(swath, point, radiusKm);
  const covering = cropStatus === "outside-crop" ? null : rawExposure.covering;
  const withinRadius = cropStatus === "outside-crop" ? null : rawExposure.withinRadius;
  const nearest = rawExposure.nearest;
  const reportsProx = reportsWithinRadius(point, reports, radiusKm);
  const warnProx = warningsAtPoint(point, warnings, stormDate, radiusKm);
  const powerPeak = powerSeriesPeak(power, fips, stormDate);
  const internetTrough = internetSeriesTrough(internet, fips, stormDate);
  const hasActivityNearPin =
    withinRadius !== null ||
    reportsProx.count > 0 ||
    warnProx.directWarnings.length > 0 ||
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
    nearest,
    reportsWithinRadius: reportsProx,
    directWarnings: warnProx.directWarnings,
    nearbyWarnings: warnProx.nearbyWarnings,
    warningCounts: warnProx.warningCounts,
    firstWarningStep: warnProx.firstWarningStep,
    powerPeak,
    internetTrough,
    hasActivityNearPin,
    swathReceipt: swath?.receipt ?? null,
  };
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
