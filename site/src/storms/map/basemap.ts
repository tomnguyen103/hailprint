// The optional Protomaps basemap. Present: layers in the token colours. Absent: paper.
// shortcut: one local PMTiles file found by a HEAD probe, upgrade to a hosted tile source when every deploy needs a basemap.
// shortcut: Protomaps glyphs and sprites load from https://protomaps.github.io/basemaps-assets, copy the font and sprite folders into site/public/ when offline air-gapped operation is required.
import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification } from "maplibre-gl";
import { type Theme, token } from "./layers";

export const BASEMAP_FILE = "/basemap.pmtiles";
export const BASEMAP_SOURCE = "basemap";
export const GLYPHS_URL = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const PROBE_TIMEOUT_MS = 3000;
const EXCLUDED_LABELS = new Set([
  "pois",
  "address_label",
  "roads_oneway",
  "roads_labels_minor",
  "earth_label_islands",
  "places_country",
]);

export function spriteUrl(theme: Theme): string {
  return `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`;
}

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

function basemapFlavor(theme: Theme): Flavor {
  const paper = token("--paper");
  const muted = token("--sheet-muted");
  const rule = token("--rule");
  const water = token("--water");
  const roadMajor = token("--road-major");
  const ink = token("--ink");
  const inkMuted = token("--ink-muted");
  return {
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
    water,
    buildings: muted,
    pier: rule,
    minor_service: rule,
    minor_a: rule,
    minor_b: rule,
    other: rule,
    link: roadMajor,
    major: roadMajor,
    highway: roadMajor,
    bridges_other: rule,
    bridges_minor: rule,
    bridges_link: roadMajor,
    bridges_major: roadMajor,
    bridges_highway: roadMajor,
    minor_service_casing: paper,
    minor_casing: paper,
    link_casing: paper,
    major_casing_early: paper,
    major_casing_late: paper,
    highway_casing_early: paper,
    highway_casing_late: paper,
    bridges_other_casing: paper,
    bridges_minor_casing: paper,
    bridges_link_casing: paper,
    bridges_major_casing: paper,
    bridges_highway_casing: paper,
    railway: rule,
    boundaries: rule,
    city_label: ink,
    city_label_halo: paper,
    subplace_label: inkMuted,
    subplace_label_halo: paper,
    state_label: inkMuted,
    state_label_halo: paper,
    roads_label_major: inkMuted,
    roads_label_major_halo: paper,
    roads_label_minor: inkMuted,
    roads_label_minor_halo: paper,
    ocean_label: inkMuted,
  };
}

/**
 * Protomaps geometry layers recoloured from the tokens. Symbol layers sit above the swath via `basemapLabelLayers`.
 */
export function basemapLayers(theme: Theme): LayerSpecification[] {
  return layers(BASEMAP_SOURCE, basemapFlavor(theme)).filter((layer) => layer.type !== "symbol");
}

/**
 * Curated Protomaps symbol layers placed above the radar swath and below warning outlines.
 */
export function basemapLabelLayers(theme: Theme): LayerSpecification[] {
  return layers(BASEMAP_SOURCE, basemapFlavor(theme), { lang: "en", labelsOnly: true }).filter(
    (layer) => !EXCLUDED_LABELS.has(layer.id),
  );
}
