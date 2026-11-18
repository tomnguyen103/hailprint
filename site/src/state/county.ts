// Metro county hit-testing and shared selected county store for Storms workspace and GlobalSearch.
import type { FeatureCollection, MultiPolygon } from "geojson";
import { useSyncExternalStore } from "preact/compat";
import { HARRIS_FIPS, METRO_FIPS } from "../data/constants";
import { containsPoint } from "../geometry";

/**
 * The fips of the metro county that holds a map point, or null outside all of them.
 * A hidden layer answers no `queryRenderedFeatures`, so the pick tests the outlines itself.
 */
export function countyAt(lngLat: [number, number], outlines: FeatureCollection<MultiPolygon> | null): string | null {
  const hit = outlines?.features.find((outline) => containsPoint(outline.geometry, lngLat));
  return hit === undefined ? null : String(hit.properties?.["fips"]);
}

let selectedCounty: string = HARRIS_FIPS;
const listeners = new Set<() => void>();

/** Return the active 5-digit metro county FIPS code (defaults to Harris County). */
export function getSelectedCounty(): string {
  return selectedCounty;
}

/** Update the active metro county when `fips` is a known metro FIPS code. */
export function setSelectedCounty(fips: string): void {
  if (!(METRO_FIPS as readonly string[]).includes(fips) || selectedCounty === fips) return;
  selectedCounty = fips;
  for (const listener of listeners) listener();
}

/** Reset the selected county to Harris County. */
export function resetSelectedCounty(): void {
  setSelectedCounty(HARRIS_FIPS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to the shared selected metro county FIPS code. */
export function useSelectedCounty(): [string, (fips: string) => void] {
  return [useSyncExternalStore(subscribe, getSelectedCounty), setSelectedCounty];
}
