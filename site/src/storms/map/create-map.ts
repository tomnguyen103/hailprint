// The one module that imports MapLibre. map-pane.tsx loads it with import().
import {
  type GeoJSONSource,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  Marker,
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
import type { ReportsFile, SwathFile, WarningsFile } from "../../data/types";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import { BASEMAP_FILE, BASEMAP_SOURCE, basemapLayers, probeBasemap } from "./basemap";
import {
  COUNTY_SOURCE,
  POINT_SOURCE,
  REPORTS_SOURCE,
  SWATH_SOURCE,
  TAG_ZOOM,
  WARNINGS_SOURCE,
  type LayerName,
  type PaintName,
  type Theme,
  activeWarnings,
  chromeLayers,
  fillLayerId,
  fillLayers,
  reportsAtStep,
  themedPaint,
  token,
  warningLayerId,
  warningLayers,
  warningTags,
  PHENOMENA,
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
    [POINT_SOURCE]: { type: "geojson", data: EMPTY },
    [WARNINGS_SOURCE]: { type: "geojson", data: EMPTY },
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
      ...warningLayers(),
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
  /** Switch the swath, the reports, or the warnings. A hidden size class stays hidden when the swath returns. */
  setLayerVisible(name: LayerName, visible: boolean): void;
  /** Draw the warnings in force at the step, each with its text label. */
  setWarnings(file: WarningsFile | null, date: string, step: number): void;
  /** Fade the reports after this step; null draws all of them in full. */
  setReportCutoff(step: number | null): void;
  fit(bounds: Bbox | null): void;
  /** Place the one checked point, or remove it with null. */
  setPoint(lngLat: [number, number] | null): void;
  flyTo(lngLat: [number, number], zoom: number): void;
  destroy(): void;
}

function reduceMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    // On touch, one finger scrolls the page and two fingers move the map; a mouse keeps wheel zoom.
    cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
  });
  map.addControl(new NavigationControl({ showCompass: false }), "top-left");
  await new Promise<void>((resolve, reject) => {
    map.once("load", () => resolve());
    map.once("error", (e) => reject(e.error ?? new Error("map failed to load")));
  });

  return makeHandle(map, basemap);
}

/** The handle over a map whose style is loaded or still loading. Layer state lives here, so every call is safe in any order. */
export function makeHandle(map: MapLibreMap, basemap: boolean): MapHandle {
  const geojson = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
  const show = (id: string, on: boolean) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  const hiddenClasses = new Set<number>();
  let swathOn = true;
  let warningsOn = true;
  let reportsFile: ReportsFile | null = null;
  let cutoff: number | null = null;
  let tags: Marker[] = [];

  const applySwath = () => {
    for (const mark of RULER) show(fillLayerId(mark.threshold_mm), swathOn && !hiddenClasses.has(mark.threshold_mm));
    show("swath-outline", swathOn);
  };
  const renderReports = () => geojson(REPORTS_SOURCE)?.setData(reportsAtStep(reportsFile, cutoff));
  const syncTags = () => {
    const visible = warningsOn && map.getZoom() >= TAG_ZOOM;
    for (const tag of tags) tag.getElement().hidden = !visible;
  };
  map.on("zoom", syncTags);

  return {
    map,
    basemap,
    setData(swath, reports, county) {
      geojson(SWATH_SOURCE)?.setData(swath ?? EMPTY);
      reportsFile = reports;
      renderReports();
      geojson(COUNTY_SOURCE)?.setData(county ?? EMPTY);
    },
    setTheme(nextTheme) {
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
      if (visible) hiddenClasses.delete(thresholdMm);
      else hiddenClasses.add(thresholdMm);
      applySwath();
    },
    setLayerVisible(name, visible) {
      if (name === "swath") {
        swathOn = visible;
        applySwath();
      } else if (name === "reports") {
        show("report-points", visible);
      } else {
        warningsOn = visible;
        for (const phenomena of PHENOMENA) show(warningLayerId(phenomena), visible);
        syncTags();
      }
    },
    setWarnings(file, date, step) {
      const active = activeWarnings(file, date, step);
      geojson(WARNINGS_SOURCE)?.setData({ type: "FeatureCollection", features: active });
      for (const tag of tags) tag.remove();
      tags = warningTags(active).map((tag) => {
        const element = document.createElement("div");
        element.className = `warning-tag warning-tag-${tag.text.toLowerCase()}`;
        element.textContent = tag.text;
        return new Marker({ element }).setLngLat(tag.lngLat).addTo(map);
      });
      syncTags();
    },
    setReportCutoff(step) {
      cutoff = step;
      renderReports();
    },
    fit(bounds) {
      map.fitBounds((bounds ?? HARRIS_BBOX) as LngLatBoundsLike, { padding: FIT_PADDING, duration: reduceMotion() ? 0 : FLY_MS });
    },
    setPoint(lngLat) {
      const data: FeatureCollection<Point> = {
        type: "FeatureCollection",
        features: lngLat === null ? [] : [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: lngLat } }],
      };
      geojson(POINT_SOURCE)?.setData(data);
    },
    flyTo(lngLat, zoom) {
      map.flyTo({ center: lngLat, zoom, duration: reduceMotion() ? 0 : FLY_MS });
    },
    destroy() {
      for (const tag of tags) tag.remove();
      map.remove();
    },
  };
}