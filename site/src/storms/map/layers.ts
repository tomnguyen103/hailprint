// Layer specifications for the swath, the warnings, the county outline, and the report points.
import type { Feature, FeatureCollection, MultiPolygon, Point } from "geojson";
import type { LayerSpecification } from "maplibre-gl";
import { PHENOMENA, type Phenomena, type ReportsFile, type WarningProps, type WarningsFile } from "../../data/types";
import { NET_FILL } from "../../impact/internet";
import { POWER_FILL as POWER_FILL_SPEC } from "../../impact/power";
import { WARNING_STYLES } from "../../impact/warning-styles";
import { RULER } from "../../ruler";
import type { Load } from "../../state/load";
import { reportStep, stepTime } from "../../time/step";

export type Theme = "light" | "dark";

export const SWATH_SOURCE = "swath";
export const COUNTY_SOURCE = "county";
export const REPORTS_SOURCE = "reports";
export const POINT_SOURCE = "point";
export const WARNINGS_SOURCE = "warnings";
/** The county fill layers below draw the power fill or the internet fill, one at a time. */
export const POWER_SOURCE = "power";
export const POWER_FILL = "power-fill";
export const POWER_GAP = "power-gap";
export const POWER_OUTLINE = "power-outline";
/** The id of the 45 degree hatch image that marks a county step with no source row. */
export const POWER_HATCH = "power-hatch";
export const POWER_LAYER_IDS = [POWER_FILL, POWER_GAP, POWER_OUTLINE] as const;
export const FILL_OPACITY = 0.78;
/** The county fill lets the basemap show through. */
export const POWER_OPACITY = 0.75;
/** A report after the slider step draws at this opacity. */
export const REPORT_FADED = 0.3;
/** The warning labels show from this zoom up; below it they crowd the county. */
export const TAG_ZOOM = 9;
/** The warning outline width in px, from design.md. */
export const LINE_PX = 2;

/** The map layers the control switches. */
export type LayerName = "swath" | "reports" | "warnings";

/** A design token's current value, read from the document so the theme drives it. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function fillLayerId(thresholdMm: number): string {
  return `swath-fill-${thresholdMm}`;
}

export function fillLayers(): LayerSpecification[] {
  return RULER.map((mark, i) => ({
    id: fillLayerId(mark.threshold_mm),
    type: "fill",
    source: SWATH_SOURCE,
    filter: ["==", ["get", "threshold_mm"], mark.threshold_mm],
    paint: { "fill-color": token(`--hail-${i + 1}`), "fill-opacity": FILL_OPACITY },
  }));
}

export const REPORTS_LAYER = "report-points";

type FillColor = NonNullable<Extract<LayerSpecification, { type: "fill" }>["paint"]>["fill-color"];
type LineColor = NonNullable<Extract<LayerSpecification, { type: "line" }>["paint"]>["line-color"];

/** The bins that draw a county fill: the power ramp and the internet ramp. Their token names differ, so one layer serves both. */
const COUNTY_BINS: readonly string[] = [...POWER_FILL_SPEC.bins, ...NET_FILL.bins];

/** The fill colour of a county: the bin name picks its `--out-N` or `--net-N` token. A zero or missing bin has no colour. */
export function powerFillColor(): FillColor {
  const match = ["match", ["get", "bin"], ...COUNTY_BINS.flatMap((bin) => [bin, token(bin)]), "rgba(0,0,0,0)"];
  return match as unknown as FillColor;
}

/** The contour stroke colour of each swath size class from `--hail-1` to `--hail-7`. */
export function swathOutlineColor(): LineColor {
  const expr = [
    "case",
    ...RULER.flatMap((mark, i) => [["==", ["get", "threshold_mm"], mark.threshold_mm], token(`--hail-${i + 1}`)]),
    token("--rule"),
  ];
  return expr as unknown as LineColor;
}

/** The power layers, all hidden: the fill for the five bins, the hatch for a gap, and the county outline. A zero bin draws nothing. */
export function powerLayers(): LayerSpecification[] {
  return [
    {
      id: POWER_FILL,
      type: "fill",
      source: POWER_SOURCE,
      layout: { visibility: "none" },
      filter: ["in", ["get", "bin"], ["literal", [...COUNTY_BINS]]],
      paint: { "fill-color": powerFillColor(), "fill-opacity": POWER_OPACITY },
    },
    {
      id: POWER_GAP,
      type: "fill",
      source: POWER_SOURCE,
      layout: { visibility: "none" },
      filter: ["==", ["get", "bin"], "gap"],
      paint: { "fill-pattern": POWER_HATCH },
    },
    {
      id: POWER_OUTLINE,
      type: "line",
      source: POWER_SOURCE,
      layout: { visibility: "none" },
      paint: { "line-color": token("--ink-muted"), "line-width": 1, "line-dasharray": [3, 2] },
    },
  ];
}

/** The power paint that changes with the theme; the map handle applies it only while the fill shows. */
export function powerPaint(): Record<string, Record<string, unknown>> {
  return {
    [POWER_FILL]: { "fill-color": powerFillColor() },
    [POWER_OUTLINE]: { "line-color": token("--ink-muted") },
  };
}

export function warningLayerId(phenomena: Phenomena): string {
  return `warnings-${phenomena.toLowerCase()}`;
}

