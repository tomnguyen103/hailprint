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

const NUM_TOKEN_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%?)$/i;
const HUE_TOKEN_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)?$/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COMMA_RE = /^rgba?\(\s*([^,\s)]+)\s*,\s*([^,\s)]+)\s*,\s*([^,\s)]+)(?:\s*,\s*([^,\s)]+))?\s*\)$/i;
const RGB_SPACE_RE = /^rgba?\(\s*([^\s/,)]+)\s+([^\s/,)]+)\s+([^\s/,)]+)(?:\s*\/\s*([^\s/,)]+))?\s*\)$/i;
const OKLCH_RE = /^oklch\(\s*([^\s/,)]+)\s+([^\s/,)]+)\s+([^\s/,)]+)(?:\s*\/\s*([^\s/,)]+))?\s*\)$/i;
const LAB_RE = /^lab\(\s*([^\s/,)]+)\s+([^\s/,)]+)\s+([^\s/,)]+)(?:\s*\/\s*([^\s/,)]+))?\s*\)$/i;

function parseNumToken(tokenStr: string, allowNone = false): { value: number; pct: boolean } | null {
  if (allowNone && tokenStr.toLowerCase() === "none") return { value: 0, pct: false };
  const m = NUM_TOKEN_RE.exec(tokenStr);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? { value, pct: m[2] === "%" } : null;
}

function validAlpha(alpha: string | undefined, allowNone = false): boolean {
  return alpha === undefined || parseNumToken(alpha, allowNone) !== null;
}

function hexByte(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");
}

function linearSrgbToHex(rLin: number, gLin: number, bLin: number): string {
  const toByte = (c: number): number => {
    const clamped = Math.max(0, Math.min(1, c));
    const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    return gamma * 255;
  };
  return `#${hexByte(toByte(rLin))}${hexByte(toByte(gLin))}${hexByte(toByte(bLin))}`;
}

function parseHexColor(trimmed: string): string | null {
  const m = HEX_COLOR_RE.exec(trimmed);
  if (!m) return null;
  const h = m[1]!.toLowerCase();
  if (h.length <= 4) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  return `#${h.slice(0, 6)}`;
}

function parseRgbColor(trimmed: string): string | null {
  const commaMatch = RGB_COMMA_RE.exec(trimmed);
  const m = commaMatch ?? RGB_SPACE_RE.exec(trimmed);
  const allowNone = commaMatch === null;
  if (!m || !validAlpha(m[4], allowNone)) return null;
  const rTok = parseNumToken(m[1]!, allowNone);
  const gTok = parseNumToken(m[2]!, allowNone);
  const bTok = parseNumToken(m[3]!, allowNone);
  if (!rTok || !gTok || !bTok) return null;
  const toChannel = (tok: { value: number; pct: boolean }): number => (tok.pct ? (tok.value / 100) * 255 : tok.value);
  return `#${hexByte(toChannel(rTok))}${hexByte(toChannel(gTok))}${hexByte(toChannel(bTok))}`;
}

function parseOklchColor(trimmed: string): string | null {
  const m = OKLCH_RE.exec(trimmed);
  if (!m || !validAlpha(m[4], true)) return null;
  const lTok = parseNumToken(m[1]!, true);
  const cTok = parseNumToken(m[2]!, true);
  if (!lTok || !cTok) return null;

  let hRad = 0;
  if (m[3]!.toLowerCase() !== "none") {
    const hMatch = HUE_TOKEN_RE.exec(m[3]!);
    if (!hMatch) return null;
    const hVal = Number(hMatch[1]);
    if (!Number.isFinite(hVal)) return null;
    const unit = hMatch[2]?.toLowerCase() ?? "deg";
    hRad =
      unit === "rad"
        ? hVal
        : unit === "grad"
          ? (hVal * Math.PI) / 200
          : unit === "turn"
            ? hVal * 2 * Math.PI
            : (hVal * Math.PI) / 180;
  }

  const L = Math.max(0, Math.min(1, lTok.pct ? lTok.value / 100 : lTok.value));
  const C = Math.max(0, cTok.pct ? cTok.value * 0.004 : cTok.value);
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const mCube = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = 4.0767416621 * l - 3.3077115913 * mCube + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * mCube - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * mCube + 1.707614701 * s;
  return linearSrgbToHex(rLin, gLin, bLin);
}

function parseLabColor(trimmed: string): string | null {
  const m = LAB_RE.exec(trimmed);
  if (!m || !validAlpha(m[4], true)) return null;
  const lTok = parseNumToken(m[1]!, true);
  const aTok = parseNumToken(m[2]!, true);
  const bTok = parseNumToken(m[3]!, true);
  if (!lTok || !aTok || !bTok) return null;

  const L = Math.max(0, Math.min(100, lTok.value));
  if (L === 0) return "#000000";
  if (L === 100) return "#ffffff";
  const a = aTok.pct ? aTok.value * 1.25 : aTok.value;
  const b = bTok.pct ? bTok.value * 1.25 : bTok.value;

  // W3C CSS Color 4: CIE Lab (D50) -> XYZ (D50) -> Bradford XYZ (D65) -> linear sRGB
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const f1 = (L + 16) / 116;
  const f0 = a / 500 + f1;
  const f2 = f1 - b / 200;
  const x = f0 * f0 * f0 > epsilon ? f0 * f0 * f0 : (116 * f0 - 16) / kappa;
  const y = L > kappa * epsilon ? f1 * f1 * f1 : L / kappa;
  const z = f2 * f2 * f2 > epsilon ? f2 * f2 * f2 : (116 * f2 - 16) / kappa;

  const X50 = x * (0.3457 / 0.3585);
  const Y50 = y;
  const Z50 = z * ((1.0 - 0.3457 - 0.3585) / 0.3585);

  const X65 = 0.9554734527042182 * X50 - 0.023098536874261423 * Y50 + 0.0632593086610217 * Z50;
  const Y65 = -0.028369706963208136 * X50 + 1.0099954580058226 * Y50 + 0.021041398966943008 * Z50;
  const Z65 = 0.012314001688319899 * X50 - 0.020507696433477912 * Y50 + 1.3303659366080753 * Z50;

  const rLin = 3.2409699419045213 * X65 - 1.5373831775700935 * Y65 - 0.4986107602930033 * Z65;
  const gLin = -0.9692436362808798 * X65 + 1.8759675015077206 * Y65 + 0.04155505740717561 * Z65;
  const bLin = 0.05563007969699361 * X65 - 0.20397695888897657 * Y65 + 1.0569715142428786 * Z65;
  return linearSrgbToHex(rLin, gLin, bLin);
}

/** Normalize a CSS Color 4 string (lab, oklch, rgb/rgba, or hex) to lowercase `#rrggbb` for MapLibre GL and bitmap consumers. */
export function oklchToHex(value: string): string {
  const trimmed = value.trim();
  return parseHexColor(trimmed) ?? parseRgbColor(trimmed) ?? parseOklchColor(trimmed) ?? parseLabColor(trimmed) ?? value;
}

/** A design token's current value, read from the document so the theme drives it. */
export function token(name: string): string {
  return oklchToHex(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
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
