// The optional Protomaps basemap. Present: layers in the token colours. Absent: paper.
// shortcut: one local PMTiles file found by a HEAD probe, upgrade to a hosted tile source when every deploy needs a basemap.
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification } from "maplibre-gl";
import { type Theme, token } from "./layers";

export const BASEMAP_FILE = "/basemap.pmtiles";
export const BASEMAP_SOURCE = "basemap";
const PROBE_TIMEOUT_MS = 3000;

/**
 * True when the basemap file answers a HEAD request inside the timeout. A dev server
 * answers a missing file with the HTML shell, so an HTML content type counts as absent.
 */
export async function probeBasemap(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(BASEMAP_FILE, { method: "HEAD", signal: controller.signal });
    return response.ok && !(response.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    // A network error or the timeout means the same as a 404: no basemap file.
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Protomaps layers recoloured from the tokens. Symbol layers need a glyph server, so
 * they are left out; the map carries no labels.
 */
export function basemapLayers(theme: Theme): LayerSpecification[] {
  const paper = token("--paper");
  const muted = token("--sheet-muted");
  const rule = token("--rule");
  const flavor = {
    ...namedFlavor(theme),
    background: paper,
    earth: paper,
    park_a: muted,
    park_b: muted,
    wood_a: muted,
    wood_b: muted,
    scrub_a: muted,
    scrub_b: muted,
    glacier: paper,
    sand: paper,
    beach: paper,
    hospital: paper,
    industrial: paper,
    school: paper,
    zoo: paper,
    military: paper,
    aerodrome: muted,
    runway: rule,
    pedestrian: paper,
    water: muted,
    buildings: muted,
    pier: rule,
    minor_service: rule,
    minor_a: rule,
    minor_b: rule,
    link: rule,
    major: rule,
    highway: rule,
    minor_service_casing: paper,
    minor_casing: paper,
    link_casing: paper,
    major_casing_early: paper,
    major_casing_late: paper,
    highway_casing_early: paper,
    highway_casing_late: paper,
    railway: rule,
    boundaries: rule,
  };
  return layers(BASEMAP_SOURCE, flavor).filter((layer) => layer.type !== "symbol");
}