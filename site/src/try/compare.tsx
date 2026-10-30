import type { FeatureCollection, MultiPolygon } from "geojson";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { fetchCounties, harrisFeature } from "../county";
import { guardReports, guardSwath } from "../data/guard";
import { DataError, type ReportsFile, type Storm, type StormsIndex, type SwathFile } from "../data/types";
import { formatCount, formatMetric } from "../format";
import { RULER } from "../ruler";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import { useAllFiles } from "../state/pairs-all";
import { useTheme } from "../state/theme";
import type { MapHandle } from "../storms/map/create-map";
import type { Theme } from "../storms/map/layers";
import { RulerLegend } from "../storms/map/ruler-legend";
import "../styles/map.css";
import { ScopeSelect, newestFirst } from "./try";

const SWATH_FILE = "swath.geojson";

export interface ComparePreset {
  id: string;
  label: string;
  dateA: string;
  dateB: string;
}

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: "derecho-vs-hen-egg",
    label: "2024-05-28 vs 2023-06-23 (Derecho vs 2.50 in Hen Egg)",
    dateA: "2024-05-28",
    dateB: "2023-06-23",
  },
  {
    id: "spring-2024",
    label: "2024-05-28 vs 2024-03-15 (Spring 2024 Swaths)",
    dateA: "2024-05-28",
    dateB: "2024-03-15",
  },
  {
    id: "dense-reports",
    label: "2023-05-09 vs 2021-10-01 (High Report Density)",
    dateA: "2023-05-09",
    dateB: "2021-10-01",
  },
];

/** Default comparison pair: 2024-05-28 vs 2023-06-23 when both exist, else newest two dates. */
export function defaultComparePair(storms: readonly Storm[]): [string, string] {
  const byDate = new Set(storms.map((s) => s.storm_date));
  if (byDate.has("2024-05-28") && byDate.has("2023-06-23")) {
    return ["2024-05-28", "2023-06-23"];
  }
  const dates = newestFirst(storms).map((s) => s.storm_date);
  return [dates[0] ?? "", dates[1] ?? dates[0] ?? ""];
}

export interface CompareDelta {
  parcelsA: number | null;
  parcelsB: number | null;
  deltaParcels: number | null;
  swathKm2A: number | null;
  swathKm2B: number | null;
  deltaSwathKm2: number | null;
  maxMeshMmA: number | null;
  maxMeshMmB: number | null;
  deltaMaxMeshMm: number | null;
  reportsA: number | null;
  reportsB: number | null;
  deltaReports: number | null;
  hssA: number | null;
  hssB: number | null;
  deltaHss: number | null;
}

/** Compute A-vs-B comparison values and signed (A - B) deltas at the 0.75 in (19.05 mm) threshold. */
export function compareDelta(stormA: Storm | undefined, stormB: Storm | undefined): CompareDelta {
  const parcelsA = stormA?.parcel_total ?? null;
  const parcelsB = stormB?.parcel_total ?? null;
  const rowA = stormA?.table[0] ?? null;
  const rowB = stormB?.table[0] ?? null;
  const swathKm2A = rowA?.swath_km2 ?? null;
  const swathKm2B = rowB?.swath_km2 ?? null;
  const maxMeshMmA = stormA?.max_mesh_mm ?? null;
  const maxMeshMmB = stormB?.max_mesh_mm ?? null;
  const reportsA = stormA?.report_count ?? null;
  const reportsB = stormB?.report_count ?? null;
  const hssA = rowA?.hss ?? null;
  const hssB = rowB?.hss ?? null;
  return {
    parcelsA,
    parcelsB,
    deltaParcels: parcelsA !== null && parcelsB !== null ? parcelsA - parcelsB : null,
    swathKm2A,
    swathKm2B,
    deltaSwathKm2: swathKm2A !== null && swathKm2B !== null ? swathKm2A - swathKm2B : null,
    maxMeshMmA,
    maxMeshMmB,
    deltaMaxMeshMm: maxMeshMmA !== null && maxMeshMmB !== null ? maxMeshMmA - maxMeshMmB : null,
    reportsA,
    reportsB,
    deltaReports: reportsA !== null && reportsB !== null ? reportsA - reportsB : null,
    hssA,
    hssB,
    deltaHss: hssA !== null && hssB !== null ? hssA - hssB : null,
  };
}

function formatSignedInt(value: number | null): string {
  if (value === null) return "\u2014";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatCount(value)}`;
}

function formatSignedFloat(value: number | null, digits: number, unit = ""): string {
  if (value === null) return "\u2014";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${unit}`;
}

