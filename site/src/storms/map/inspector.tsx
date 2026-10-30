import type { Feature, Point } from "geojson";
import { useEffect, useRef, useState } from "preact/hooks";
import { METRO_BBOX } from "../../county";
import type {
  InternetFile,
  PowerFile,
  Receipt,
  ReportProps,
  ReportsFile,
  SwathFile,
  WarningsFile,
} from "../../data/types";
import { BELOW_FIRST_CLASS, formatCount, formatInches } from "../../format";
import { contains, pointInMultiPolygon } from "../../geometry";
import { dropOf } from "../../impact/internet";
import { ODIN_LABEL, percentText, shareOut } from "../../impact/power";
import { internetSeriesTrough, powerSeriesPeak } from "../../impact/series";
import { type LiveStatusResult, fetchLiveStatus } from "../../live/live-check";
import { LiveStatusList } from "../../live/live-status-list";
import { href } from "../../router";
import { objectName } from "../../ruler";
import { Link } from "../../shell/link";
import { ReceiptChip } from "../../shell/receipt-chip";
import { clearPin, getPinState, setPin, usePin } from "../../state/pin";
import {
  type DirectWarning,
  type NearbyWarning,
  type SwathDistance,
  reportsWithinRadius,
  swathExposureAt,
  warningsAtPoint,
} from "./geo";
import { activeWarnings } from "./layers";

export interface Pick {
  lngLat: [number, number];
  coveringMm: number | null;
  nearest: { feature: Feature<Point, ReportProps>; km: number } | null;
  nearestSwath?: SwathDistance | null;
  countyFips?: string | null;
}

export interface CountyRow {
  fips: string;
  name: string;
  customers: number;
  out: number | null;
  share: number | null;
}

