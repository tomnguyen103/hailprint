import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { fetchCounty } from "../county";
import { fetchJson } from "../data/fetch";
import { guardSwath, guardWarnings } from "../data/guard";
import { DataError, PHENOMENA, type ReportsFile, type Storm, type WarningsFile } from "../data/types";
import { Timeline } from "../impact/timeline";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import { useRoute } from "../state/route";
import { useTheme } from "../state/theme";
import "../styles/map.css";
import { TimeSlider, replaceStep } from "../time/slider";
import { resolveStep } from "../time/step";
import type { MapHandle } from "./map/create-map";
import { boundsOf, coveringClass, nearestReport } from "./map/geo";
import { Inspector, type Pick } from "./map/inspector";
import { type LayerName, WARNING_STYLES, LINE_PX, fillLayerId, warningsNote } from "./map/layers";
import { RulerLegend } from "./map/ruler-legend";
import { RULER } from "../ruler";

const SWATH_FILE = "swath.geojson";
const NO_BASEMAP = "No basemap file.";

export type LayerState = Record<LayerName, boolean>;

const LAYER_ROWS: { name: LayerName; label: string }[] = [
  { name: "swath", label: "Hail swath" },
  { name: "reports", label: "SPC reports" },
  { name: "warnings", label: "NWS warnings" },
];

interface ControlProps {
  layers: LayerState;
  warnings: { available: boolean; note: string | null };
  onToggle: (name: LayerName, on: boolean) => void;
}

/** Three layer switches, the warning line key while warnings show, and one line when the warnings file is off. */
export function LayersControl({ layers, warnings, onToggle }: ControlProps) {
  return (
    <fieldset class="layers">
      <legend class="visually-hidden">Map layers</legend>
      {LAYER_ROWS.map(({ name, label }) => {
        const off = name === "warnings" && !warnings.available;
        return (
          <label key={name} class="layer-row">
            <input type="checkbox" checked={layers[name] && !off} disabled={off} onChange={(event) => onToggle(name, event.currentTarget.checked)} />
            <span>{label}</span>
          </label>
        );
      })}
      {warnings.available && layers.warnings ? (
        <ul class="warning-key">
          {PHENOMENA.map((phenomena) => {
            const style = WARNING_STYLES[phenomena];
            return (
              <li key={phenomena}>
                <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
                  <line
                    class={`warning-key-${phenomena.toLowerCase()}`}
                    x1="0"
                    y1="4"
                    x2="28"
                    y2="4"
                    stroke-dasharray={style.dash ? style.dash.map((n) => n * LINE_PX).join(" ") : undefined}
                  />
                </svg>
                <span class="mono">{phenomena}</span>
                <span>{style.name}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {warnings.note ? <p class="layers-note">{warnings.note}</p> : null}
    </fieldset>
  );
}

interface Props {
  storm: Storm;
  reports: Load<ReportsFile> & { retry: () => void };
}

export function MapPane({ storm, reports }: Props) {
  const swath = useLoad(storm.files.swath, () => fetchJson(storm.files.swath, guardSwath));
  const county = useLoad("county", fetchCounty);
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(warningsFile ?? "warnings:none", () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const { resolved: theme } = useTheme();
  const { route } = useRoute();
  const step = resolveStep(route.kind === "storms" ? route.step : null);
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [layers, setLayers] = useState<LayerState>({ swath: true, reports: true, warnings: true });
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
  const moveStep = useCallback((next: number) => replaceStep(storm.storm_date, next), [storm.storm_date]);

  // One overlay slot: the map chunk error first, then the swath, reports, and county errors in that order.
  const failed = swath.status === "error" ? swath : reports.status === "error" ? reports : county.status === "error" ? county : null;
  const receipt = swathData?.receipt ?? null;
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
          <LayersControl
            layers={layers}
            warnings={{ available: warningsData !== null, note: warningsNote(warningsFile, warnings) }}
            onToggle={toggleLayer}
          />
          <RulerLegend hidden={hidden} onToggle={toggle} />
        </div>
        <TimeSlider date={storm.storm_date} step={step} onStep={moveStep} />
        <Timeline date={storm.storm_date} step={step} warnings={warningsData} reports={reportsData} onStep={moveStep} />
      </div>
      {pick !== null && receipt !== null ? <Inspector pick={pick} receipt={receipt} onClose={close} /> : null}
    </div>
  );
}
