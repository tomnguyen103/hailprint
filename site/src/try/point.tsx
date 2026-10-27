import type { FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { HARRIS_BBOX, contains, fetchCounty } from "../county";
import { DataError, type StormsIndex } from "../data/types";
import { BELOW_FIRST_CLASS, formatInches } from "../format";
import { href } from "../router";
import { objectName } from "../ruler";
import { Link } from "../shell/link";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { useSwathsAll } from "../state/swaths-all";
import { useTheme } from "../state/theme";
import type { MapHandle } from "../storms/map/create-map";
import { coveringAt } from "../storms/map/geo";
import "../styles/map.css";
import { POINT_HINT, parsePoint } from "./point-form";

const SWATH_FILE = "swath.geojson";
const POINT_ZOOM = 11;

// shortcut: the point check takes lat and lon only, upgrade to ZIP when a ZIP geometry file is published
export function PointCheck({ index }: { index: StormsIndex }) {
  const swaths = useSwathsAll(index);
  const county = useLoad("county", fetchCounty);
  const { resolved: theme } = useTheme();
  const [latText, setLatText] = useState("");
  const [lonText, setLonText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [point, setPoint] = useState<[number, number] | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hintId = useId();
  const latId = useId();
  const lonId = useId();

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    setMapError(null);
    import("../storms/map/create-map")
      .then(async ({ createMap }) => {
        const next = await createMap(node, theme);
        if (!live) {
          next.destroy();
          return;
        }
        created = next;
        handle.current = next;
        next.map.on("click", (event) => {
          const { lng, lat } = event.lngLat;
          if (!contains(HARRIS_BBOX, [lng, lat])) return;
          setLatText(lat.toFixed(4));
          setLonText(lng.toFixed(4));
          setInvalid(false);
          setPoint([lng, lat]);
        });
        setReady(true);
      })
      .catch((error: unknown) => {
        if (live) setMapError(new DataError("map", String(error)));
      });
    return () => {
      live = false;
      created?.destroy();
      handle.current = null;
      setReady(false);
    };
  }, [attempt]);

  const swathData = swaths.status === "ready" ? swaths.data : null;
  const newest = swathData?.[0] ?? null;
  const countyData: FeatureCollection<MultiPolygon> | null = county.status === "ready" ? county.data : null;
  useEffect(() => {
    if (ready) handle.current?.setData(newest, null, countyData);
  }, [ready, newest, countyData]);
  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setPoint(point);
    if (point) handle.current.flyTo(point, POINT_ZOOM);
  }, [ready, point]);
  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);

  const check = (event: Event) => {
    event.preventDefault();
    const next = parsePoint(latText, lonText);
    setInvalid(next === null);
    if (next !== null) setPoint(next);
  };

  let table = null;
  if (point !== null) {
    if (swaths.status === "error") table = <ErrorState error={swaths.error} onRetry={swaths.retry} />;
    else if (swathData === null) table = swaths.showLoading ? <LoadingState file={SWATH_FILE} /> : null;
    else {
      table = (
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Storm date</th>
                <th scope="col">Radar-estimated hail size at the point</th>
                <th scope="col">
                  <span class="visually-hidden">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {index.storms.map((storm, i) => {
                const swath = swathData[i];
                if (swath === undefined) return null;
                const covering = coveringAt(swath, point);
                return (
                  <tr key={storm.storm_date}>
                    <td>
                      <Link class="mono" href={href({ area: "storms", date: storm.storm_date, tab: "map" })}>
                        {storm.storm_date}
                      </Link>
                    </td>
                    <td>
                      {covering === null
                        ? BELOW_FIRST_CLASS
                        : `${objectName(covering.threshold_mm)}, \u2265 ${formatInches(covering.threshold_in)}`}
                    </td>
                    <td>
                      <ReceiptChip receipt={swath.receipt} file={SWATH_FILE} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  }

  return (
    <>
      <form class="point-form" onSubmit={check} noValidate>
        <div class="field">
          <label for={latId}>Latitude</label>
          <input
            id={latId}
            class="mono"
            inputMode="decimal"
            autoComplete="off"
            value={latText}
            aria-invalid={invalid}
            aria-describedby={invalid ? hintId : undefined}
            onInput={(event) => setLatText(event.currentTarget.value)}
          />
        </div>
        <div class="field">
          <label for={lonId}>Longitude</label>
          <input
            id={lonId}
            class="mono"
            inputMode="decimal"
            autoComplete="off"
            value={lonText}
            aria-invalid={invalid}
            aria-describedby={invalid ? hintId : undefined}
            onInput={(event) => setLonText(event.currentTarget.value)}
          />
        </div>
        <button type="submit" class="button button-primary">
          Check
        </button>
        {invalid ? (
          <p id={hintId} class="point-hint" role="alert">
            {POINT_HINT}
          </p>
        ) : null}
      </form>
      <div class="map-stage point-map">
        <div ref={container} class="map-frame" role="region" aria-label="Map of the newest hail swath, click to check a point" tabIndex={-1} />
        {mapError ? (
          <div class="map-overlay">
            <ErrorState error={mapError} onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        ) : county.status === "error" ? (
          <div class="map-overlay">
            <ErrorState error={county.error} onRetry={county.retry} />
          </div>
        ) : null}
      </div>
      {table}
    </>
  );
}