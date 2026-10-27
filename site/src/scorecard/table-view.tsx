import type { Receipt } from "../data/types";
import type { PooledRow } from "../pool";
import { RULER } from "../ruler";
import { ReceiptChip } from "../shell/receipt-chip";
import { ClassPick } from "./class-pick";
import { METRIC_LABELS, METRICS } from "./curve";
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
  return (
    <div class="table-scroll">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Size class</th>
            <th scope="col" class="num">Reports</th>
            <th scope="col" class="num">Hits</th>
            <th scope="col" class="num">Misses</th>
            <th scope="col" class="num">False alarms</th>
            <th scope="col" class="num">Correct negatives</th>
            {METRICS.map((m) => (
              <th key={m} scope="col" class="num">
                {METRIC_LABELS[m]}
              </th>
            ))}
            <th scope="col" class="num">Swath km²</th>
            <th scope="col" class="num">Unverifiable km²</th>
            <th scope="col">
              <span class="visually-hidden">Receipt</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mark = RULER.find((m) => m.threshold_mm === r.threshold_mm);
            return (
              <tr key={r.threshold_mm}>
                <td>
                  {mark ? (
                    <ClassPick mark={mark} pressed={r.threshold_mm === classMm} onPick={onClass} />
                  ) : (
                    <span>{r.label}</span>
                  )}
                </td>
                <td class="num">{r.report_count}</td>
                <td class="num">{r.hits}</td>
                <td class="num">{r.misses}</td>
                <td class="num">{r.false_alarms}</td>
                <td class="num">{r.correct_negatives}</td>
                {METRICS.map((m) => (
                  <td key={m} class="num">
                    <MetricText value={r[m]} />
                  </td>
                ))}
                <td class="num">{r.swath_km2.toFixed(1)}</td>
                <td class="num">{r.unverifiable_km2.toFixed(1)}</td>
                <td>
                  <ReceiptChip receipt={receipt} file={file} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}