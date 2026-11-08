import { useState } from "preact/hooks";
import type { Receipt } from "../data/types";
import { METRIC_LABELS, METRICS, formatInches } from "../format";
import type { PooledRow } from "../pool";
import { RULER, objectName } from "../ruler";
import { ContingencyGrid } from "../shell/contingency-grid";
import { PeekDrawer } from "../shell/peek-drawer";
import { ReceiptChip } from "../shell/receipt-chip";
import { ClassPick } from "./class-pick";
import { MetricText } from "./metric-text";

export function TableView({
  rows,
  classMm,
  onClass,
  receipt,
  file,
}: {
  rows: PooledRow[];
  classMm: number;
  onClass: (mm: number) => void;
  receipt: Receipt;
  file: string;
}) {
  const [peekMm, setPeekMm] = useState<number | null>(null);
  const peekRow = peekMm !== null ? (rows.find((r) => r.threshold_mm === peekMm) ?? null) : null;

  return (
    <>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Size class</th>
              <th scope="col" class="num">
                {METRIC_LABELS.csi}
              </th>
              <th scope="col" class="num">
                {METRIC_LABELS.hss}
              </th>
              <th scope="col" class="num">Swath km²</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mark = RULER.find((m) => m.threshold_mm === r.threshold_mm);
              return (
                <tr key={r.threshold_mm}>
                  <td>
                    {mark ? (
                      <ClassPick
                        mark={mark}
                        pressed={r.threshold_mm === classMm}
                        onPick={(mm) => {
                          onClass(mm);
                          setPeekMm(mm);
                        }}
                      />
                    ) : (
                      <span>{r.label}</span>
                    )}
                  </td>
                  <td class="num">
                    <MetricText value={r.csi} />
                  </td>
                  <td class="num">
                    <MetricText value={r.hss} />
                  </td>
                  <td class="num">{r.swath_km2.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="pane-note">
        <ReceiptChip receipt={receipt} file={file} />
      </p>
      <PeekDrawer
        open={peekRow !== null}
        title={
          peekRow
            ? (() => {
                const obj = objectName(peekRow.threshold_mm);
                return `Pooled >= ${formatInches(peekRow.threshold_in)}${obj ? ` (${obj})` : ""}`;
              })()
            : "Pooled threshold detail"
        }
        subtitle={peekRow ? `${peekRow.report_count} scored reports` : undefined}
        receipt={receipt}
        file={file}
        onClose={() => setPeekMm(null)}
      >
        {peekRow ? (
          <>
            <ContingencyGrid row={peekRow} />
            <dl class="receipt-list">
              <dt>Scored reports</dt>
              <dd class="mono">{peekRow.report_count}</dd>
              {METRICS.map((m) => (
                <div key={m}>
                  <dt>{METRIC_LABELS[m]}</dt>
                  <dd class="mono">
                    <MetricText value={peekRow[m]} />
                  </dd>
                </div>
              ))}
              <dt>Swath km²</dt>
              <dd class="mono">{peekRow.swath_km2.toFixed(1)}</dd>
              <dt>Unverifiable km²</dt>
              <dd class="mono">{peekRow.unverifiable_km2.toFixed(1)}</dd>
            </dl>
          </>
        ) : null}
      </PeekDrawer>
    </>
  );
}