import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fetchCounties, harrisFeature } from "../county";
import { fetchJson } from "../data/fetch";
import { guardSwath, guardWarnings } from "../data/guard";
import { DataError, type InternetFile, type PowerFile, type ReportsFile, type Storm, type SwathFile, type WarningsFile } from "../data/types";
import type { Fill } from "../impact/power";
import { fillNotes, InternetLegend, PowerFillControl, PowerLegend } from "../impact/power-fill";
import { Timeline } from "../impact/timeline";
import { ErrorState, LoadingState } from "../shell/states";
import { countyAt } from "../state/county";
import { type Load, useLoad } from "../state/load";
import { usePin } from "../state/pin";
import { useTheme } from "../state/theme";
import "../styles/map.css";
import { TimeSlider } from "../time/slider";
import { LAYER_ROWS, LayersControl, type LayerState } from "./layers-control";
import type { MapHandle } from "./map/create-map";
import { boundsOf, coveringAt, coveringClass, nearestReport, swathExposureAt } from "./map/geo";
import { Inspector, type Pick } from "./map/inspector";
import { type LayerName, fillLayerId, warningsNote } from "./map/layers";
import { RulerLegend } from "./map/ruler-legend";
import { RULER } from "../ruler";
import { defaultFill } from "./select";

const SWATH_FILE = "swath.geojson";
const NO_BASEMAP = "No basemap file.";
const PIN_ZOOM = 11;

interface Props {
  storm: Storm;
  reports: Load<ReportsFile> & { retry: () => void };
  /** The power file load; the workspace owns it because its Harris peak sets the default step. */
  power: Load<PowerFile | null>;
  /** The internet file load; the workspace owns it so the data pane reads the same file. */
  internet: Load<InternetFile | null>;
  step: number;
  onStep: (step: number) => void;
  /** The picked county for the power strip; the workspace owns it so a pick never moves the step. */
  fips: string;
  onCounty: (fips: string) => void;
}

export type DatedPick = Pick & { date: string };

/** True only when the pick belongs to the current storm date. */
export function isPickForStorm(pick: DatedPick | null, stormDate: string): pick is DatedPick {
  return pick !== null && pick.date === stormDate;
}

