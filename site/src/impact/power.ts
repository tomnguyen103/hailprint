// The power county fill: share out, bins, the Harris peak, and the county features at a step.
// Pure: no MapLibre, no Preact. The bin edges match BIN_EDGES in src/hailprint/power.py.
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import type { PowerFile } from "../data/types";
import type { Load } from "../state/load";

/** The 8 metro counties in the order `power.json` lists them: Harris first. */
export const METRO_FIPS = ["48201", "48157", "48339", "48039", "48167", "48473", "48291", "48071"] as const;
export const HARRIS_FIPS = METRO_FIPS[0];

/** The share out where each bin starts after the zero bin; `power.py` holds the same four numbers. */
export const BIN_EDGES = [0.01, 0.05, 0.15, 0.3] as const;

/** A bin is a design token name, `none` for a zero share, or `gap` for a step the source did not report. */
export type Bin = "none" | "gap" | "--out-1" | "--out-2" | "--out-3" | "--out-4" | "--out-5";
export type Fill = "none" | "power";

/** The five bins that draw a fill, lightest first. */
export const FILLED_BINS: readonly Bin[] = ["--out-1", "--out-2", "--out-3", "--out-4", "--out-5"];

/** The label an ODIN file carries: ODIN lists CenterPoint outages only. */
export const ODIN_LABEL = "CenterPoint customers only";
export const ODIN_BOUND = "Lower bound: other utilities are not counted.";

/** Customers out over customers; a null step stays null, never zero. */
export function shareOut(out: number | null, customers: number): number | null {
  return out === null ? null : out / customers;
}

export function shareBin(share: number | null): Bin {
  if (share === null || Number.isNaN(share)) return "gap";
  if (share === 0) return "none";
  const below = BIN_EDGES.filter((edge) => share >= edge).length;
  return FILLED_BINS[below]!;
}

/** A share as a percent with one decimal; a tiny share reads `<0.1%` so it never rounds to zero. */
export function percentText(share: number | null): string {
  if (share === null) return "no data";
  if (share === 0) return "0%";
  const percent = share * 100;
  return percent < 0.05 ? "<0.1%" : `${percent.toFixed(1)}%`;
}

const edgePercent = (edge: number) => String(Math.round(edge * 100));
const FROM = [0, ...BIN_EDGES];

/** The legend text of the five filled bins, from the same edges as the bins. */
export const BIN_LABELS: readonly string[] = FROM.map((from, i) =>
  i === BIN_EDGES.length ? `${edgePercent(from)}% or more` : `${edgePercent(from)} to ${edgePercent(FROM[i + 1]!)}%`,
);

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

/** The one line the fill control shows when the power file is missing or failed; null when nothing is wrong. */
export function powerNote(file: string | null, load: Load<PowerFile | null>): string | null {
  if (file === null) return "No power file for this storm date.";
  return load.status === "error" ? `Power off. ${load.error.message}` : null;
}

export interface CountyProps {
  fips: string;
  name: string;
  share: number | null;
  bin: Bin;
}

export type CountyFeature = Feature<MultiPolygon, CountyProps>;

/** The metro outlines with the share and bin at one step. A county or step the file lacks is a gap. */
export function countyFeatures(
  outlines: FeatureCollection<MultiPolygon> | null,
  file: PowerFile | null,
  step: number,
): FeatureCollection<MultiPolygon, CountyProps> {
  const features = (outlines?.features ?? []).map((outline): CountyFeature => {
    const fips = String(outline.properties?.["fips"]);
    const county = file?.counties.find((c) => c.fips === fips);
    const share = county === undefined ? null : shareOut(county.out[step] ?? null, county.customers);
    return {
      type: "Feature",
      properties: { fips, name: String(outline.properties?.["name"]), share, bin: shareBin(share) },
      geometry: outline.geometry,
    };
  });
  return { type: "FeatureCollection", features };
}

/** A `#rrggbb` token as three bytes. */
export function hexRgb(hex: string): [number, number, number] {
  const found = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (found === null) throw new Error(`expected #rrggbb, got "${hex}"`);
  return [parseInt(found[1]!, 16), parseInt(found[2]!, 16), parseInt(found[3]!, 16)];
}

/** One tile of the 45 degree hatch that marks a gap: a solid diagonal on a clear ground. */
export function hatchPixels(rgb: [number, number, number], size = 8): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size; i++) data.set([...rgb, 255], (i * size + i) * 4);
  return { width: size, height: size, data };
}
