import type { Receipt } from "../data/types";
import type { PooledRow } from "../pool";
import { RULER } from "../ruler";
import { ContingencyGrid } from "../shell/contingency-grid";
import { ReceiptChip } from "../shell/receipt-chip";
import { ClassPick } from "./class-pick";

export function GridView({
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
  const row = rows.find((r) => r.threshold_mm === classMm) ?? rows[0];
  return (
    <>
      <div class="class-picker" role="group" aria-label="Size class">
        {RULER.map((mark) => (
          <ClassPick key={mark.threshold_mm} mark={mark} pressed={mark.threshold_mm === classMm} onPick={onClass} />
        ))}
      </div>
      {row ? (
        <>
          <ContingencyGrid row={row} />
          <div class="pane-note">
            <ReceiptChip receipt={receipt} file={file} summary={summary} />
          </div>
        </>
      ) : null}
    </>
  );
}