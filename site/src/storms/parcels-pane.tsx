import { useState } from "preact/hooks";
import { fetchJson } from "../data/fetch";
import { guardZipCounts } from "../data/guard";
import type { Storm } from "../data/types";
import { RULER, diameterPx } from "../ruler";
import { ReceiptChip } from "../shell/receipt-chip";
import { EmptyState, ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { formatCount, formatInches, zipRows } from "./select";

const FILE = "zip-counts.json";

export function ParcelsPane({ storm }: { storm: Storm }) {
  const path = storm.files.zip_counts;
  if (path === null) {
    return <EmptyState sentence={`No parcel count for this storm date. Run hailprint parcels ${storm.storm_date}.`} />;
  }
  return <ParcelsTable path={path} />;
}

function ParcelsTable({ path }: { path: string }) {
  const zip = useLoad(path, () => fetchJson(path, guardZipCounts));
  const [selected, setSelected] = useState(RULER[0]!.threshold_mm);
  if (zip.status === "error") return <ErrorState error={zip.error} onRetry={zip.retry} />;
  if (zip.status === "loading") return zip.showLoading ? <LoadingState file={FILE} /> : null;

  const classes = zip.data.classes;
  const mark = RULER.find((m) => m.threshold_mm === selected) ?? RULER[0]!;
  const rows = zipRows(zip.data, selected);
  return (
    <div class="pane-grid">
      <section>
        <h2>Parcels by size class</h2>
        <p class="pane-note">HCAD parcels, no address or owner data</p>
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Size class</th>
              <th scope="col" class="num">
                Parcels
              </th>
              <th scope="col">
                <span class="visually-hidden">Receipt</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const object = RULER.find((m) => m.threshold_mm === cls.threshold_mm)?.object ?? "";
              return (
                <tr key={cls.threshold_mm}>
                  <td>
                    <button
                      type="button"
                      class="class-pick"
                      aria-pressed={cls.threshold_mm === selected}
                      onClick={() => setSelected(cls.threshold_mm)}
                    >
                      <span
                        class="ruler-mark"
                        style={{ width: diameterPx(cls.threshold_in), height: diameterPx(cls.threshold_in) }}
                      />
                      <span>
                        &ge; {formatInches(cls.threshold_in)}, {object}
                      </span>
                    </button>
                  </td>
                  <td class="num">{formatCount(cls.parcel_count)}</td>
                  <td>
                    <ReceiptChip receipt={zip.data.receipt} file={FILE} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section>
        <h2>
          ZIP codes at &ge; {formatInches(mark.threshold_in)}
        </h2>
        {rows.length === 0 ? (
          <EmptyState sentence={`No parcel at ${formatInches(mark.threshold_in)} on this storm date.`} />
        ) : (
          <table class="table">
            <thead>
              <tr>
                <th scope="col">ZIP</th>
                <th scope="col" class="num">
                  Parcels
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.zip}>
                  <td class="mono">{row.zip}</td>
                  <td class="num">{formatCount(row.parcel_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}