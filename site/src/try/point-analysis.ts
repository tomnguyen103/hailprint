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
import { dropOf } from "../impact/internet";
import { shareOut } from "../impact/power";
import {
  type DirectWarning,
  type ReportsProximity,
  type SwathDistance,
  type SwathExposure,
  type WarningsAtPoint,
  reportsWithinRadius,
  swathExposureAt,
  warningsAtPoint,
} from "../storms/map/geo";
import { readout } from "../time/step";

export interface PowerPeakSummary {
  fips: string;
  countyName: string;
  customers: number;
  peakOut: number | null;
  peakShare: number | null;
  peakStep: number | null;
  peakTimeUtc: string | null;
  source: "eaglei" | "odin";
  utilities: string[] | null;
}

export interface InternetTroughSummary {
  fips: string;
  countyName: string;
  baseline: number | null;
  minRatio: number | null;
  maxDrop: number | null;
  troughStep: number | null;
  troughTimeUtc: string | null;
}

/** Peak utility customer outage across the 192-step impact window for one Metro county. */
export function powerSeriesPeak(
  file: PowerFile | null,
  fips: string | null,
  stormDate?: string,
): PowerPeakSummary | null {
  if (file === null || fips === null) return null;
  const county = file.counties.find((c) => c.fips === fips);
  if (county === undefined) return null;
  let peakOut: number | null = null;
  let peakStep: number | null = null;
  for (let step = 0; step < county.out.length; step++) {
    const val = county.out[step] ?? null;
    if (val !== null && (peakOut === null || val > peakOut)) {
      peakOut = val;
      peakStep = val > 0 ? step : null;
    }
  }
  const peakShare = peakOut === null ? null : shareOut(peakOut, county.customers);
  const date = stormDate ?? file.receipt.storm_date;
  const peakTimeUtc = peakStep !== null ? readout(date, peakStep).utc : null;
  return {
    fips: county.fips,
    countyName: county.name,
    customers: county.customers,
    peakOut,
    peakShare,
    peakStep,
    peakTimeUtc,
    source: file.source,
    utilities: file.utilities,
  };
}

/** Deepest internet reachability trough across the 192-step impact window for one Metro county. */
export function internetSeriesTrough(
  file: InternetFile | null,
  fips: string | null,
  stormDate?: string,
): InternetTroughSummary | null {
  if (file === null || fips === null) return null;
  const county = file.counties.find((c) => c.fips === fips);
  if (county === undefined) return null;
  let minRatio: number | null = null;
  let minStep: number | null = null;
  for (let step = 0; step < county.ratio.length; step++) {
    const val = county.ratio[step] ?? null;
    if (val !== null && (minRatio === null || val < minRatio)) {
      minRatio = val;
      minStep = step;
    }
  }
  const maxDrop = dropOf(minRatio);
  const troughStep = maxDrop !== null && maxDrop > 0 ? minStep : null;
  const date = stormDate ?? file.receipt.storm_date;
  const troughTimeUtc = troughStep !== null ? readout(date, troughStep).utc : null;
  return {
    fips: county.fips,
    countyName: county.name,
    baseline: county.baseline,
    minRatio,
    maxDrop,
    troughStep,
    troughTimeUtc,
  };
}

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
  swath: SwathExposure;
  reportsWithinRadius: ReportsProximity;
  warningsAtPoint: WarningsAtPoint;
  directWarnings: DirectWarning[];
  warningCounts: Record<Phenomena, number>;
  firstWarningStep: number | null;
  powerPeak: PowerPeakSummary | null;
  internetTrough: InternetTroughSummary | null;
  hasActivityNearPin: boolean;
  receipts: {
    swath: Receipt | null;
    reports: Receipt | null;
    warnings: Receipt | null;
    power: Receipt | null;
    internet: Receipt | null;
  };
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
  const exposure: SwathExposure = {
    ...rawExposure,
    covering,
    withinRadius,
  };
  const reportsProx = reportsWithinRadius(point, reports, radiusKm);
  const warnProx = warningsAtPoint(point, warnings, stormDate);
  const powerPeak = powerSeriesPeak(power, fips, stormDate);
  const internetTrough = internetSeriesTrough(internet, fips, stormDate);
  const hasActivityNearPin =
    withinRadius !== null || reportsProx.count > 0 || warnProx.directWarnings.length > 0;

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
    swath: exposure,
    reportsWithinRadius: reportsProx,
    warningsAtPoint: warnProx,
    directWarnings: warnProx.directWarnings,
    warningCounts: warnProx.warningCounts,
    firstWarningStep: warnProx.firstWarningStep,
    powerPeak,
    internetTrough,
    hasActivityNearPin,
    receipts: {
      swath: swath?.receipt ?? null,
      reports: reports?.receipt ?? null,
      warnings: warnings?.receipt ?? null,
      power: power?.receipt ?? null,
      internet: internet?.receipt ?? null,
    },
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