/** One MapLibre map in a container: created on mount, fitted to the county once, destroyed on unmount. */
function useMap(theme: Theme) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    setError(null);
    import("../storms/map/create-map")
      .then(async ({ createMap }) => {
        const next = await createMap(node, theme);
        if (!live) {
          next.destroy();
          return;
        }
        created = next;
        handle.current = next;
        next.fit(null);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (live) setError(new DataError("map", String(cause)));
      });
    return () => {
      live = false;
      created?.destroy();
      handle.current = null;
      setReady(false);
    };
  }, [attempt]);
  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);
  return { container, handle, ready, error, retry: () => setAttempt((n) => n + 1) };
}

/** One side of the compare: the date's swath and optional reports through the shared file cache, drawn on its own map. */
function useSide(
  index: StormsIndex,
  date: string,
  theme: Theme,
  metro: Load<FeatureCollection<MultiPolygon>> & { retry: () => void },
  showReports: boolean,
  hidden: ReadonlySet<number>,
) {
  const storm = index.storms.find((s) => s.storm_date === date);
  const load = useAllFiles<SwathFile>(storm ? [storm.files.swath] : [], guardSwath, index.run_time);
  const reportsLoad = useAllFiles<ReportsFile>(
    storm && showReports ? [storm.files.reports] : [],
    guardReports,
    index.run_time,
  );
  const swath = load.status === "ready" ? (load.data[0] ?? null) : null;
  const reports = showReports && reportsLoad.status === "ready" ? (reportsLoad.data[0] ?? null) : null;
  const outlines = metro.status === "ready" ? metro.data : null;
  const countyData = useMemo(() => (outlines !== null ? harrisFeature(outlines) : null), [outlines]);
  const map = useMap(theme);
  useEffect(() => {
    if (map.ready) map.handle.current?.setData(swath, reports, countyData);
  }, [map.ready, swath, reports, countyData]);
  useEffect(() => {
    if (map.ready) map.handle.current?.setCounties(outlines);
  }, [map.ready, outlines]);
  useEffect(() => {
    if (!map.ready || !map.handle.current) return;
    map.handle.current.setLayerVisible("reports", showReports);
    for (const m of RULER) {
      map.handle.current.setClassVisible(m.threshold_mm, !hidden.has(m.threshold_mm));
    }
  }, [map.ready, showReports, hidden]);
  const failed = load.status === "error" ? load : metro.status === "error" ? metro : null;
  const error = map.error ?? failed?.error ?? null;
  const retry = map.error ? map.retry : failed ? failed.retry : load.retry;
  return { ...map, error, retry, loading: load.status !== "ready" && load.status !== "error" && load.showLoading };
}

