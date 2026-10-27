// The size ruler: one mark per size class, drawn as a circle whose diameter scales with
// the radar-estimated hail size in inches. The object names are the common comparison.

export const PX_PER_INCH = 11.2;

export interface Mark {
  threshold_mm: number;
  threshold_in: number;
  object: string;
}

/** The seven size classes of swath.SIZE_CLASSES_MM with their object names. */
export const RULER: readonly Mark[] = [
  { threshold_mm: 19.05, threshold_in: 0.75, object: "penny" },
  { threshold_mm: 25.4, threshold_in: 1.0, object: "quarter" },
  { threshold_mm: 31.75, threshold_in: 1.25, object: "half dollar" },
  { threshold_mm: 38.1, threshold_in: 1.5, object: "walnut" },
  { threshold_mm: 44.45, threshold_in: 1.75, object: "golf ball" },
  { threshold_mm: 50.8, threshold_in: 2.0, object: "hen egg" },
  { threshold_mm: 63.5, threshold_in: 2.5, object: "tennis ball" },
];

export function diameterPx(inches: number): number {
  return inches * PX_PER_INCH;
}

/** The object name for a size class, keyed by threshold_mm; null for an unknown class. */
export function objectName(thresholdMm: number): string | null {
  return RULER.find((m) => m.threshold_mm === thresholdMm)?.object ?? null;
}