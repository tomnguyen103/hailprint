// Shared verification radius store across Storms > Score, Scorecard, and Try > Run.
import { useSyncExternalStore } from "preact/compat";

const DEFAULT_RADIUS_KM = 5;
// shortcut: DEFAULT_MAX_RADIUS_KM stands in for radius_km_max until the first pairs.json arrives, upgrade when storms.json carries it
export const DEFAULT_MAX_RADIUS_KM = 20;

let customRadius: number | null = null;
const listeners = new Set<() => void>();

/** Return the active verification radius in km, or DEFAULT_RADIUS_KM when unset. */
export function getRadiusKm(): number {
  return customRadius ?? DEFAULT_RADIUS_KM;
}

function getSnapshot(): number | null {
  return customRadius;
}

/** Clamp and round a radius in km to [0, max], or return null for non-finite inputs. */
export function clampRadiusKm(value: number, max: number = DEFAULT_MAX_RADIUS_KM): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(max)) return null;
  const upper = Math.max(0, Math.floor(max));
  return Math.max(0, Math.min(upper, Math.round(value)));
}

/** Set the shared verification radius in km, clamped and rounded to [0, max]. */
export function setRadiusKm(next: number, max: number = DEFAULT_MAX_RADIUS_KM): void {
  const clamped = clampRadiusKm(next, max);
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
export function useRadiusKm(fallback: number = DEFAULT_RADIUS_KM): [number, (next: number, max?: number) => void] {
  const radius = useSyncExternalStore(subscribeRadius, getSnapshot);
  return [radius ?? fallback, setRadiusKm];
}