export function Compare({ index }: { index: StormsIndex }) {
  const initialPair = useMemo(() => defaultComparePair(index.storms), [index.storms]);
  const [dateA, setDateA] = useState(initialPair[0]);
  const [dateB, setDateB] = useState(initialPair[1]);
  const [split, setSplit] = useState(50);
  const [showReports, setShowReports] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const { resolved: theme } = useTheme();
  const metro = useLoad("counties", fetchCounties);
  const a = useSide(index, dateA, theme, metro, showReports, hidden);
  const b = useSide(index, dateB, theme, metro, showReports, hidden);
  const swipeId = useId();

  const toggleClass = useCallback((thresholdMm: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(thresholdMm)) next.delete(thresholdMm);
      else next.add(thresholdMm);
      return next;
    });
  }, []);

  const stormA = useMemo(() => index.storms.find((s) => s.storm_date === dateA), [index.storms, dateA]);
  const stormB = useMemo(() => index.storms.find((s) => s.storm_date === dateB), [index.storms, dateB]);
  const delta = useMemo(() => compareDelta(stormA, stormB), [stormA, stormB]);
  const availablePresets = useMemo(() => {
    const byDate = new Set(index.storms.map((s) => s.storm_date));
    return COMPARE_PRESETS.filter((p) => byDate.has(p.dateA) && byDate.has(p.dateB));
  }, [index.storms]);

  // Each pan on one map moves the other once; the flag stops the echo from the second map's own move event.
  // The side that mounted last takes the other side's camera, so a Retry on one half keeps the pan.
  const wasReady = useRef({ a: false, b: false });
  useEffect(() => {
    const before = wasReady.current;
    wasReady.current = { a: a.ready, b: b.ready };
    const mapA = a.handle.current?.map;
    const mapB = b.handle.current?.map;
    if (!a.ready || !b.ready || !mapA || !mapB) return;
    let syncing = false;
    const follow = (from: typeof mapA, to: typeof mapB) => () => {
      if (syncing) return;
      syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      syncing = false;
    };
    const aToB = follow(mapA, mapB);
    const bToA = follow(mapB, mapA);
    mapA.on("move", aToB);
    mapB.on("move", bToA);
    if (before.b && !before.a) bToA();
    else aToB();
    return () => {
      mapA.off("move", aToB);
      mapB.off("move", bToA);
    };
  }, [a.ready, b.ready]);

  const half = (side: typeof a, style: string) =>
    side.error ? (
      <div class="map-overlay compare-error" style={style}>
        <ErrorState error={side.error} onRetry={side.retry} />
      </div>
    ) : side.loading ? (
      <div class="map-overlay compare-error" style={style}>
        <LoadingState file={SWATH_FILE} />
      </div>
    ) : null;

  return (
    <>
      {availablePresets.length > 0 ? (
        <div class="compare-presets" role="group" aria-label="Preset storm comparisons">
          <span class="compare-presets-label">Preset pairs:</span>
          {availablePresets.map((preset) => {
            const active = dateA === preset.dateA && dateB === preset.dateB;
            return (
              <button
                key={preset.id}
                type="button"
                class="button button-small"
                aria-pressed={active}
                onClick={() => {
                  setDateA(preset.dateA);
                  setDateB(preset.dateB);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div class="try-controls">
        <ScopeSelect storms={index.storms} value={dateA} onChange={setDateA} label="Storm date A" />
        <ScopeSelect storms={index.storms} value={dateB} onChange={setDateB} label="Storm date B" />
        <div class="compare-layer-toggle">
          <button
            type="button"
            class="button button-small"
            aria-pressed={showReports}
            onClick={() => setShowReports((prev) => !prev)}
          >
            SPC reports overlay ({showReports ? "on" : "off"})
          </button>
        </div>
      </div>
      <div class="compare-delta-strip" role="region" aria-label="A versus B storm comparison delta">
        <div class="metric-cell">
          <span>Parcels ({"\u2265"} 0.75 in)</span>
          <strong class="mono">
            {delta.parcelsA !== null ? formatCount(delta.parcelsA) : "\u2014"} vs{" "}
            {delta.parcelsB !== null ? formatCount(delta.parcelsB) : "\u2014"}
          </strong>
          <span class="mono">{`\u0394 ${formatSignedInt(delta.deltaParcels)}`}</span>
        </div>
        <div class="metric-cell">
          <span>Swath area ({"\u2265"} 0.75 in)</span>
          <strong class="mono">
            {delta.swathKm2A !== null ? `${delta.swathKm2A.toFixed(1)} km\u00b2` : "\u2014"} vs{" "}
            {delta.swathKm2B !== null ? `${delta.swathKm2B.toFixed(1)} km\u00b2` : "\u2014"}
          </strong>
          <span class="mono">{`\u0394 ${formatSignedFloat(delta.deltaSwathKm2, 1, " km\u00b2")}`}</span>
        </div>
        <div class="metric-cell">
          <span>Max radar MESH</span>
          <strong class="mono">
            {delta.maxMeshMmA !== null ? `${delta.maxMeshMmA.toFixed(1)} mm` : "\u2014"} vs{" "}
            {delta.maxMeshMmB !== null ? `${delta.maxMeshMmB.toFixed(1)} mm` : "\u2014"}
          </strong>
          <span class="mono">{`\u0394 ${formatSignedFloat(delta.deltaMaxMeshMm, 1, " mm")}`}</span>
        </div>
        <div class="metric-cell">
          <span>SPC hail reports</span>
          <strong class="mono">
            {delta.reportsA ?? "\u2014"} vs {delta.reportsB ?? "\u2014"}
          </strong>
          <span class="mono">{`\u0394 ${formatSignedInt(delta.deltaReports)}`}</span>
        </div>
        <div class="metric-cell">
          <span>Skill (HSS at 0.75 in)</span>
          <strong class="mono">
            {formatMetric(delta.hssA)} vs {formatMetric(delta.hssB)}
          </strong>
          <span class="mono">{`\u0394 ${formatSignedFloat(delta.deltaHss, 2)}`}</span>
        </div>
      </div>
      {dateA === dateB ? <p class="pane-note">Same storm date on both sides.</p> : null}
      <div class="compare-stage">
        <div class="map-frame compare-frame">
          <div ref={a.container} class="compare-map" role="region" aria-label={`Hail swath for ${dateA}`} tabIndex={-1} />
          <div
            ref={b.container}
            class="compare-map"
            role="region"
            aria-label={`Hail swath for ${dateB}`}
            tabIndex={-1}
            style={`clip-path: inset(0 0 0 ${split}%)`}
          />
          {half(a, `right: ${100 - split}%`)}
          {half(b, `left: ${split}%`)}
          <span class="compare-label compare-label-a mono">{dateA}</span>
          <span class="compare-label compare-label-b mono">{dateB}</span>
          <div class="compare-line" style={`left: ${split}%`} aria-hidden="true" />
        </div>
        <label class="visually-hidden" for={swipeId}>
          Swipe
        </label>
        <input
          id={swipeId}
          class="compare-swipe"
          type="range"
          min={0}
          max={100}
          step={1}
          value={split}
          aria-valuetext={`${split} %`}
          onInput={(event) => setSplit(Number(event.currentTarget.value))}
        />
      </div>
      <div class="compare-legend">
        <RulerLegend hidden={hidden} onToggle={toggleClass} />
      </div>
    </>
  );
}

