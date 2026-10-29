// The pure series math of the storm timeline and the map opening: bars, ticks, runs, the power and internet series, the Harris peak.
// Pure: no MapLibre, no Preact.
import { HARRIS_FIPS, STEPS } from "../data/constants";
import {
  type InternetCounty,
  type InternetFile,
  PHENOMENA,
  type Phenomena,
  type PowerCounty,
  type PowerFile,
  type ReportsFile,
  type WarningsFile,
} from "../data/types";
import { LAST_STEP, STEP_MS, reportStep, stepTime } from "../time/step";
import { dropOf } from "./internet";
import { shareOut } from "./power";

/** The scale of the power row never drops below 1% of customers, so a tiny outage stays a small line. */
const SCALE_FLOOR = 0.01;
/** The internet row always spans at least this much of the baseline, so a tiny drop stays a small line. */
const NET_SPAN_FLOOR = 0.1;

export interface Bar {
  phenomena: Phenomena;
  eventid: number;
  /** Fractional steps, clipped to the window. */
  from: number;
  to: number;
  begin: string;
  end: string;
}

export interface Tick {
  id: number;
  step: number;
  time: string;
  location: string;
  size_in: number;
}

/** One bar per warning polygon inside the window, in row order. A polygon that starts early clips at step 0. */
export function warningBars(file: WarningsFile | null, date: string): Bar[] {
  if (file === null) return [];
  const origin = stepTime(date, 0).getTime();
  const bars = file.features.flatMap(({ properties: p }): Bar[] => {
    const from = Math.max(0, (Date.parse(p.polygon_begin) - origin) / STEP_MS);
    const to = Math.min(STEPS, (Date.parse(p.polygon_end) - origin) / STEP_MS);
    return to > from ? [{ phenomena: p.phenomena, eventid: p.eventid, from, to, begin: p.polygon_begin, end: p.polygon_end }] : [];
  });
  return bars.sort((a, b) => PHENOMENA.indexOf(a.phenomena) - PHENOMENA.indexOf(b.phenomena) || a.from - b.from || a.eventid - b.eventid);
}

/** The row key of a bar. The eventid repeats across types, so the key names the type too. */
export const barKey = (bar: Bar) => `${bar.phenomena}-${bar.eventid}-${bar.begin}`;

/** One tick per report at its report step, earliest first. A report with a bad time has no tick. */
export function reportTicks(file: ReportsFile | null): Tick[] {
  const ticks = (file?.features ?? []).flatMap(({ properties: p }): Tick[] => {
    const step = reportStep(p.time);
    return step === null ? [] : [{ id: p.id, step, time: p.time, location: p.location, size_in: p.size_in }];
  });
  return ticks.sort((a, b) => a.step - b.step || a.id - b.id);
}

/** The step under a click: the share of the strip width, floored, from 0 to 191. */
export function stepAt(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return Math.min(LAST_STEP, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * STEPS)));
}

export interface Run {
  /** The first step of the run and the step after its last one. */
  from: number;
  to: number;
  gap: boolean;
}

/** Split a series into runs of values and runs of nulls. A null step is a gap, never a zero. */
export function runsOf(values: readonly (number | null)[]): Run[] {
  const runs: Run[] = [];
  values.forEach((value, i) => {
    const gap = value === null;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.gap === gap) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, gap });
  });
  return runs;
}

export interface PowerSeries {
  county: PowerCounty;
  /** Share out per step; null where the source has no row. */
  shares: (number | null)[];
  /** The largest share; null when every step is a gap. */
  peak: number | null;
  /** The first step of the peak; null when the peak is null or zero. */
  peakStep: number | null;
  gapSteps: number;
  /** The share at the top of the row: the peak, or 1% when the peak is smaller. */
  scale: number;
}

/** The picked county as shares, with the peak, the gap count and the row scale; null for a file or county that is absent. */
export function powerSeries(file: PowerFile | null, fips: string): PowerSeries | null {
  const county = file?.counties.find((c) => c.fips === fips);
  if (county === undefined) return null;
  const shares = county.out.map((out) => shareOut(out, county.customers));
  let peak: number | null = null;
  let peakStep: number | null = null;
  for (let i = 0; i < shares.length; i++) {
    const share = shares[i] ?? null;
    if (share !== null && (peak === null || share > peak)) {
      peak = share;
      peakStep = share > 0 ? i : null;
    }
  }
  return { county, shares, peak, peakStep, gapSteps: shares.filter((s) => s === null).length, scale: Math.max(peak ?? 0, SCALE_FLOOR) };
}

export interface InternetSeries {
  county: InternetCounty;
  /** Reachability over baseline per step; null where the signal has no points. */
  ratios: (number | null)[];
  /** The lowest ratio; null when every step is a gap. */
  low: number | null;
  /** The first step of the lowest ratio; null when no step is below baseline. */
  lowStep: number | null;
  gapSteps: number;
  /** The ratios at the top and the bottom of the row. The baseline (1) always sits inside: top is 1 or the highest ratio, bottom is 1 or the lowest ratio, held a 10% span below top. */
  top: number;
  bottom: number;
}

/** The picked county as ratios, with the low point, the gap count, and the row scale; null for a file or county that is absent. */
export function internetSeries(file: InternetFile | null, fips: string): InternetSeries | null {
  const county = file?.counties.find((c) => c.fips === fips);
  if (county === undefined) return null;
  const values = county.ratio.filter((r): r is number => r !== null);
  const low = values.length === 0 ? null : Math.min(...values);
  const top = Math.max(1, ...values);
  const lowStep = low !== null && (dropOf(low) ?? 0) > 0 ? county.ratio.indexOf(low) : null;
  return {
    county,
    ratios: county.ratio,
    low,
    lowStep,
    gapSteps: county.ratio.length - values.length,
    top,
    bottom: Math.max(0, Math.min(low ?? 1, 1, top - NET_SPAN_FLOOR)),
  };
}

/** The first step of the largest Harris value; null without a file, with no outage, or with only gaps. */
export function harrisPeak(file: PowerFile | null): number | null {
  const harris = file?.counties.find((c) => c.fips === HARRIS_FIPS);
  if (harris === undefined) return null;
  let peak: number | null = null;
  let best = 0;
  harris.out.forEach((value, step) => {
    if (value !== null && value > best) {
      best = value;
      peak = step;
    }
  });
  return peak;
}
