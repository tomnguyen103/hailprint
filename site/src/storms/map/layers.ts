// Layer specifications for the swath, the county outline, and the report points.
import type { LayerSpecification } from "maplibre-gl";
import { RULER } from "../../ruler";

export type Theme = "light" | "dark";

export const SWATH_SOURCE = "swath";
export const COUNTY_SOURCE = "county";
export const REPORTS_SOURCE = "reports";
export const POINT_SOURCE = "point";
export const FILL_OPACITY = 0.85;

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

export function chromeLayers(): LayerSpecification[] {
  return [
    {
      id: "swath-outline",
      type: "line",
      source: SWATH_SOURCE,
      paint: { "line-color": token("--rule"), "line-width": 0.75 },
    },
    {
      id: "county-line",
      type: "line",
      source: COUNTY_SOURCE,
      paint: { "line-color": token("--ink"), "line-width": 1.5 },
    },
    {
      id: "report-points",
      type: "circle",
      source: REPORTS_SOURCE,
      paint: {
        "circle-radius": 5,
        "circle-color": token("--report"),
        "circle-stroke-width": 2,
        "circle-stroke-color": token("--sheet"),
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

export function themedPaint(): Record<string, Partial<Record<PaintName, string>>> {
  const paint: Record<string, Partial<Record<PaintName, string>>> = {};
  for (const layer of [...fillLayers(), ...chromeLayers()]) {
    const colours = Object.entries(layer.paint ?? {}).filter(([key]) => key.endsWith("-color"));
    paint[layer.id] = Object.fromEntries(colours) as Partial<Record<PaintName, string>>;
  }
  return paint;
}