import type { FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { fetchCounty } from "../county";
import { guardSwath } from "../data/guard";
import { DataError, type StormsIndex, type SwathFile } from "../data/types";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { useAllFiles } from "../state/pairs-all";
import { useTheme } from "../state/theme";
import type { MapHandle } from "../storms/map/create-map";
import type { Theme } from "../storms/map/layers";
import "../styles/map.css";
import { ScopeSelect, newestFirst } from "./try";

const SWATH_FILE = "swath.geojson";

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

/** One side of the compare: the date's swath through the shared file cache, drawn on its own map. */
function useSide(index: StormsIndex, date: string, theme: Theme, county: FeatureCollection<MultiPolygon> | null) {
  const storm = index.storms.find((s) => s.storm_date === date);
  const load = useAllFiles<SwathFile>(storm ? [storm.files.swath] : [], guardSwath);
  const swath = load.status === "ready" ? (load.data[0] ?? null) : null;
  const map = useMap(theme);
  useEffect(() => {
    if (map.ready) map.handle.current?.setData(swath, null, county);
  }, [map.ready, swath, county]);
  const error = map.error ?? (load.status === "error" ? load.error : null);
  const retry = map.error ? map.retry : load.retry;
  return { ...map, error, retry, loading: load.status !== "ready" && load.status !== "error" && load.showLoading };
}

export function Compare({ index }: { index: StormsIndex }) {
  const dates = newestFirst(index.storms).map((s) => s.storm_date);
  const [dateA, setDateA] = useState(dates[0] ?? "");
  const [dateB, setDateB] = useState(dates[1] ?? dates[0] ?? "");
  const [split, setSplit] = useState(50);
  const { resolved: theme } = useTheme();
  const county = useLoad("county", fetchCounty);
  const countyData = county.status === "ready" ? county.data : null;
  const a = useSide(index, dateA, theme, countyData);
  const b = useSide(index, dateB, theme, countyData);
  const swipeId = useId();

  // Each pan on one map moves the other once; the flag stops the echo from the second map's own move event.
  useEffect(() => {
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
      <div class="try-controls">
        <ScopeSelect storms={index.storms} value={dateA} onChange={setDateA} label="Storm date A" />
        <ScopeSelect storms={index.storms} value={dateB} onChange={setDateB} label="Storm date B" />
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
    </>
  );
}