export function MapPane({ storm, reports, power, internet, step, onStep, fips, onCounty }: Props) {
  const swath = useLoad(storm.files.swath, () => fetchJson(storm.files.swath, guardSwath));
  const metro = useLoad("counties", fetchCounties);
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(warningsFile ?? "warnings:none", () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const { resolved: theme } = useTheme();
  const { pin, geoStatus, message: geoMessage, clearPin, locateUser } = usePin();
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState<{ basemap: boolean } | null>(null);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [layers, setLayers] = useState<LayerState>({ swath: true, reports: true, warnings: true });
  const [fill, setFill] = useState<Fill>(() => defaultFill(storm.files));
  const [pick, setPick] = useState<DatedPick | null>(null);
  const activePick = isPickForStorm(pick, storm.storm_date) ? pick : null;

  useEffect(() => {
    setFill(defaultFill(storm.files));
  }, [storm.storm_date, storm.files.power, storm.files.internet]);
  const stormDateRef = useRef(storm.storm_date);
  stormDateRef.current = storm.storm_date;
  const swathRef = useRef<SwathFile | null>(null);
  swathRef.current = swath.status === "ready" ? swath.data : null;
  const reportsRef = useRef<ReportsFile | null>(null);
  reportsRef.current = reports.status === "ready" ? reports.data : null;
  const outlinesRef = useRef<FeatureCollection<MultiPolygon> | null>(null);
  const onCountyRef = useRef(onCounty);
  onCountyRef.current = onCounty;

  const pickCoordinate = useCallback((lngLat: [number, number], coveringOverride?: number | null) => {
    const clickedCounty = countyAt(lngLat, outlinesRef.current);
    if (clickedCounty !== null) onCountyRef.current(clickedCounty);
    const cov =
      coveringOverride !== undefined
        ? coveringOverride
        : swathRef.current
          ? (coveringAt(swathRef.current, lngLat)?.threshold_mm ?? null)
          : null;
    const nearSwath =
      cov === null && swathRef.current !== null
        ? swathExposureAt(swathRef.current, lngLat, 20).nearest
        : null;
    setPick({
      date: stormDateRef.current,
      lngLat,
      coveringMm: cov,
      nearest: nearestReport(lngLat, reportsRef.current?.features ?? []),
      nearestSwath: nearSwath,
    });
  }, []);

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
          const hits = next.map.queryRenderedFeatures(event.point, { layers }) as unknown as {
            properties: { threshold_mm: number };
          }[];
          const lngLat: [number, number] = [event.lngLat.lng, event.lngLat.lat];
          pickCoordinate(lngLat, coveringClass(hits));
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
  }, [attempt, pickCoordinate]);

  // Data: the latest swath, reports, and county go to the sources; the camera fits the swath.
  const swathData = swath.status === "ready" ? swath.data : null;
  const reportsData = reports.status === "ready" ? reports.data : null;
  const warningsData = warnings.status === "ready" ? warnings.data : null;
  const powerData = power.status === "ready" ? power.data : null;
  const internetData = internet.status === "ready" ? internet.data : null;
  const outlines: FeatureCollection<MultiPolygon> | null = metro.status === "ready" ? metro.data : null;
  const countyData = useMemo(() => (outlines !== null ? harrisFeature(outlines) : null), [outlines]);
  outlinesRef.current = outlines;
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setData(swathData, reportsData, countyData);
  }, [ready, swathData, reportsData, countyData]);
  useEffect(() => {
    if (ready) handle.current?.setCounties(outlines);
  }, [ready, outlines]);
  useEffect(() => {
    if (ready) handle.current?.setFill(fill, fill === "internet" ? internetData : powerData, step);
  }, [ready, fill, powerData, internetData, step]);
  useEffect(() => {
    if (!ready || !handle.current || !swathData) return;
    if (pin !== null) {
      handle.current.setPoint(pin.lngLat);
      handle.current.flyTo(pin.lngLat, PIN_ZOOM);
      pickCoordinate(pin.lngLat);
    } else {
      handle.current.fit(boundsOf(swathData));
      setPick(null);
    }
  }, [ready, swathData, pin?.lngLat[0], pin?.lngLat[1], pickCoordinate]);

  useEffect(() => {
    if (!ready || !swathData || pin === null) return;
    pickCoordinate(pin.lngLat);
  }, [ready, swathData, reportsData, outlines, pin?.lngLat[0], pin?.lngLat[1], pickCoordinate]);

  const displayPoint = activePick?.lngLat ?? pin?.lngLat ?? null;
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setPoint(displayPoint);
  }, [ready, displayPoint]);
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
      const wasHidden = next.has(thresholdMm);
      if (wasHidden) next.delete(thresholdMm);
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
  const onPinMyLocation = useCallback(() => {
    void locateUser().then((next) => {
      if (next.geoStatus === "ready" && next.pin !== null) {
        handle.current?.setPoint(next.pin.lngLat);
        handle.current?.flyTo(next.pin.lngLat, PIN_ZOOM);
        pickCoordinate(next.pin.lngLat);
      }
    });
  }, [locateUser, pickCoordinate]);

  // One overlay slot: the map chunk error first, then the swath, reports, and county errors in that order.
  const failed = swath.status === "error" ? swath : reports.status === "error" ? reports : metro.status === "error" ? metro : null;
  const receipt = swathData?.receipt ?? null;
  const warningsLine = warningsNote(warningsFile, warnings);
  // A failed power file or county file hides the fill with one line; the hail map stays.
  const powerAvailable = powerData !== null && outlines !== null;
  const internetAvailable = internetData !== null && outlines !== null;
  const { power: powerLine, internet: internetLine } = fillNotes(
    storm.files,
    power,
    internet,
    metro,
    storm.storm_date,
  );
  return (
    <div class="map-pane" data-inspector={activePick !== null}>
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
            <div class="map-pin-controls" role="group" aria-label="Location pin">
              <button
                type="button"
                class="button button-small"
                disabled={geoStatus === "locating"}
                aria-busy={geoStatus === "locating"}
                onClick={onPinMyLocation}
              >
                {geoStatus === "locating" ? "Locating\u2026" : "Pin my location"}
              </button>
              {pin !== null ? (
                <button
                  type="button"
                  class="button button-small"
                  onClick={() => {
                    clearPin();
                    setPick(null);
                  }}
                >
                  Clear pin
                </button>
              ) : null}
              {geoStatus === "error" && geoMessage !== null ? (
                <p class="layers-note" role="alert">
                  {geoMessage}
                </p>
              ) : null}
            </div>
            <LayersControl layers={layers} warnings={{ available: warningsData !== null, note: warningsLine }} onToggle={toggleLayer} />
            <PowerFillControl
              fill={fill}
              power={{ available: powerAvailable, note: powerLine }}
              internet={{ available: internetAvailable, note: internetLine }}
              onFill={setFill}
            />
          </div>
          <div class="map-legends">
            <PowerLegend fill={powerAvailable ? fill : "none"} source={powerData?.source ?? "eaglei"} />
            <InternetLegend fill={internetAvailable ? fill : "none"} />
            <RulerLegend hidden={hidden} onToggle={toggle} />
          </div>
        </div>
        <TimeSlider date={storm.storm_date} step={step} onStep={onStep} />
        <Timeline
          date={storm.storm_date}
          step={step}
          warnings={warningsData}
          note={warningsLine}
          reports={reportsData}
          power={powerData}
          internet={internetData}
          internetNote={internetLine}
          fips={fips}
          onStep={onStep}
        />
      </div>
      {activePick !== null && receipt !== null ? (
        <Inspector
          pick={activePick}
          receipt={receipt}
          swath={swathData}
          reports={reportsData}
          warnings={warningsData}
          power={powerData}
          internet={internetData}
          step={step}
          onStep={onStep}
          fips={fips}
          onCounty={onCounty}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
