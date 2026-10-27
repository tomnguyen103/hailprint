import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchCounty } from "../county";
import { fetchJson } from "../data/fetch";
import { guardSwath } from "../data/guard";
import { DataError, type ReportsFile, type Storm } from "../data/types";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import { useTheme } from "../state/theme";
import "../styles/map.css";
import type { MapHandle } from "./map/create-map";
import { boundsOf, coveringClass, nearestReport } from "./map/geo";
import { Inspector, type Pick } from "./map/inspector";
import { fillLayerId } from "./map/layers";
import { RulerLegend } from "./map/ruler-legend";
import { RULER } from "../ruler";

const SWATH_FILE = "swath.geojson";
const NO_BASEMAP = "No basemap file.";

interface Props {
  storm: Storm;
  reports: Load<ReportsFile> & { retry: () => void };
}

export function MapPane({ storm, reports }: Props) {
  const swath = useLoad(storm.files.swath, () => fetchJson(storm.files.swath, guardSwath));
  const county = useLoad("county", fetchCounty);
  const { resolved: theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [pick, setPick] = useState<Pick | null>(null);
  const reportsRef = useRef<ReportsFile | null>(null);
  reportsRef.current = reports.status === "ready" ? reports.data : null;

  // Create the map once; MapLibre arrives in its own chunk. Retry runs the import again.
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    setMapError(null);
    import("./map/create-map")
      .then(async ({ createMap }) => {
        const next = await createMap(node, theme);
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
      })
      .catch((error: unknown) => {
        if (live) setMapError(new DataError("map", String(error)));
      });
    return () => {
      live = false;
      created?.destroy();
      handle.current = null;
      setReady(null);
    };
  }, [attempt]);

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

  const toggle = useCallback(
    (thresholdMm: number) => {
      const next = new Set(hidden);
      const visible = next.has(thresholdMm);
      if (visible) next.delete(thresholdMm);
      else next.add(thresholdMm);
      handle.current?.setClassVisible(thresholdMm, visible);
      setHidden(next);
    },
    [hidden],
  );
  const close = useCallback(() => {
    setPick(null);
    container.current?.focus();
  }, []);
  const retryMap = useCallback(() => setAttempt((n) => n + 1), []);

  // One overlay slot: the map chunk error first, then the swath, reports, and county errors in that order.
  const failed = swath.status === "error" ? swath : reports.status === "error" ? reports : county.status === "error" ? county : null;
  const receipt = swathData?.receipt ?? null;
  return (
    <div class="map-pane" data-inspector={pick !== null}>
      <div class="map-stage">
        <div ref={container} class="map-frame" role="region" aria-label="Map of the hail swath" tabIndex={-1} />
        {ready && !ready.basemap ? <p class="map-note">{NO_BASEMAP}</p> : null}
        {mapError ? (
          <div class="map-overlay">
            <ErrorState error={mapError} onRetry={retryMap} />
          </div>
        ) : failed ? (
          <div class="map-overlay">
            <ErrorState error={failed.error} onRetry={failed.retry} />
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
