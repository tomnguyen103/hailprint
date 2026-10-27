// The one module that imports MapLibre. map-pane.tsx loads it with import().
import {
  type GeoJSONSource,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  NavigationControl,
  type StyleSpecification,
  addProtocol,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 resolves its worker beside import.meta.url, which a bundled chunk breaks.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import { type Bbox, HARRIS_BBOX } from "../../county";
import type { ReportsFile, SwathFile } from "../../data/types";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { BASEMAP_FILE, BASEMAP_SOURCE, basemapLayers, probeBasemap } from "./basemap";
import {
  COUNTY_SOURCE,
  REPORTS_SOURCE,
  SWATH_SOURCE,
  type PaintName,
  type Theme,
  chromeLayers,
  fillLayerId,
  fillLayers,
  themedPaint,
  token,
} from "./layers";
import { RULER } from "../../ruler";

export type { MapLibreMap };

const FLY_MS = 600;
const FIT_PADDING = 40;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

let setUp = false;

function setUpOnce(): void {
  if (setUp) return;
  setWorkerUrl(workerUrl);
  addProtocol("pmtiles", new Protocol().tile);
  setUp = true;
}

function style(theme: Theme, basemap: boolean): StyleSpecification {
  const sources: StyleSpecification["sources"] = {
    [SWATH_SOURCE]: { type: "geojson", data: EMPTY },
    [COUNTY_SOURCE]: { type: "geojson", data: EMPTY },
    [REPORTS_SOURCE]: { type: "geojson", data: EMPTY },
  };
  if (basemap) {
    sources[BASEMAP_SOURCE] = { type: "vector", url: `pmtiles://${BASEMAP_FILE}`, attribution: "Protomaps, OpenStreetMap" };
  }
  return {
    version: 8,
    sources,
    layers: [
      { id: "paper", type: "background", paint: { "background-color": token("--paper") } },
      ...(basemap ? basemapLayers(theme) : []),
      ...fillLayers(),
      ...chromeLayers(),
    ],
  };
}

export interface MapHandle {
  map: MapLibreMap;
  basemap: boolean;
  setData(swath: SwathFile | null, reports: ReportsFile | null, county: FeatureCollection<MultiPolygon> | null): void;
  setTheme(theme: Theme): void;
  setClassVisible(thresholdMm: number, visible: boolean): void;
  fit(bounds: Bbox | null): void;
  destroy(): void;
}

/** Create the map in `container`, probe the basemap, and resolve once the style has loaded. */
export async function createMap(container: HTMLElement, theme: Theme): Promise<MapHandle> {
  setUpOnce();
  const basemap = await probeBasemap();
  const map = new MapLibreMap({
    container,
    style: style(theme, basemap),
    bounds: HARRIS_BBOX as LngLatBoundsLike,
    fitBoundsOptions: { padding: FIT_PADDING },
    attributionControl: basemap ? { compact: true } : false,
  });
  map.addControl(new NavigationControl({ showCompass: false }), "top-left");
  await new Promise<void>((resolve) => map.once("load", () => resolve()));

  const hidden = new Set<number>();
  const geojson = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

  return {
    map,
    basemap,
    setData(swath, reports, county) {
      geojson(SWATH_SOURCE)?.setData(swath ?? EMPTY);
      geojson(REPORTS_SOURCE)?.setData(reports ?? EMPTY);
      geojson(COUNTY_SOURCE)?.setData(county ?? EMPTY);
    },
    setTheme(nextTheme) {
      if (!map.isStyleLoaded()) return;
      map.setPaintProperty("paper", "background-color", token("--paper"));
      for (const [id, paint] of Object.entries(themedPaint())) {
        for (const [prop, value] of Object.entries(paint) as [PaintName, string][]) map.setPaintProperty(id, prop, value);
      }
      if (basemap) {
        // The basemap layers take their colours at build time, so swap them for the theme.
        for (const layer of map.getStyle().layers) if ("source" in layer && layer.source === BASEMAP_SOURCE) map.removeLayer(layer.id);
        const first = fillLayerId(RULER[0]!.threshold_mm);
        for (const layer of basemapLayers(nextTheme)) map.addLayer(layer, first);
      }
    },
    setClassVisible(thresholdMm, visible) {
      if (visible) hidden.delete(thresholdMm);
      else hidden.add(thresholdMm);
      map.setLayoutProperty(fillLayerId(thresholdMm), "visibility", visible ? "visible" : "none");
    },
    fit(bounds) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      map.fitBounds((bounds ?? HARRIS_BBOX) as LngLatBoundsLike, { padding: FIT_PADDING, duration: reduce ? 0 : FLY_MS });
    },
    destroy() {
      map.remove();
    },
  };
}