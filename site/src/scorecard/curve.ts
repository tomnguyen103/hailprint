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

/** Metric value to the plot y: 0 at the bottom plot edge, 1 at the top. */
export function yOf(value: number): number {
  const plot = HEIGHT - MARGIN.top - MARGIN.bottom;
  return HEIGHT - MARGIN.bottom - value * plot;
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