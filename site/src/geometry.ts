// Pure point-in-polygon tests for county outlines and swath polygons. No MapLibre import.
import type { MultiPolygon, Polygon, Position } from "geojson";

/** Even-odd ray cast over one ring with the half-open edge test, so a vertex gives one fixed answer. */
function inRing(ring: Position[], [x, y]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(rings: Position[][], point: [number, number]): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(outer, point)) return false;
  return !holes.some((hole) => inRing(hole, point));
}

/** True when the point lies inside the outer ring and inside no hole of any polygon. */
export function containsPoint(geometry: Polygon | MultiPolygon, point: [number, number]): boolean {
  if (geometry.type === "Polygon") return inPolygon(geometry.coordinates, point);
  return geometry.coordinates.some((rings) => inPolygon(rings, point));
}
