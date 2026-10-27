import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchCounty } from "../county";
import { fetchJson } from "../data/fetch";
import { guardSwath } from "../data/guard";
import { DataError, type ReportsFile, type Storm } from "../data/types";
import { useScenario } from "../dev/scenario";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import "../styles/map.css";
import type { MapHandle } from "./map/create-map";
import { boundsOf, coveringClass, nearestReport } from "./map/geo";
import { Inspector, type Pick } from "./map/inspector";
import { type Theme, fillLayerId } from "./map/layers";
import { RulerLegend } from "./map/ruler-legend";
import { RULER } from "../ruler";

const SWATH_FILE = "swath.geojson";
const NO_BASEMAP = "No basemap file.";

function currentTheme(): Theme {
  return document.documentElement.dataset["theme"] === "dark" ? "dark" : "light";
}

/** The resolved theme from the root attribute the theme hook writes. */
function useResolvedTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

export function MapPane({ storm, reports }: { storm: Storm; reports: Load<ReportsFile> }) {
  const scenario = useScenario();
  const swath = useLoad(`${storm.files.swath}:${scenario}`, async () => {
    if (scenario === "swath-error") throw new DataError(SWATH_FILE, "HTTP 500 (harness)");
    return fetchJson(storm.files.swath, guardSwath);
  });
  const county = useLoad("county", fetchCounty);
  const theme = useResolvedTheme();
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [pick, setPick] = useState<Pick | null>(null);
  const reportsRef = useRef<ReportsFile | null>(null);
  reportsRef.current = reports.status === "ready" ? reports.data : null;

  // Create the map once; MapLibre arrives in its own chunk.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    import("./map/create-map").then(async ({ createMap }) => {
      const next = await createMap(node, currentTheme());
      if (!live) {
        next.destroy();
        return;
      }
      created = next;
      handle.current = next;
      next.map.on("click", (event) => {
        const layers = RULER.map((m) => fillLayerId(m.threshold_mm));
        const hits = next.map.queryRenderedFeatures(event.point, { layers }) as unknown as { properties: { threshold_mm: number } }[];
        const lngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat];
        setPick({
          lngLat,
          coveringMm: coveringClass(hits),
          nearest: nearestReport(lngLat, reportsRef.current?.features ?? []),
        });
      });
      setReady({ basemap: next.basemap });
    });
    return () => {
      live = false;
      created?.destroy();
      handle.current = null;
      setReady(null);
    };
  }, []);

  // Data: the latest swath, reports, and county go to the sources; the camera fits the swath.
  const swathData = swath.status === "ready" ? swath.data : null;
  const reportsData = reports.status === "ready" ? reports.data : null;
  const countyData: FeatureCollection<MultiPolygon> | null = county.status === "ready" ? county.data : null;
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setData(swathData, reportsData, countyData);
  }, [ready, swathData, reportsData, countyData]);
  useEffect(() => {
    if (!ready || !handle.current || !swathData) return;
    handle.current.fit(boundsOf(swathData));
    setPick(null);
  }, [ready, swathData]);
  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);

  const toggle = useCallback((thresholdMm: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      const visible = next.has(thresholdMm);
      if (visible) next.delete(thresholdMm);
      else next.add(thresholdMm);
      handle.current?.setClassVisible(thresholdMm, visible);
      return next;
    });
  }, []);
  const close = useCallback(() => {
    setPick(null);
    container.current?.focus();
  }, []);

  const receipt = swathData?.receipt ?? null;
  return (
    <div class="map-pane" data-inspector={pick !== null}>
      <div class="map-stage">
        <div ref={container} class="map-frame" role="region" aria-label="Map of the hail swath" tabIndex={-1} />
        {ready && !ready.basemap ? <p class="map-note">{NO_BASEMAP}</p> : null}
        {swath.status === "error" ? (
          <div class="map-overlay">
            <ErrorState error={swath.error} onRetry={swath.retry} />
          </div>
        ) : null}
        {swath.status === "loading" && swath.showLoading ? (
          <div class="map-overlay">
            <LoadingState file={SWATH_FILE} />
          </div>
        ) : null}
        <RulerLegend hidden={hidden} onToggle={toggle} />
      </div>
      {pick !== null && receipt !== null ? <Inspector pick={pick} receipt={receipt} onClose={close} /> : null}
    </div>
  );
}