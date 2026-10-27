import type { Receipt, ReportsFile, Storm } from "../data/types";
import { ReceiptChip } from "../shell/receipt-chip";
import { CELLS, cellFor, cells } from "../stamp";
import type { Load } from "../state/load";
import { formatInches, objectForSize } from "./select";

interface Props {
  storm: Storm;
  reports: Load<ReportsFile>;
  indexReceipt: Receipt;
  onOpenDates: () => void;
}

const HOUR_LABELS = Array.from({ length: CELLS }, (_, i) => `${String((i + 12) % 24).padStart(2, "0")}Z`);

/** Storm date in mono, the 24-cell 12Z-to-12Z bar, the report count, and the max size. */
export function Stamp({ storm, reports, indexReceipt, onOpenDates }: Props) {
  const times = reports.status === "ready" ? reports.data.features.map((f) => f.properties.time) : [];
  const filled = cells(times);
  const hours = HOUR_LABELS.filter((_, i) => filled[i]);
  const label = `Storm window 12Z to 12Z, reports in ${hours.length} of ${CELLS} hours`;
  return (
    <div class="stamp">
      <button type="button" class="stamp-date stamp-date-button mono" aria-haspopup="dialog" onClick={onOpenDates}>
        {storm.storm_date}
      </button>
      <span class="stamp-date stamp-date-text mono">{storm.storm_date}</span>
      <div class="stamp-bar" role="img" aria-label={label}>
        {filled.map((on, i) => (
          <span key={i} class="stamp-cell" data-on={on} />
        ))}
      </div>
      <ul class="visually-hidden">
        {hours.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <span class="stamp-fact">
        <span class="mono">{storm.report_count}</span> reports
      </span>
      <span class="stamp-fact">
        {storm.max_size_in === null ? (
          "no report size"
        ) : (
          <>
            max <span class="mono">{formatInches(storm.max_size_in)}</span>, {objectForSize(storm.max_size_in)}
          </>
        )}
      </span>
      <ReceiptChip receipt={indexReceipt} file="storms.json" />
      <span class="visually-hidden">{times.map(cellFor).filter((c) => c !== null).length} reports placed</span>
    </div>
  );
}