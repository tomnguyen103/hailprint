import type { FeatureCollection, MultiPolygon } from "geojson";
import { useEffect, useId, useMemo, useRef, useState } from "preact/hooks";
import { METRO_BBOX, contains, fetchCounties, harrisFeature } from "../county";
import { DataError, PHENOMENA, type StormsIndex } from "../data/types";
import { BELOW_FIRST_CLASS, formatCount, formatInches } from "../format";
import { ODIN_LABEL, percentText } from "../impact/power";
import { type LiveStatusResult, fetchLiveStatus } from "../live/live-check";
import { LiveStatusList } from "../live/live-status-list";
import { href } from "../router";
import { objectName } from "../ruler";
import { Link } from "../shell/link";
import { RADIUS_MAX_FALLBACK, RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { countyAt } from "../state/county";
import { useInternetAll, usePowerAll, useReportsAll, useWarningsAll } from "../state/impact-all";
import { useLoad } from "../state/load";
import { METRO_PRESETS, usePin } from "../state/pin";
import { useSwathsAll } from "../state/swaths-all";
import { useTheme } from "../state/theme";
import type { MapHandle } from "../storms/map/create-map";
import "../styles/map.css";
import { pointCsvOf } from "./csv";
import { type StormPinRow, analyzeStormAtPin, summarizeArchiveAtPin } from "./point-analysis";
import { POINT_HINT, parsePoint } from "./point-form";

const SWATH_FILE = "swath.geojson";
const POINT_ZOOM = 11;

type LiveCheckState =
  | { key: string; status: "idle" }
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; data: LiveStatusResult };

function cropBadgeText(cropStatus: StormPinRow["cropStatus"], radiusKm: number): string {
  if (cropStatus === "outside-crop") {
    return "Outside Harris MESH crop (county outage & warning feeds active)";
  }
  if (cropStatus === "near-edge") {
    return `Near Harris MESH crop edge (\u2264 ${radiusKm + 1} km)`;
  }
  return "Inside Harris MESH crop";
}

function renderSwathCell(row: StormPinRow): string {
  if (row.cropStatus === "outside-crop") {
    return "outside Harris MESH crop";
  }
  if (row.covering !== null) {
    return `${objectName(row.covering.threshold_mm)}, \u2265 ${formatInches(row.covering.threshold_in)} (at pin)`;
  }
  if (row.withinRadius !== null) {
    return `${objectName(row.withinRadius.threshold_mm)}, \u2265 ${formatInches(row.withinRadius.threshold_in)} (${row.withinRadius.distanceKm.toFixed(1)} km)`;
  }
  if (row.nearest !== null) {
    return `${BELOW_FIRST_CLASS} (nearest ${row.nearest.distanceKm.toFixed(1)} km)`;
  }
  return BELOW_FIRST_CLASS;
}

function renderReportsCell(row: StormPinRow): string {
  const { count, maxSizeIn, nearest } = row.reportsWithinRadius;
  if (count === 0) {
    return nearest === null ? "0" : `0 (nearest ${nearest.km.toFixed(1)} km)`;
  }
  return `${count} (max ${formatInches(maxSizeIn!)}, ${nearest!.km.toFixed(1)} km)`;
}

function renderWarningsCell(row: StormPinRow): string {
  if (row.directWarnings.length === 0) {
    if (row.nearbyWarnings.length > 0) {
      const w = row.nearbyWarnings[0]!;
      return `0 at pin (${w.phenomena} ${w.distanceKm.toFixed(1)} km)`;
    }
    return "none";
  }
  return PHENOMENA.filter((p) => row.warningCounts[p] > 0)
    .map((p) => `${p} \u00d7${row.warningCounts[p]}`)
    .join(" \u00b7 ");
}

function renderPowerCell(row: StormPinRow): string {
  const peak = row.powerPeak;
  if (peak === null || peak.peakOut === null) return "no data";
  if (peak.peakOut === 0) return "0%";
  const sourceNote = peak.source === "odin" ? ` \u00b7 ${ODIN_LABEL}` : "";
  return `${percentText(peak.peakShare)} (${formatCount(peak.peakOut)})${sourceNote}`;
}

