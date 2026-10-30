import { useMemo, useState } from "preact/hooks";
import { fetchJson } from "../data/fetch";
import { guardZipCounts } from "../data/guard";
import type { Storm, StormsIndex, ZipCounts } from "../data/types";
import { formatCount, formatInches } from "../format";
import { go, href } from "../router";
import { RULER, diameterPx, objectName } from "../ruler";
import { ReceiptChip } from "../shell/receipt-chip";
import { EmptyState, ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { useSparseFiles } from "../state/pairs-all";
import { zipCsvOf } from "../try/csv";
import { crossStormZipLedger, zipRows } from "./select";

const FILE = "zip-counts.json";

export function ParcelsPane({ storm, index }: { storm: Storm; index?: StormsIndex }) {
  const path = storm.files.zip_counts;
  if (path === null) {
    return <EmptyState sentence={`No parcel count for this storm date. Run hailprint parcels ${storm.storm_date}.`} />;
  }
  return <ParcelsTable stormDate={storm.storm_date} path={path} index={index} />;
}

function ParcelsTable({
  stormDate,
  path,
  index,
}: {
  stormDate: string;
  path: string;
  index?: StormsIndex;
}) {
  const zip = useLoad(path, () => fetchJson(path, guardZipCounts));
  const [selected, setSelected] = useState(RULER[0]!.threshold_mm);
  const [query, setQuery] = useState("");
  const [pickedZip, setPickedZip] = useState<string | null>(null);

  const allZipPaths = useMemo(
    () => (index ? index.storms.map((s) => s.files.zip_counts) : []),
    [index],
  );
  const allZipsLoad = useSparseFiles<ZipCounts>(
    allZipPaths,
    guardZipCounts,
    index?.run_time ?? "",
    pickedZip !== null && index !== undefined,
  );

  if (zip.status === "error") return <ErrorState error={zip.error} onRetry={zip.retry} />;
  if (zip.status === "loading") return zip.showLoading ? <LoadingState file={FILE} /> : null;

  const classes = zip.data.classes;
  const mark = RULER.find((m) => m.threshold_mm === selected) ?? RULER[0]!;
  const classTotal = classes.find((c) => c.threshold_mm === selected)?.parcel_count ?? 0;
  const rawRows = zipRows(zip.data, selected);
  const rowsWithShare = rawRows.map((r) => ({
    ...r,
    share: classTotal > 0 ? r.parcel_count / classTotal : 0,
  }));
  const trimmed = query.trim().toLowerCase();
  const filteredRows =
    trimmed === "" ? rowsWithShare : rowsWithShare.filter((r) => r.zip.toLowerCase().includes(trimmed));

  const downloadZipCsv = () => {
    const csv = zipCsvOf(rowsWithShare, stormDate, selected);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `zip-counts-${stormDate}-${selected}mm.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const ledgerEntries =
    pickedZip !== null && index !== undefined && allZipsLoad.status === "ready"
      ? crossStormZipLedger(index.storms, allZipsLoad.data, pickedZip, selected)
      : null;

  return (
    <>
      <div class="pane-grid">
        <section>
          <h2>Parcels by size class</h2>
          <p class="pane-note">HCAD parcels, no address or owner data</p>
          <div class="table-scroll">
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
                {RULER.map((m) => {
                  // A class the file omits has no parcel; the table keeps all seven rows.
                  const count = classes.find((c) => c.threshold_mm === m.threshold_mm)?.parcel_count ?? 0;
                  return (
                    <tr key={m.threshold_mm}>
                      <td>
                        <button
                          type="button"
                          class="class-pick"
                          aria-pressed={m.threshold_mm === selected}
                          onClick={() => setSelected(m.threshold_mm)}
                        >
                          <span
                            class="ruler-mark"
                            style={{ width: diameterPx(m.threshold_in), height: diameterPx(m.threshold_in) }}
                          />
                          <span>
                            &ge; {formatInches(m.threshold_in)}, {objectName(m.threshold_mm)}
                          </span>
                        </button>
                      </td>
                      <td class="num">{formatCount(count)}</td>
                      <td>
                        <ReceiptChip receipt={zip.data.receipt} file={FILE} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2>ZIP codes at &ge; {formatInches(mark.threshold_in)}</h2>
          {rawRows.length === 0 ? (
            <EmptyState sentence={`No parcel at ${formatInches(mark.threshold_in)} on this storm date.`} />
          ) : (
            <>
              <div class="parcels-toolbar">
                <input
                  type="search"
                  class="zip-search mono"
                  placeholder="Filter 77xxx ZIP…"
                  aria-label="Filter ZIP codes"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
                <button type="button" class="button button-small" onClick={downloadZipCsv}>
                  Download ZIP CSV
                </button>
              </div>
              <p class="pane-note">
                Click any 5-digit ZIP code to inspect its exposure across all {index?.storms.length ?? 25} storms.
              </p>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">ZIP</th>
                      <th scope="col" class="num">
                        Parcels
                      </th>
                      <th scope="col" class="num">
                        % of class
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} class="pane-note">
                          No ZIP codes match "{query}".
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr key={row.zip}>
                          <td>
                            {row.zip === "unknown" || !index ? (
                              <span class="mono" title="Parcel row without a 77xxx Houston ZIP in HCAD">
                                {row.zip}
                              </span>
                            ) : (
                              <button
                                type="button"
                                class="button button-small zip-pick mono"
                                aria-pressed={pickedZip === row.zip}
                                onClick={() => setPickedZip(pickedZip === row.zip ? null : row.zip)}
                              >
                                {row.zip}
                              </button>
                            )}
                          </td>
                          <td class="num">{formatCount(row.parcel_count)}</td>
                          <td class="num mono">{(row.share * 100).toFixed(1)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
      {pickedZip !== null && index !== undefined ? (
        <section class="zip-ledger-section" aria-label={`Cross-storm exposure ledger for ZIP ${pickedZip}`}>
          <div class="zip-ledger-header">
            <h2>
              Cross-storm exposure ledger: ZIP <span class="mono">{pickedZip}</span> at &ge;{" "}
              {formatInches(mark.threshold_in)}
            </h2>
            <button type="button" class="button button-small" onClick={() => setPickedZip(null)}>
              Close ledger
            </button>
          </div>
          {allZipsLoad.status === "error" ? (
            <ErrorState error={allZipsLoad.error} onRetry={allZipsLoad.retry} />
          ) : allZipsLoad.status === "loading" || ledgerEntries === null ? (
            allZipsLoad.showLoading ? <LoadingState file={FILE} /> : null
          ) : ledgerEntries.length === 0 ? (
            <p class="pane-note">
              ZIP <span class="mono">{pickedZip}</span> has zero parcels at &ge; {formatInches(mark.threshold_in)} across
              the {index.storms.length}-storm catalog.
            </p>
          ) : (
            <>
              <p class="pane-note">
                Exposed in <span class="mono">{ledgerEntries.length}</span> of{" "}
                <span class="mono">{index.storms.length}</span> catalog storms at &ge; {formatInches(mark.threshold_in)}.
              </p>
              <div class="table-scroll">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">Storm date</th>
                      <th scope="col" class="num">
                        ZIP parcels
                      </th>
                      <th scope="col" class="num">
                        Storm class total
                      </th>
                      <th scope="col" class="num">
                        % of storm class
                      </th>
                      <th scope="col" class="num">
                        Peak MESH (mm)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.map((entry) => (
                      <tr key={entry.storm_date} data-active={entry.storm_date === stormDate}>
                        <td>
                          <button
                            type="button"
                            class="button button-small mono"
                            aria-current={entry.storm_date === stormDate ? "true" : undefined}
                            onClick={() => go(href({ area: "storms", date: entry.storm_date, tab: "parcels" }))}
                          >
                            {entry.storm_date}
                          </button>
                        </td>
                        <td class="num">{formatCount(entry.parcel_count)}</td>
                        <td class="num">{formatCount(entry.storm_total)}</td>
                        <td class="num mono">{(entry.share * 100).toFixed(1)}%</td>
                        <td class="num mono">
                          {entry.max_mesh_mm !== null ? entry.max_mesh_mm.toFixed(1) : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
