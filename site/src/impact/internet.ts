// The internet county fill: drop below baseline, bins, and the county features at a step.
// Pure: no MapLibre, no Preact. The drop rule matches `internet.drop` in src/hailprint/internet.py.
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import type { InternetFile, PowerFile } from "../data/types";
import type { Load } from "../state/load";
import { binOf, type FillSpec } from "./fill-spec";

/** The drop where each bin starts after the zero bin: 2, 5, 10, and 20 percent. `design.md` holds the same four numbers. */
const EDGES = [0.02, 0.05, 0.1, 0.2] as const;

/** The five bins that draw a fill, lightest first. */
type Filled = "--net-1" | "--net-2" | "--net-3" | "--net-4" | "--net-5";
const FILLED: readonly Filled[] = ["--net-1", "--net-2", "--net-3", "--net-4", "--net-5"];

/** A bin is a design token name, `none` for no drop, or `gap` for a step the signal did not report. */
export type NetBin = "none" | "gap" | Filled;

/** The drop below baseline as a fraction, rounded to 3 decimals like `internet.drop`; a ratio above 1 is no drop. */
export function dropOf(ratio: number | null): number | null {
  if (ratio === null) return null;
  return Math.max(0, Math.round((1 - ratio) * 1000) / 1000);
}

const edgePercent = (edge: number) => String(Math.round(edge * 100));
const FROM = [0, ...EDGES];

/** The internet fill spec: the edges, the five filled bins, and the legend text from the same edges. */
export const NET_FILL: FillSpec<Filled> = {
  edges: EDGES,
  bins: FILLED,
  labels: FROM.map((from, i) =>
    i === 0
      ? `above 0 to ${edgePercent(FROM[1]!)}%`
      : i === EDGES.length
        ? `${edgePercent(from)}% or more`
        : `${edgePercent(from)} to ${edgePercent(FROM[i + 1]!)}%`,
  ),
  bin: (drop) => binOf(EDGES, FILLED, drop),
};

/** True for an internet file; a power file has a `source` and no `signal`. */
export function isInternet(file: PowerFile | InternetFile | null): file is InternetFile {
  return file !== null && "signal" in file;
}

/** The one line the fill control shows when the internet file is missing or failed; null when nothing is wrong. */
export function internetNote(file: string | null, load: Load<InternetFile | null>): string | null {
  if (file === null) return "No internet file for this storm date.";
  return load.status === "error" ? `Internet reachability off. ${load.error.message}` : null;
}

export interface InternetProps {
  fips: string;
  name: string;
  drop: number | null;
  bin: NetBin;
}

export type InternetFeature = Feature<MultiPolygon, InternetProps>;

/** The metro outlines with the drop and bin at one step. A county or step the file lacks is a gap. */
export function internetFeatures(
  outlines: FeatureCollection<MultiPolygon> | null,
  file: InternetFile | null,
  step: number,
): FeatureCollection<MultiPolygon, InternetProps> {
  const features = (outlines?.features ?? []).map((outline): InternetFeature => {
    const fips = String(outline.properties?.["fips"]);
    const county = file?.counties.find((c) => c.fips === fips);
    const drop = county === undefined ? null : dropOf(county.ratio[step] ?? null);
    return {
      type: "Feature",
      properties: { fips, name: String(outline.properties?.["name"]), drop, bin: NET_FILL.bin(drop) },
      geometry: outline.geometry,
    };
  });
  return { type: "FeatureCollection", features };
}