function renderInternetCell(row: StormPinRow): string {
  const trough = row.internetTrough;
  if (trough === null || trough.maxDrop === null || trough.minRatio === null) return "no data";
  if (trough.maxDrop === 0) return `0% below baseline (${trough.minRatio.toFixed(3)})`;
  return `${percentText(trough.maxDrop)} below baseline (${trough.minRatio.toFixed(3)})`;
}

function renderCellError(label: string, err: DataError, onRetry: () => void) {
  return (
    <span class="point-cell-error">
      {label} off ({err.message}){" "}
      <button type="button" class="button button-small" onClick={onRetry}>
        Retry
      </button>
    </span>
  );
}

export function PointCheck({ index }: { index: StormsIndex }) {
  const {
    pin,
    radiusKm,
    geoStatus,
    message: geoMessage,
    setPin,
    clearPin,
    setPinRadiusKm,
    setPresetPin,
    locateUser,
  } = usePin();
  const activePoint = pin?.lngLat ?? null;
  const hasPin = activePoint !== null;

  const swaths = useSwathsAll(index);
  const reportsAll = useReportsAll(index, hasPin);
  const warningsAll = useWarningsAll(index, hasPin);
  const powerAll = usePowerAll(index, hasPin);
  const internetAll = useInternetAll(index, hasPin);
  const metro = useLoad("counties", fetchCounties);
  const { resolved: theme } = useTheme();

  const [latText, setLatText] = useState(() => (pin ? pin.lngLat[1].toFixed(4) : ""));
  const [lonText, setLonText] = useState(() => (pin ? pin.lngLat[0].toFixed(4) : ""));
  const [invalid, setInvalid] = useState(false);
  const [previewDate, setPreviewDate] = useState<string>(() => index.storms[0]?.storm_date ?? "");
  const [filterMode, setFilterMode] = useState<"all" | "active">("all");
  const [liveState, setLiveState] = useState<LiveCheckState>({ key: "", status: "idle" });

  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const liveEpochRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hintId = useId();
  const latId = useId();
  const lonId = useId();

  useEffect(() => {
    if (pin !== null) {
      setLatText(pin.lngLat[1].toFixed(4));
      setLonText(pin.lngLat[0].toFixed(4));
      setInvalid(false);
    }
  }, [pin?.lngLat[0], pin?.lngLat[1]]);

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
          if (!contains(METRO_BBOX, [lng, lat])) return;
          setPin([lng, lat], "map");
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
  const reportsData = reportsAll.status === "ready" ? reportsAll.data : null;
  const warningsData = warningsAll.status === "ready" ? warningsAll.data : null;
  const powerData = powerAll.status === "ready" ? powerAll.data : null;
  const internetData = internetAll.status === "ready" ? internetAll.data : null;
  const outlines: FeatureCollection<MultiPolygon> | null = metro.status === "ready" ? metro.data : null;
  const countyData = useMemo(() => (outlines !== null ? harrisFeature(outlines) : null), [outlines]);

  const previewIdx = useMemo(() => {
    const idx = index.storms.findIndex((s) => s.storm_date === previewDate);
    return idx >= 0 ? idx : 0;
  }, [index.storms, previewDate]);

  const previewSwath = swathData?.[previewIdx] ?? swathData?.[0] ?? null;
  const previewReports = reportsData?.[previewIdx] ?? null;

  useEffect(() => {
    if (ready) handle.current?.setData(previewSwath, previewReports, countyData);
  }, [ready, previewSwath, previewReports, countyData]);

  useEffect(() => {
    if (ready) handle.current?.setCounties(outlines);
  }, [ready, outlines]);

  useEffect(() => {
    if (!ready || !handle.current) return;
    handle.current.setPoint(activePoint);
    if (activePoint) handle.current.flyTo(activePoint, POINT_ZOOM);
  }, [ready, activePoint]);

  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);

  const pinnedFips = useMemo(
    () => (activePoint !== null ? countyAt(activePoint, outlines) : null),
    [activePoint, outlines],
  );

  const pinnedCountyName = useMemo(() => {
    if (pinnedFips === null || outlines === null) return null;
    const feat = outlines.features.find(
      (f) => String(f.properties?.["fips"] ?? f.properties?.["GEOID"]) === pinnedFips,
    );
    return feat?.properties?.["name"] ? `${String(feat.properties["name"])} County` : `County ${pinnedFips}`;
  }, [pinnedFips, outlines]);

  const liveKey = activePoint !== null ? `${activePoint[0]},${activePoint[1]},${pinnedFips ?? ""}` : "";
  const currentLive: LiveCheckState =
    liveState.key === liveKey ? liveState : { key: liveKey, status: "idle" };

  const check = (event: Event) => {
    event.preventDefault();
    const next = parsePoint(latText, lonText);
    setInvalid(next === null);
    if (next !== null) setPin(next, "manual");
  };

  const onClearPin = () => {
    liveEpochRef.current += 1;
    clearPin();
    setLatText("");
    setLonText("");
    setInvalid(false);
    setLiveState({ key: "", status: "idle" });
  };

  const runLiveCheck = () => {
    if (!activePoint || metro.status !== "ready") return;
    const reqKey = liveKey;
    const myEpoch = ++liveEpochRef.current;
    setLiveState({ key: reqKey, status: "loading" });
    void fetchLiveStatus(activePoint, pinnedFips).then((data) => {
      if (liveEpochRef.current === myEpoch) {
        setLiveState({ key: reqKey, status: "ready", data });
      }
    });
  };

  const rows = useMemo((): StormPinRow[] => {
    if (activePoint === null || swathData === null) return [];
    return index.storms.map((storm, i) =>
      analyzeStormAtPin({
        storm,
        point: activePoint,
        radiusKm,
        fips: pinnedFips,
        swath: swathData[i] ?? null,
        reports: reportsData?.[i] ?? null,
        warnings: warningsData?.[i] ?? null,
        power: powerData?.[i] ?? null,
        internet: internetData?.[i] ?? null,
      }),
    );
  }, [activePoint, swathData, index.storms, radiusKm, pinnedFips, reportsData, warningsData, powerData, internetData]);

  const stormIdxByDate = useMemo(
    () => new Map(index.storms.map((s, i) => [s.storm_date, i])),
    [index.storms],
  );
  const summary = useMemo(() => summarizeArchiveAtPin(rows), [rows]);
  const visibleRows = useMemo(
    () =>
      filterMode === "active"
        ? rows.filter((r) => {
            const idx = stormIdxByDate.get(r.stormDate) ?? -1;
            const hasErr =
              idx >= 0 &&
              Boolean(
                reportsAll.itemErrors[idx] ||
                  warningsAll.itemErrors[idx] ||
                  powerAll.itemErrors[idx] ||
                  internetAll.itemErrors[idx],
              );
            return r.hasActivityNearPin || hasErr;
          })
        : rows,
    [rows, filterMode, stormIdxByDate, reportsAll.itemErrors, warningsAll.itemErrors, powerAll.itemErrors, internetAll.itemErrors],
  );
  const activeCount = useMemo(() => rows.filter((r) => r.hasActivityNearPin).length, [rows]);

  const countyError = metro.status === "error" ? metro : null;
  const impactLoading =
    activePoint !== null &&
    (metro.status === "loading" ||
      reportsAll.status === "loading" ||
      warningsAll.status === "loading" ||
      powerAll.status === "loading" ||
      internetAll.status === "loading");

  let resultsSection = null;
  if (activePoint !== null) {
    if (swaths.status === "error") {
      resultsSection = <ErrorState error={swaths.error} onRetry={swaths.retry} />;
    } else if (swathData === null) {
      resultsSection = swaths.showLoading ? <LoadingState file={SWATH_FILE} /> : null;
    } else {
      const firstCropStatus = rows[0]?.cropStatus ?? "inside";
      resultsSection = (
        <section class="point-results point-analysis" aria-label="Pinned location archive analysis">
          {countyError !== null ? (
            <ErrorState error={countyError.error} onRetry={countyError.retry} />
          ) : impactLoading ? (
            <LoadingState file="reports.geojson, warnings.geojson, power.json, internet.json" />
          ) : (
            <>
              <div class="stamp point-stamp">
                <span class="stamp-date mono">
                  {activePoint[1].toFixed(4)}, {activePoint[0].toFixed(4)}
                </span>
                {pin?.label ? <span class="stamp-fact">{pin.label}</span> : null}
                <span class="stamp-fact">
                  {pinnedCountyName !== null && pinnedFips !== null
                    ? `${pinnedCountyName} (${pinnedFips})`
                    : "8-county Houston Metro"}
                </span>
                <span class="stamp-fact">{cropBadgeText(firstCropStatus, radiusKm)}</span>
                <span class="stamp-fact">
                  Radar-estimated hail size {"\u2264"} <span class="mono">{radiusKm} km</span>:{" "}
                  <span class="mono">
                    {summary.stormsWithSwathWithinRadius}/{summary.totalStorms}
                  </span>
                  {summary.maxSwathWithinRadius
                    ? ` (max ${objectName(summary.maxSwathWithinRadius.threshold_mm)}, \u2265 ${formatInches(summary.maxSwathWithinRadius.threshold_in)})`
                    : ""}
                </span>
                <span class="stamp-fact">
                  SPC reports {"\u2264"} <span class="mono">{radiusKm} km</span>:{" "}
                  <span class="mono">{summary.totalReportsWithinRadius}</span> across{" "}
                  <span class="mono">{summary.stormsWithReportsWithinRadius}</span> storms
                </span>
                <span class="stamp-fact">
                  Direct NWS warnings: <span class="mono">{summary.totalDirectWarnings}</span> across{" "}
                  <span class="mono">{summary.stormsWithDirectWarnings}</span> storms
                </span>
                <span class="stamp-fact">
                  Worst county peak:{" "}
                  {summary.worstPowerPeak ? (
                    <>
                      <span class="mono">{percentText(summary.worstPowerPeak.peakShare)}</span> (
                      <span class="mono">{summary.worstPowerPeak.stormDate}</span>)
                    </>
                  ) : (
                    "none"
                  )}
                  {summary.deepestInternetTrough ? (
                    <>
                      {" \u00b7 "}trough{" "}
                      <span class="mono">{percentText(summary.deepestInternetTrough.maxDrop)}</span> below baseline (
                      <span class="mono">{summary.deepestInternetTrough.stormDate}</span>)
                    </>
                  ) : null}
                </span>
              </div>

              <div class="point-live-bar">
                <div class="point-live-head">
                  <button
                    type="button"
                    class="button button-small"
                    disabled={currentLive.status === "loading" || metro.status !== "ready"}
                    onClick={runLiveCheck}
                  >
                    {currentLive.status === "loading"
                      ? "Checking live feeds\u2026"
                      : "Check live NWS & outage feeds"}
                  </button>
                  <span class="point-live-caption">
                    On-demand check of NWS Active Alerts, ORNL ODIN utility outages, and IODA internet reachability.
                  </span>
                </div>
                {currentLive.status === "ready" ? (
                  <LiveStatusList
                    data={currentLive.data}
                    onRetry={runLiveCheck}
                    className="receipt-list point-live-grid"
                  />
                ) : null}
              </div>

              <div class="point-table-toolbar">
                <div class="point-filter-group" role="group" aria-label="Filter archive storm dates">
                  <button
                    type="button"
                    class="button button-small"
                    aria-pressed={filterMode === "all"}
                    onClick={() => setFilterMode("all")}
                  >
                    All <span class="mono">{rows.length}</span> storm dates
                  </button>
                  <button
                    type="button"
                    class="button button-small"
                    aria-pressed={filterMode === "active"}
                    onClick={() => setFilterMode("active")}
                  >
                    Activity near pin only (<span class="mono">{activeCount}</span>)
                  </button>
                  <button
                    type="button"
                    class="button button-small"
                    onClick={() => {
                      const csv = pointCsvOf(rows, activePoint, radiusKm);
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `hailprint-point-${activePoint[1].toFixed(4)}_${activePoint[0].toFixed(4)}-r${radiusKm}km.csv`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Download {rows.length}-storm point history CSV
                  </button>
                </div>
                <span class="point-preview-note">
                  Map preview: <span class="mono">{previewSwath?.receipt.storm_date ?? previewDate}</span>
                </span>
              </div>

              <div class="table-scroll">
                <table class="table point-table">
                  <thead>
                    <tr>
                      <th scope="col">Storm date</th>
                      <th scope="col">
                        Radar-estimated hail size (at pin / {"\u2264"} {radiusKm} km)
                      </th>
                      <th scope="col">SPC reports {"\u2264"} {radiusKm} km</th>
                      <th scope="col">NWS warnings at pin</th>
                      <th scope="col">County power peak</th>
                      <th scope="col">County internet reachability</th>
                      <th scope="col">
                        <span class="visually-hidden">Receipt</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const jumpStep = row.firstWarningStep ?? row.powerPeak?.peakStep ?? undefined;
                      const rowIdx = stormIdxByDate.get(row.stormDate) ?? -1;
                      const reportsErr = rowIdx >= 0 ? (reportsAll.itemErrors[rowIdx] ?? null) : null;
                      const warningsErr = rowIdx >= 0 ? (warningsAll.itemErrors[rowIdx] ?? null) : null;
                      const powerErr = rowIdx >= 0 ? (powerAll.itemErrors[rowIdx] ?? null) : null;
                      const internetErr = rowIdx >= 0 ? (internetAll.itemErrors[rowIdx] ?? null) : null;
                      return (
                        <tr key={row.stormDate} data-active={row.hasActivityNearPin}>
                          <td class="point-date-cell">
                            <Link
                              class="mono"
                              href={href({ area: "storms", date: row.stormDate, tab: "map", step: jumpStep })}
                            >
                              {row.stormDate}
                            </Link>
                            <button
                              type="button"
                              class="button button-small"
                              aria-pressed={previewDate === row.stormDate}
                              onClick={() => setPreviewDate(row.stormDate)}
                            >
                              Preview
                            </button>
                          </td>
                          <td>{renderSwathCell(row)}</td>
                          <td class="mono">
                            {reportsErr
                              ? renderCellError("Reports", reportsErr, reportsAll.retry)
                              : renderReportsCell(row)}
                          </td>
                          <td>
                            {warningsErr
                              ? renderCellError("Warnings", warningsErr, warningsAll.retry)
                              : renderWarningsCell(row)}
                          </td>
                          <td class="mono">
                            {powerErr
                              ? renderCellError("Power", powerErr, powerAll.retry)
                              : renderPowerCell(row)}
                          </td>
                          <td class="mono">
                            {internetErr
                              ? renderCellError("Internet", internetErr, internetAll.retry)
                              : renderInternetCell(row)}
                          </td>
                          <td>
                            {row.swathReceipt ? (
                              <ReceiptChip receipt={row.swathReceipt} file={SWATH_FILE} />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      );
    }
  }

  const countyFailure = activePoint === null && metro.status === "error" ? metro : null;

  return (
    <>
      <form class="point-form" onSubmit={check} noValidate>
        <div class="field">
          <label for={latId}>Latitude</label>
          <input
            id={latId}
            name="latitude"
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
            name="longitude"
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
        <button
          type="button"
          class="button"
          disabled={geoStatus === "locating"}
          aria-busy={geoStatus === "locating"}
          onClick={() => void locateUser()}
        >
          {geoStatus === "locating" ? "Locating\u2026" : "Pin my location"}
        </button>
        {hasPin ? (
          <button type="button" class="button" onClick={onClearPin}>
            Clear pin
          </button>
        ) : null}
        <RadiusSlider value={radiusKm} max={RADIUS_MAX_FALLBACK} onChange={setPinRadiusKm} />
        <div class="point-presets" role="group" aria-label="Houston Metro benchmark presets">
          {METRO_PRESETS.map((preset) => {
            const isSelected =
              activePoint !== null &&
              Math.abs(activePoint[0] - preset.lngLat[0]) < 1e-4 &&
              Math.abs(activePoint[1] - preset.lngLat[1]) < 1e-4;
            return (
              <button
                key={preset.id}
                type="button"
                class="button button-small"
                aria-pressed={isSelected}
                onClick={() => setPresetPin(preset.id)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
        {invalid ? (
          <p id={hintId} class="point-hint" role="alert">
            {POINT_HINT}
          </p>
        ) : null}
        {geoStatus === "error" && geoMessage !== null ? (
          <p class="point-hint" role="alert">
            {geoMessage}
          </p>
        ) : null}
      </form>
      <div class="map-stage point-map">
        <div
          ref={container}
          class="map-frame"
          role="region"
          aria-label="Map of the previewed hail swath, click inside the 8-county Houston Metro to pin a location"
          tabIndex={-1}
        />
        {mapError ? (
          <div class="map-overlay">
            <ErrorState error={mapError} onRetry={() => setAttempt((n) => n + 1)} />
          </div>
        ) : null}
      </div>
      {countyFailure ? <ErrorState error={countyFailure.error} onRetry={countyFailure.retry} /> : null}
      {resultsSection}
    </>
  );
}