export function warningLayers(): LayerSpecification[] {
  return PHENOMENA.map((phenomena): LayerSpecification => {
    const style = WARNING_STYLES[phenomena];
    return {
      id: warningLayerId(phenomena),
      type: "line",
      source: WARNINGS_SOURCE,
      filter: ["==", ["get", "phenomena"], phenomena],
      paint: { "line-color": token(style.token), "line-width": LINE_PX, ...(style.dash ? { "line-dasharray": style.dash } : {}) },
    };
  });
}

type WarningFeature = Feature<MultiPolygon, WarningProps>;

/**
 * The warnings in force at a step: begin at or before the step's start, end after it.
 * shortcut: a warning shorter than one step can fall between two steps and never draw; draw the span when the data holds one.
 */
export function activeWarnings(file: WarningsFile | null, date: string, step: number): WarningFeature[] {
  if (file === null) return [];
  const at = stepTime(date, step).getTime();
  return file.features.filter((f) => Date.parse(f.properties.polygon_begin) <= at && at < Date.parse(f.properties.polygon_end));
}

/** The reports with an `alpha`: full up to the cutoff step, faded after it; a bad time or no cutoff stays full. */
export function reportsAtStep(reports: ReportsFile | null, cutoff: number | null): FeatureCollection<Point> {
  const features = (reports?.features ?? []).map((f) => {
    const at = cutoff === null ? null : reportStep(f.properties.time);
    const alpha = cutoff === null || at === null || at <= cutoff ? 1 : REPORT_FADED;
    return { ...f, properties: { ...f.properties, alpha } };
  });
  return { type: "FeatureCollection", features };
}

export interface WarningTag {
  lngLat: [number, number];
  text: Phenomena;
}

/**
 * The middle of the bounding box of the largest outer ring; null when the geometry has no ring.
 * shortcut: the box centre can sit outside a concave polygon; use a pole of inaccessibility when a label lands off its shape.
 */
export function labelPoint(geometry: MultiPolygon): [number, number] | null {
  let best: [number, number] | null = null;
  let bestArea = -1;
  for (const polygon of geometry.coordinates) {
    const ring = polygon[0];
    if (ring === undefined || ring.length === 0) continue;
    const xs = ring.map((p) => p[0]!);
    const ys = ring.map((p) => p[1]!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] as [number, number, number, number];
    const area = (x1 - x0) * (y1 - y0);
    if (area > bestArea) {
      bestArea = area;
      best = [(x0 + x1) / 2, (y0 + y1) / 2];
    }
  }
  return best;
}

/** One text label per warning that has a polygon. */
export function warningTags(features: WarningFeature[]): WarningTag[] {
  return features.flatMap((f) => {
    const lngLat = labelPoint(f.geometry);
    return lngLat === null ? [] : [{ lngLat, text: f.properties.phenomena }];
  });
}

export interface CountyTag {
  lngLat: [number, number];
  text: string;
}

/** One label per county that has a polygon; `text` gives the label from the county's properties, such as the name and a percent. */
export function countyTags<P>(features: Feature<MultiPolygon, P>[], text: (props: P) => string): CountyTag[] {
  return features.flatMap((f) => {
    const lngLat = labelPoint(f.geometry);
    return lngLat === null ? [] : [{ lngLat, text: text(f.properties) }];
  });
}

/** The one line the layers control shows when the warnings file is missing or failed; null when nothing is wrong. */
export function warningsNote(file: string | null, load: Load<WarningsFile | null>): string | null {
  if (file === null) return "No warnings file for this storm date.";
  return load.status === "error" ? `Warnings off. ${load.error.message}` : null;
}

export function chromeLayers(): LayerSpecification[] {
  return [
    {
      id: "swath-outline",
      type: "line",
      source: SWATH_SOURCE,
      paint: { "line-color": swathOutlineColor(), "line-width": 1.25 },
    },
    {
      id: "county-line",
      type: "line",
      source: COUNTY_SOURCE,
      paint: { "line-color": token("--ink"), "line-width": 1.5 },
    },
    {
      id: REPORTS_LAYER,
      type: "circle",
      source: REPORTS_SOURCE,
      paint: {
        "circle-radius": 5,
        "circle-color": token("--report"),
        "circle-stroke-width": 2,
        "circle-stroke-color": token("--sheet"),
        "circle-opacity": ["coalesce", ["get", "alpha"], 1],
        "circle-stroke-opacity": ["coalesce", ["get", "alpha"], 1],
      },
    },
    {
      id: "point-check",
      type: "circle",
      source: POINT_SOURCE,
      paint: {
        "circle-radius": 6,
        "circle-color": token("--report"),
        "circle-stroke-width": 2,
        "circle-stroke-color": token("--sheet"),
      },
    },
  ];
}

/** The paint properties that change with the theme, by layer id. */
export type PaintName = "fill-color" | "line-color" | "circle-color" | "circle-stroke-color";

export function themedPaint(): Record<string, Partial<Record<PaintName, unknown>>> {
  const paint: Record<string, Partial<Record<PaintName, unknown>>> = {};
  for (const layer of [...fillLayers(), ...warningLayers(), ...chromeLayers()]) {
    const colours = Object.entries(layer.paint ?? {}).filter(([key]) => key.endsWith("-color"));
    paint[layer.id] = Object.fromEntries(colours) as Partial<Record<PaintName, unknown>>;
  }
  return paint;
}
