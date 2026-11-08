// Shared verification radius store across Storms > Score, Scorecard, and Try > Run.
import { useSyncExternalStore } from "preact/compat";

export const DEFAULT_RADIUS_KM = 5;

let customRadius: number | null = null;
const listeners = new Set<() => void>();

export function getRadiusKm(): number {
  return customRadius ?? DEFAULT_RADIUS_KM;
}

function getSnapshot(): number | null {
  return customRadius;
}

export function setRadiusKm(next: number): void {
  const clamped = Math.max(0, Math.min(25, Math.round(next)));
  if (customRadius === clamped) return;
  customRadius = clamped;
  for (const listener of listeners) listener();
}

export function resetRadiusKm(value: number | null = null): void {
  customRadius = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRadiusKm(fallback: number = DEFAULT_RADIUS_KM): [number, (next: number) => void] {
  const radius = useSyncExternalStore(subscribe, getSnapshot);
  return [radius ?? fallback, setRadiusKm];
}

