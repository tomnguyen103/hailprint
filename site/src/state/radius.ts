// Shared verification radius store across Storms > Score, Scorecard, and Try > Run.
import { useSyncExternalStore } from "preact/compat";

export const DEFAULT_RADIUS_KM = 10;

let currentRadius: number = DEFAULT_RADIUS_KM;
const listeners = new Set<() => void>();

export function getRadiusKm(): number {
  return currentRadius;
}

export function setRadiusKm(next: number): void {
  const clamped = Math.max(0, Math.min(20, Math.round(next)));
  if (currentRadius === clamped) return;
  currentRadius = clamped;
  for (const listener of listeners) listener();
}

export function resetRadiusKm(value: number = DEFAULT_RADIUS_KM): void {
  currentRadius = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRadiusKm(): [number, (next: number) => void] {
  const radius = useSyncExternalStore(subscribe, getRadiusKm);
  return [radius, setRadiusKm];
}
