// Shared verification radius store across Storms > Score, Scorecard, and Try > Run.
import { useSyncExternalStore } from "preact/compat";

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 20;

let customRadius: number | null = null;
const listeners = new Set<() => void>();

/** Return the active verification radius in km, or DEFAULT_RADIUS_KM when unset. */
export function getRadiusKm(): number {
  return customRadius ?? DEFAULT_RADIUS_KM;
}

function getSnapshot(): number | null {
  return customRadius;
}

function clampRadiusKm(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(MAX_RADIUS_KM, Math.round(value)));
}

/** Set the shared verification radius in km, clamped and rounded to [0, 20]. */
export function setRadiusKm(next: number): void {
  const clamped = clampRadiusKm(next);
  if (clamped === null || customRadius === clamped) return;
  customRadius = clamped;
  for (const listener of listeners) listener();
}

/** Reset the shared verification radius to null (or a clamped integer override). */
export function resetRadiusKm(value: number | null = null): void {
  const next = value === null ? null : clampRadiusKm(value);
  if (value !== null && next === null) return;
  if (customRadius === next) return;
  customRadius = next;
  for (const listener of listeners) listener();
}

/** Subscribe a listener to shared verification radius updates. */
export function subscribeRadius(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to the shared verification radius with a caller-provided default fallback. */
export function useRadiusKm(fallback: number = DEFAULT_RADIUS_KM): [number, (next: number) => void] {
  const radius = useSyncExternalStore(subscribeRadius, getSnapshot);
  return [radius ?? fallback, setRadiusKm];
}


