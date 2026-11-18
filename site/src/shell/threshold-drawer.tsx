// On-demand peek drawer that shows a threshold's 2x2 contingency grid and skill metrics.
import { Fragment } from "preact";
import type { Receipt, TableRow } from "../data/types";
import { METRICS, METRIC_LABELS, formatInches } from "../format";
import { objectName } from "../ruler";
import { MetricText } from "./metric-text";
import { ContingencyGrid } from "./contingency-grid";
import { PeekDrawer } from "./peek-drawer";

type Props = {
  row: TableRow | null;
  scoredCount: number;
  subtitle?: string;
  titlePrefix?: string;
  receipt: Receipt;
  file: string;
  onClose: () => void;
};

/** Render a PeekDrawer with the 2x2 ContingencyGrid and flat metric list for one threshold row. */
export function ThresholdDrawer({
  row,
  scoredCount,
  subtitle,
  titlePrefix = "Threshold",
  receipt,
  file,
  onClose,
}: Props) {
  const title = row
    ? (() => {
        const obj = objectName(row.threshold_mm);
        return `${titlePrefix} >= ${formatInches(row.threshold_in)}${obj ? ` (${obj})` : ""}`;
      })()
    : `${titlePrefix} detail`;

  return (
    <PeekDrawer open={row !== null} title={title} subtitle={subtitle} receipt={receipt} file={file} onClose={onClose}>
      {row ? (
        <>
          <ContingencyGrid row={row} />
          <dl class="receipt-list">
            <dt>Scored reports</dt>
            <dd class="mono">{scoredCount}</dd>
            {METRICS.map((m) => (
              <Fragment key={m}>
                <dt>{METRIC_LABELS[m]}</dt>
                <dd class="mono">
                  <MetricText value={row[m]} />
                </dd>
              </Fragment>
            ))}
            <dt>Swath km²</dt>
            <dd class="mono">{row.swath_km2.toFixed(1)}</dd>
            <dt>Unverifiable km²</dt>
            <dd class="mono">{row.unverifiable_km2.toFixed(1)}</dd>
          </dl>
        </>
      ) : null}
    </PeekDrawer>
  );
}
