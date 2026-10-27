import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchCounties, fetchCounty } from "../county";
import { fetchJson } from "../data/fetch";
import { guardSwath, guardWarnings } from "../data/guard";
import { DataError, type PowerFile, type ReportsFile, type Storm, type WarningsFile } from "../data/types";
import { type Fill, powerNote } from "../impact/power";
import { PowerFillControl, PowerLegend } from "../impact/power-fill";
import { Timeline } from "../impact/timeline";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import { useTheme } from "../state/theme";
import "../styles/map.css";
import { TimeSlider } from "../time/slider";
import { LAYER_ROWS, LayersControl, type LayerState } from "./layers-control";
import type { MapHandle } from "./map/create-map";
import { boundsOf, coveringClass, nearestReport } from "./map/geo";
import { Inspector, type Pick } from "./map/inspector";
import { type LayerName, fillLayerId, warningsNote } from "./map/layers";
import { RulerLegend } from "./map/ruler-legend";
import { RULER } from "../ruler";

const SWATH_FILE = "swath.geojson";
const NO_BASEMAP = "No basemap file.";

interface Props {
  storm: Storm;
  reports: Load<ReportsFile> & { retry: () => void };
  /** The power file load; the workspace owns it because its Harris peak sets the default step. */
  power: Load<PowerFile | null>;
  step: number;
  onStep: (step: number) => void;
}

export function MapPane({ storm, reports, power, step, onStep }: Props) {
  const swath = useLoad(storm.files.swath, () => fetchJson(storm.files.swath, guardSwath));
  const county = useLoad("county", fetchCounty);
  const metro = useLoad("counties", fetchCounties);
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(warningsFile ?? "warnings:none", () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const { resolved: theme } = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [layers, setLayers] = useState<LayerState>({ swath: true, reports: true, warnings: true });
  const [fill, setFill] = useState<Fill>("none");
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
  const warningsData = warnings.status === "ready" ? warnings.data : null;
  const powerData = power.status === "ready" ? power.data : null;
  const outlines: FeatureCollection<MultiPolygon> | null = metro.status === "ready" ? metro.data : null;
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setData(swathData, reportsData, countyData);
  }, [ready, swathData, reportsData, countyData]);
  useEffect(() => {
    if (ready) handle.current?.setCounties(outlines);
  }, [ready, outlines]);
  useEffect(() => {
    if (ready) handle.current?.setFill(fill, powerData, step);
  }, [ready, fill, powerData, step]);
  useEffect(() => {
    if (!ready || !handle.current || !swathData) return;
    handle.current.fit(boundsOf(swathData));
    setPick(null);
  }, [ready, swathData]);
  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);
  useEffect(() => {
    if (!ready || !handle.current) return;
    for (const m of RULER) handle.current.setClassVisible(m.threshold_mm, !hidden.has(m.threshold_mm));
  }, [ready, hidden]);
  useEffect(() => {
    if (!ready || !handle.current) return;
    for (const row of LAYER_ROWS) handle.current.setLayerVisible(row.name, layers[row.name]);
  }, [ready, layers]);
  useEffect(() => {
    if (ready) handle.current?.setWarnings(warningsData, storm.storm_date, step);
  }, [ready, warningsData, storm.storm_date, step]);
  useEffect(() => {
    if (ready) handle.current?.setReportCutoff(step);
  }, [ready, step]);

  const toggle = useCallback(
    (thresholdMm: number) => {
      const next = new Set(hidden);
      const visible = next.has(thresholdMm);
      if (visible) next.delete(thresholdMm);
      else next.add(thresholdMm);
      setHidden(next);
    },
    [hidden],
  );
  const toggleLayer = useCallback((name: LayerName, on: boolean) => setLayers((prev) => ({ ...prev, [name]: on })), []);
  const close = useCallback(() => {
    setPick(null);
    container.current?.focus();
  }, []);
  const retryMap = useCallback(() => setAttempt((n) => n + 1), []);

  // One overlay slot: the map chunk error first, then the swath, reports, and county errors in that order.
  const failed = swath.status === "error" ? swath : reports.status === "error" ? reports : county.status === "error" ? county : null;
  const receipt = swathData?.receipt ?? null;
  const warningsLine = warningsNote(warningsFile, warnings);
  // A failed power file or county file hides the fill with one line; the hail map stays.
  const powerAvailable = powerData !== null && outlines !== null;
  const powerLine = powerNote(storm.files.power, power) ?? (metro.status === "error" ? `Power off. ${metro.error.message}` : null);
  return (
    <div class="map-pane" data-inspector={pick !== null}>
      <div class="map-main">
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
          <div class="map-controls">
            <LayersControl layers={layers} warnings={{ available: warningsData !== null, note: warningsLine }} onToggle={toggleLayer} />
            <PowerFillControl fill={fill} available={powerAvailable} note={powerLine} onFill={setFill} />
          </div>
          <div class="map-legends">
            <PowerLegend fill={powerAvailable ? fill : "none"} source={powerData?.source ?? "eaglei"} />
            <RulerLegend hidden={hidden} onToggle={toggle} />
          </div>
        </div>
        <TimeSlider date={storm.storm_date} step={step} onStep={onStep} />
        <Timeline date={storm.storm_date} step={step} warnings={warningsData} note={warningsLine} reports={reportsData} onStep={onStep} />
      </div>
      {pick !== null && receipt !== null ? <Inspector pick={pick} receipt={receipt} onClose={close} /> : null}
    </div>
  );
}
