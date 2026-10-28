import type { Feature, Point } from "geojson";
import { useEffect, useRef } from "preact/hooks";
import type { PowerFile, Receipt, ReportProps } from "../../data/types";
import { BELOW_FIRST_CLASS, formatCount } from "../../format";
import { ODIN_LABEL, percentText, shareOut } from "../../impact/power";
import { objectName } from "../../ruler";
import { ReceiptChip } from "../../shell/receipt-chip";

export interface Pick {
  lngLat: [number, number];
  coveringMm: number | null;
  nearest: { feature: Feature<Point, ReportProps>; km: number } | null;
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
}

/** The picked county at the slider step, and the county list that changes the pick. */
export function CountySection({ file, step, fips, onPick }: CountyProps) {
  const rows = countyRows(file, step);
  const picked = rows.find((row) => row.fips === fips);
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

interface Props {
  pick: Pick;
  receipt: Receipt;
  power: PowerFile | null;
  step: number;
  fips: string;
  onCounty: (fips: string) => void;
  onClose: () => void;
}

/** The point inspector. Escape and Close call `onClose`; the caller returns focus. */
export function Inspector({ pick, receipt, power, step, fips, onCounty, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [lon, lat] = pick.lngLat;
  const covering =
    pick.coveringMm === null ? BELOW_FIRST_CLASS : `${objectName(pick.coveringMm)}, ${(pick.coveringMm / 25.4).toFixed(2)} in`;
  return (
    <div ref={panel} class="inspector" role="dialog" aria-labelledby="inspector-title" tabIndex={-1}>
      <div class="inspector-head">
        <h2 id="inspector-title">Point</h2>
        <button type="button" class="button button-small" onClick={onClose}>
          Close
        </button>
      </div>
      <dl class="receipt-list">
        <dt>Position</dt>
        <dd class="mono">
          {lat.toFixed(4)}, {lon.toFixed(4)}
        </dd>
        <dt>Radar-estimated size</dt>
        <dd>{covering}</dd>
        <dt>Nearest report</dt>
        <dd>
          {pick.nearest === null ? (
            "none"
          ) : (
            <>
              {pick.nearest.feature.properties.location}, <span class="mono">{pick.nearest.feature.properties.size_in.toFixed(2)} in</span>,{" "}
              <span class="mono">{pick.nearest.km.toFixed(1)} km</span>
            </>
          )}
        </dd>
        <dt>Receipt</dt>
        <dd>
          <ReceiptChip receipt={receipt} file="swath.geojson" />
        </dd>
      </dl>
      {power === null ? null : <CountySection file={power} step={step} fips={fips} onPick={onCounty} />}
    </div>
  );
}