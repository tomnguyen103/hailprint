import type { FeatureCollection, MultiPolygon } from "geojson";
import { containsPoint } from "../geometry";

/**
 * The fips of the metro county that holds a map point, or null outside all of them.
 * A hidden layer answers no `queryRenderedFeatures`, so the pick tests the outlines itself.
 */
export function countyAt(lngLat: [number, number], outlines: FeatureCollection<MultiPolygon> | null): string | null {
  const hit = outlines?.features.find((outline) => containsPoint(outline.geometry, lngLat));
  return hit === undefined ? null : String(hit.properties?.["fips"]);
}
