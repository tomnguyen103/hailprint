import { useState } from "preact/hooks";
import type { Receipt } from "../data/types";
import { METRIC_LABELS } from "../format";
import type { PooledRow } from "../pool";
import { RULER } from "../ruler";
import { MetricText } from "../shell/metric-text";
import { ReceiptChip } from "../shell/receipt-chip";
import { ThresholdDrawer } from "../shell/threshold-drawer";
import { ClassPick } from "./class-pick";

export function TableView({
  rows,
  classMm,
  onClass,
  receipt,
  file,
  summary,
}: {
  rows: PooledRow[];
  classMm: number;
  onClass: (mm: number) => void;
  receipt: Receipt;
  file: string;
  summary?: string;
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
      <div class="pane-note">
        <ReceiptChip receipt={receipt} file={file} summary={summary} />
      </div>
      <ThresholdDrawer
        row={peekRow}
        scoredCount={peekRow?.report_count ?? 0}
        titlePrefix="Pooled"
        subtitle={peekRow ? `${peekRow.report_count} scored reports` : undefined}
        receipt={receipt}
        file={file}
        onClose={() => setPeekMm(null)}
      />
    </>
  );
}