/** Every county of the file at one step, the largest share first and a step without data last. */
export function countyRows(file: PowerFile, step: number): CountyRow[] {
  return file.counties
    .map((county) => {
      const out = county.out[step] ?? null;
      return { fips: county.fips, name: county.name, customers: county.customers, out, share: shareOut(out, county.customers) };
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
}

interface CountyProps {
  file: PowerFile;
  step: number;
  fips: string;
  onPick: (fips: string) => void;
  onStep?: (step: number) => void;
}

/** The picked county at the slider step, the county list that changes the pick, and optional storm peak jump. */
export function CountySection({ file, step, fips, onPick, onStep }: CountyProps) {
  const rows = countyRows(file, step);
  const picked = rows.find((row) => row.fips === fips);
  const peak = onStep !== undefined ? powerSeriesPeak(file, fips, file.receipt.storm_date) : null;
  return (
    <section class="inspector-county" aria-labelledby="inspector-county-title">
      <h3 id="inspector-county-title">Power out</h3>
      {file.source === "odin" ? <p class="inspector-county-source">{ODIN_LABEL}</p> : null}
      <dl class="receipt-list">
        <dt>County</dt>
        <dd>{picked === undefined ? "none" : `${picked.name} County`}</dd>
        <dt>Share out</dt>
        <dd class="mono">{percentText(picked?.share ?? null)}</dd>
        <dt>Customers out</dt>
        <dd class="mono">
          {picked === undefined || picked.out === null ? percentText(null) : `${formatCount(picked.out)} of ${formatCount(picked.customers)}`}
        </dd>
        {peak !== null && peak.peakOut !== null && peak.peakStep !== null ? (
          <>
            <dt>Storm peak</dt>
            <dd class="inspector-inline-action">
              <span class="mono">
                {percentText(peak.peakShare)} ({formatCount(peak.peakOut)})
              </span>
              {onStep !== undefined ? (
                <button
                  type="button"
                  class="button button-small inspector-jump"
                  onClick={() => onStep(peak.peakStep!)}
                >
                  Jump to peak
                </button>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={file.receipt} file="power.json" />
        </dd>
      </dl>
      <ul class="county-list">
        {rows.map((row) => (
          <li key={row.fips}>
            <button type="button" class="county-row" data-fips={row.fips} aria-pressed={row.fips === fips} onClick={() => onPick(row.fips)}>
              <span>{row.name}</span>
              <span class="mono">{percentText(row.share)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface InternetProps {
  file: InternetFile;
  step: number;
  fips: string;
  onStep?: (step: number) => void;
}

/** The picked county's internet reachability at the slider step, as the drop below its baseline, plus optional trough jump. */
export function InternetSection({ file, step, fips, onStep }: InternetProps) {
  const county = file.counties.find((c) => c.fips === fips);
  const ratio = county?.ratio[step] ?? null;
  const trough = onStep !== undefined ? internetSeriesTrough(file, fips, file.receipt.storm_date) : null;
  return (
    <section class="inspector-county" aria-labelledby="inspector-internet-title">
      <h3 id="inspector-internet-title">Internet reachability</h3>
      <dl class="receipt-list">
        <dt>County</dt>
        <dd>{county === undefined ? "none" : `${county.name} County`}</dd>
        <dt>Below baseline</dt>
        <dd class="mono">{percentText(dropOf(ratio))}</dd>
        <dt>Ratio to baseline</dt>
        <dd class="mono">{ratio === null ? percentText(null) : ratio.toFixed(3)}</dd>
        {trough !== null && trough.maxDrop !== null && trough.troughStep !== null ? (
          <>
            <dt>Storm trough</dt>
            <dd class="inspector-inline-action">
              <span class="mono">
                {percentText(trough.maxDrop)} ({trough.minRatio?.toFixed(3)})
              </span>
              {onStep !== undefined ? (
                <button
                  type="button"
                  class="button button-small inspector-jump"
                  onClick={() => onStep(trough.troughStep!)}
                >
                  Jump to trough
                </button>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={file.receipt} file="internet.json" />
        </dd>
      </dl>
    </section>
  );
}

interface WarningsSectionProps {
  point: [number, number];
  file: WarningsFile;
  step: number;
  onStep?: (step: number) => void;
}

export function WarningsSection({ point, file, step, onStep }: WarningsSectionProps) {
  const stormDate = file.receipt.storm_date;
  const activeAtStep = activeWarnings(file, stormDate, step).filter((f) => pointInMultiPolygon(point, f.geometry));
  const stormWide = warningsAtPoint(point, file, stormDate, 5);
  return (
    <section class="inspector-county" aria-labelledby="inspector-warnings-title">
      <h3 id="inspector-warnings-title">Warnings at point</h3>
      <dl class="receipt-list">
        <dt>At current step</dt>
        <dd>
          {activeAtStep.length === 0
            ? "none"
            : activeAtStep.map((w) => w.properties.event_label).join(", ")}
        </dd>
        <dt>Storm window</dt>
        <dd>
          {stormWide.directWarnings.length === 0 ? (
            "none"
          ) : (
            <ul class="inspector-warning-list">
              {stormWide.directWarnings.map((w: DirectWarning) => (
                <li key={`${w.phenomena}-${w.eventid}`} class="inspector-inline-action">
                  <span>
                    {w.event_label} (<span class="mono">{w.phenomena} #{w.eventid}</span>)
                  </span>
                  {onStep !== undefined && w.firstStep !== null ? (
                    <button
                      type="button"
                      class="button button-small inspector-jump"
                      onClick={() => onStep(w.firstStep!)}
                    >
                      Jump
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </dd>
        {stormWide.nearbyWarnings.length > 0 ? (
          <>
            <dt>Within 5 km</dt>
            <dd>
              <ul class="inspector-warning-list">
                {stormWide.nearbyWarnings.map((w: NearbyWarning) => (
                  <li key={`${w.phenomena}-${w.eventid}`} class="inspector-inline-action">
                    <span>
                      {w.event_label} (
                      <span class="mono">
                        {w.phenomena} #{w.eventid}, {w.distanceKm.toFixed(1)} km
                      </span>
                      )
                    </span>
                    {onStep !== undefined && w.firstStep !== null ? (
                      <button
                        type="button"
                        class="button button-small inspector-jump"
                        onClick={() => onStep(w.firstStep!)}
                      >
                        Jump
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={file.receipt} file="warnings.geojson" />
        </dd>
      </dl>
    </section>
  );
}

export interface InspectorProps {
  pick: Pick;
  receipt: Receipt;
  swath?: SwathFile | null;
  reports?: ReportsFile | null;
  warnings?: WarningsFile | null;
  power: PowerFile | null;
  internet: InternetFile | null;
  step: number;
  onStep?: (step: number) => void;
  fips: string;
  onCounty: (fips: string) => void;
  onClose: () => void;
}

/** Plain-text field note citation for a picked coordinate on a storm map. */
export function formatPointFieldNote(pick: Pick, receipt: Receipt): string {
  const [lon, lat] = pick.lngLat;
  const covering =
    pick.coveringMm === null
      ? BELOW_FIRST_CLASS
      : `${objectName(pick.coveringMm)} (${(pick.coveringMm / 25.4).toFixed(2)} in)`;
  const nearReport =
    pick.nearest === null
      ? "none"
      : `${pick.nearest.feature.properties.location} (${pick.nearest.feature.properties.size_in.toFixed(2)} in, ${pick.nearest.km.toFixed(1)} km)`;
  const sources =
    receipt.sources.length > 0
      ? receipt.sources.map((s) => `${s.source} ${s.product}`).join(", ")
      : "NOAA MRMS MESH_Max_1440min";
  return `Hailprint point note — ${receipt.storm_date} at (${lat.toFixed(4)}, ${lon.toFixed(4)}): radar-estimated hail size ${covering}; nearest SPC report ${nearReport}. Source: ${sources} (run ${receipt.run_time}, v${receipt.package_version}). ${receipt.confidence}`;
}

/** Pure view of the point inspector, usable in node unit tests without a DOM host. */
export function InspectorView({
  pick,
  receipt,
  swath = null,
  reports = null,
  warnings = null,
  power,
  internet,
  step,
  onStep,
  fips,
  onCounty,
  onClose,
  pinnedLngLat,
  panelRef,
  liveStatus = "idle",
  liveData = null,
  onLiveCheck,
}: InspectorProps & {
  pinnedLngLat?: [number, number] | null;
  panelRef?: { current: HTMLDivElement | null };
  liveStatus?: "idle" | "loading" | "ready";
  liveData?: LiveStatusResult | null;
  onLiveCheck?: () => void;
}) {
  const [lon, lat] = pick.lngLat;
  const inMetro = contains(METRO_BBOX, pick.lngLat);
  const activePin = pinnedLngLat !== undefined ? pinnedLngLat : (getPinState().pin?.lngLat ?? null);
  const isPinned =
    activePin !== null && Math.abs(activePin[0] - lon) < 1e-5 && Math.abs(activePin[1] - lat) < 1e-5;
  const covering =
    pick.coveringMm === null
      ? BELOW_FIRST_CLASS
      : `${objectName(pick.coveringMm)}, ${(pick.coveringMm / 25.4).toFixed(2)} in`;
  const nearestSwath =
    pick.coveringMm === null
      ? (pick.nearestSwath ?? (swath ? swathExposureAt(swath, pick.lngLat, 20).nearest : null))
      : null;
  const reportsWithin5Km = reports !== null ? reportsWithinRadius(pick.lngLat, reports, 5).count : null;

  return (
    <div ref={panelRef as never} class="inspector" role="dialog" aria-labelledby="inspector-title" tabIndex={-1}>
      <div class="inspector-head">
        <h2 id="inspector-title">Point</h2>
        <div class="inspector-actions">
          <button
            type="button"
            class="button button-small"
            aria-pressed={isPinned}
            disabled={!inMetro && !isPinned}
            onClick={() => {
              if (isPinned) clearPin();
              else if (inMetro) setPin(pick.lngLat, "map");
            }}
          >
            {isPinned ? "Unpin" : "Pin point"}
          </button>
          <button
            type="button"
            class="button button-small"
            onClick={() => {
              const text = formatPointFieldNote(pick, receipt);
              if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                void navigator.clipboard.writeText(text).catch(() => {});
              }
            }}
          >
            Copy field note
          </button>
          <button type="button" class="button button-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <dl class="receipt-list">
        <dt>Position</dt>
        <dd class="mono">
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </dd>
        <dt>Radar-estimated size</dt>
        <dd>{covering}</dd>
        {pick.coveringMm === null ? (
          <>
            <dt>Nearest swath</dt>
            <dd>
              {nearestSwath === null ? (
                "none"
              ) : (
                <>
                  <span class="mono">{nearestSwath.distanceKm.toFixed(1)} km</span> (
                  {objectName(nearestSwath.threshold_mm)}, {"\u2265"}{" "}
                  <span class="mono">{formatInches(nearestSwath.threshold_in)}</span>)
                </>
              )}
            </dd>
          </>
        ) : null}
        <dt>Nearest report</dt>
        <dd>
          {pick.nearest === null ? (
            reportsWithin5Km !== null ? (
              <>
                none {"\u00b7 "}
                <span class="mono">{reportsWithin5Km}</span> within 5 km
              </>
            ) : (
              "none"
            )
          ) : (
            <>
              {pick.nearest.feature.properties.location},{" "}
              <span class="mono">{pick.nearest.feature.properties.size_in.toFixed(2)} in</span>,{" "}
              <span class="mono">{pick.nearest.km.toFixed(1)} km</span>
              {reportsWithin5Km !== null ? (
                <>
                  {" \u00b7 "}
                  <span class="mono">{reportsWithin5Km}</span> within 5 km
                </>
              ) : null}
            </>
          )}
        </dd>
        <dt>Archive analyzer</dt>
        <dd>
          {inMetro ? (
            <Link
              class="inspector-try-link"
              href={href({ area: "try", tool: "point" })}
              onClick={() => {
                if (!isPinned) setPin(pick.lngLat, "map");
              }}
            >
              Open in Point check
            </Link>
          ) : (
            "Outside 8-county metro"
          )}
        </dd>
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={receipt} file="swath.geojson" />
        </dd>
      </dl>
      {warnings === null ? null : (
        <WarningsSection point={pick.lngLat} file={warnings} step={step} onStep={onStep} />
      )}
      {power === null ? null : (
        <CountySection file={power} step={step} fips={fips} onPick={onCounty} onStep={onStep} />
      )}
      {internet === null ? null : (
        <InternetSection file={internet} step={step} fips={fips} onStep={onStep} />
      )}
      {inMetro && onLiveCheck !== undefined ? (
        <section class="inspector-county" aria-labelledby="inspector-live-title">
          <h3 id="inspector-live-title">Live status check</h3>
          <button
            type="button"
            class="button button-small"
            disabled={liveStatus === "loading"}
            onClick={onLiveCheck}
          >
            {liveStatus === "loading" ? "Checking live feeds\u2026" : "Check live NWS & outage feeds"}
          </button>
          {liveStatus === "ready" && liveData !== null
            ? LiveStatusList({ data: liveData, onRetry: onLiveCheck })
            : null}
        </section>
      ) : null}
    </div>
  );
}

type InspectorLiveState =
  | { key: string; status: "idle" }
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; data: LiveStatusResult };

/** The point inspector. Escape and Close call `onClose`; the caller returns focus. */
export function Inspector(props: InspectorProps) {
  const panel = useRef<HTMLDivElement>(null);
  const { pin } = usePin();
  const [liveState, setLiveState] = useState<InspectorLiveState>({ key: "", status: "idle" });
  const liveEpochRef = useRef(0);
  const liveFips = props.pick.countyFips !== undefined ? props.pick.countyFips : props.fips;
  const liveKey = `${props.pick.lngLat[0]},${props.pick.lngLat[1]},${liveFips ?? ""}`;
  const currentLive: InspectorLiveState =
    liveState.key === liveKey ? liveState : { key: liveKey, status: "idle" };

  const runLiveCheck = () => {
    const reqKey = liveKey;
    const myEpoch = ++liveEpochRef.current;
    setLiveState({ key: reqKey, status: "loading" });
    void fetchLiveStatus(props.pick.lngLat, liveFips).then((data) => {
      if (liveEpochRef.current === myEpoch) {
        setLiveState({ key: reqKey, status: "ready", data });
      }
    });
  };

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  return (
    <InspectorView
      {...props}
      pinnedLngLat={pin?.lngLat ?? null}
      panelRef={panel}
      liveStatus={currentLive.status}
      liveData={currentLive.status === "ready" ? currentLive.data : null}
      onLiveCheck={runLiveCheck}
    />
  );
}
