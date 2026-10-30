import type { Receipt, ReportsFile, Storm } from "../data/types";
import { ReceiptChip } from "../shell/receipt-chip";
import { CELLS, cellFor, cells, formatStormFieldNote } from "../stamp";
import type { Load } from "../state/load";
import { STEPS_PER_HOUR } from "../time/step";
import { formatInches } from "../format";
import { objectForSize } from "./select";

export { formatStormFieldNote };

interface Props {
  storm: Storm;
  reports: Load<ReportsFile>;
  /** The map step; null off the map tab, where no cell is marked. */
  step: number | null;
  indexReceipt: Receipt;
  datesOpen?: boolean;
  onOpenDates: () => void;
}

const HOUR_LABELS = Array.from({ length: CELLS }, (_, i) => `${String((i + 12) % 24).padStart(2, "0")}Z`);

/** The stamp cell that holds a map step; null once the step is past the 24-cell storm window. */
export function sliderCell(step: number): number | null {
  return step < CELLS * STEPS_PER_HOUR ? Math.floor(step / STEPS_PER_HOUR) : null;
}

/** Storm date in mono, the 24-cell 12Z-to-12Z bar, the report count, and the max size. */
export function Stamp({ storm, reports, step, indexReceipt, datesOpen = false, onOpenDates }: Props) {
  const times = reports.status === "ready" ? reports.data.features.map((f) => f.properties.time) : [];
  const filled = cells(times);
  const hours = HOUR_LABELS.filter((_, i) => filled[i]);
  const marked = step === null ? null : sliderCell(step);
  const label = `Storm window 12Z to 12Z, reports in ${hours.length} of ${CELLS} hours${marked === null ? "" : `, map time in the ${HOUR_LABELS[marked]} hour`}`;
  const copyFieldNote = () => {
    const baseReceipt = reports.status === "ready" ? reports.data.receipt : indexReceipt;
    const mrmsSourceEntry = {
      source: "NOAA MRMS",
      product: "MESH_Max_1440min",
      file: storm.files.swath,
    };
    const reportSourceEntry = {
      source: "SPC",
      product: storm.report_source === "wcm" ? "WCM hail (wcm)" : "daily hail (spc-daily)",
      file: storm.report_source,
    };
    const hasMrms = baseReceipt.sources.some((s) => s.source.includes("MRMS"));
    const hasSpc = baseReceipt.sources.some((s) => s.source === "SPC");
    const activeReceipt: Receipt = {
      ...baseReceipt,
      sources: [
        ...(hasMrms ? [] : [mrmsSourceEntry]),
        ...baseReceipt.sources,
        ...(hasSpc ? [] : [reportSourceEntry]),
      ],
    };
    const text = formatStormFieldNote(storm, activeReceipt);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
  };
  return (
    <div class="stamp">
      <button
        type="button"
        class="stamp-date stamp-date-button mono"
        aria-haspopup="dialog"
        aria-expanded={datesOpen}
        aria-controls="storms-scope"
        onClick={onOpenDates}
      >
        <span>{storm.storm_date}</span>
        <span class="stamp-date-chevron" aria-hidden="true" />
      </button>
      <span class="stamp-date stamp-date-text mono">{storm.storm_date}</span>
      <div class="stamp-bar" role="img" aria-label={label}>
        {filled.map((on, i) => (
          <span key={i} class="stamp-cell" data-on={on} data-slider={i === marked} />
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
      <button type="button" class="button button-small stamp-copy" onClick={copyFieldNote}>
        Copy field note
      </button>
      <span class="visually-hidden">{times.map(cellFor).filter((c) => c !== null).length} reports placed</span>
    </div>
  );
}
