// Pure geometry for the threshold curve. No Preact import.

export const WIDTH = 640;
export const HEIGHT = 320;
export const MARGIN = { left: 48, right: 16, top: 16, bottom: 40 } as const;
export const X_MIN_IN = 0.75;
export const X_MAX_IN = 2.5;
export const LITERATURE_HSS = 0.38;

/** Threshold in inches to the plot x: 0.75 in at the left plot edge, 2.50 in at the right. */
export function xOf(thresholdIn: number): number {
  const plot = WIDTH - MARGIN.left - MARGIN.right;
  return MARGIN.left + ((thresholdIn - X_MIN_IN) / (X_MAX_IN - X_MIN_IN)) * plot;
}

/** Dynamic y-axis floor: 0 when all values are non-negative, else stepped down to 0.2 down to -1. */
export function yMinOf(values: readonly (number | null)[]): number {
  let min = 0;
  for (const v of values) {
    if (v !== null && Number.isFinite(v) && v < min) min = v;
  }
  return min >= 0 ? 0 : Math.max(-1, Math.floor(min * 5) / 5);
}

/** Metric value to the plot y: yMin at the bottom plot edge, 1 at the top, clamped to the plot box. */
export function yOf(value: number, yMin = 0): number {
  const plot = HEIGHT - MARGIN.top - MARGIN.bottom;
  const span = 1 - yMin;
  const raw = HEIGHT - MARGIN.bottom - ((value - yMin) / (span > 0 ? span : 1)) * plot;
  return Math.min(HEIGHT - MARGIN.bottom, Math.max(MARGIN.top, raw));
}

/** An SVG path that starts a new M after each null and joins with L otherwise. */
export function pathOf(points: { x: number; y: number | null }[]): string {
  let d = "";
  let open = false;
  for (const p of points) {
    if (p.y === null) {
      open = false;
      continue;
    }
    d += `${open ? "L" : "M"}${p.x} ${p.y}`;
    open = true;
  }
  return d;
}