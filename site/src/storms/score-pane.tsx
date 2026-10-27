import { useMemo, useState } from "preact/hooks";
import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type Storm, type TableRow } from "../data/types";
import { rescore } from "../rescore";
import { RULER } from "../ruler";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { formatCount, formatInches, metricText } from "./select";

const FILE = "pairs.json";
const METRICS = ["pod", "far", "csi", "hss"] as const;
const METRIC_LABELS: Record<(typeof METRICS)[number], string> = { pod: "POD", far: "FAR", csi: "CSI", hss: "HSS" };

export function ScorePane({ storm, radiusKm }: { storm: Storm; radiusKm: number }) {
  const pairs = useLoad(storm.files.pairs, () => fetchJson(storm.files.pairs, guardPairs));
  const [selected, setSelected] = useState(RULER[0]!.threshold_mm);

  // shortcut: the radius control is absent on the Score pane, upgrade in PR F (A1) when the slider lands
  const data = pairs.status === "ready" ? pairs.data : null;
  const table = useMemo<{ rows: TableRow[] } | { error: DataError } | null>(() => {
    if (data === null) return null;
    try {
      return { rows: rescore(data, radiusKm) };
    } catch (error) {
      if (error instanceof DataError) return { error };
      return { error: new DataError(FILE, error instanceof Error ? error.message : String(error)) };
    }
  }, [data, radiusKm]);

  if (pairs.status === "error") return <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  if (pairs.status === "loading" || table === null) return pairs.showLoading ? <LoadingState file={FILE} /> : null;
  if ("error" in table) return <ErrorState error={table.error} onRetry={pairs.retry} />;

  const receipt = pairs.data.receipt;
  const row = table.rows.find((r) => r.threshold_mm === selected) ?? table.rows[0];
  return (
    <div class="pane-grid">
      <section>
        <h2>Per-class table</h2>
        <p class="pane-note">
          Scoring radius <span class="mono">{radiusKm} km</span>, <span class="mono">{storm.scored_reports}</span>{" "}
          scored reports, <span class="mono">{storm.excluded_reports}</span> excluded near the crop edge.
        </p>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Size class</th>
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
              {table.rows.map((r) => (
                <tr key={r.threshold_mm}>
                  <td>
                    <button
                      type="button"
                      class="class-pick"
                      aria-pressed={r.threshold_mm === selected}
                      onClick={() => setSelected(r.threshold_mm)}
                    >
                      &ge; {formatInches(r.threshold_in)}
                    </button>
                  </td>
                  <td class="num">{r.hits}</td>
                  <td class="num">{r.misses}</td>
                  <td class="num">{r.false_alarms}</td>
                  <td class="num">{r.correct_negatives}</td>
                  {METRICS.map((m) => {
                    const { text, hidden } = metricText(r[m]);
                    return (
                      <td key={m} class="num">
                        <span aria-hidden={hidden !== null ? "true" : undefined}>{text}</span>
                        {hidden ? <span class="visually-hidden">{hidden}</span> : null}
                      </td>
                    );
                  })}
                  <td class="num">{r.swath_km2.toFixed(1)}</td>
                  <td class="num">{r.unverifiable_km2.toFixed(1)}</td>
                  <td>
                    <ReceiptChip receipt={receipt} file={FILE} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {row ? <ContingencyGrid row={row} /> : null}
    </div>
  );
}

/** A 2 by 2 grid for one class; each cell's square scales with its count. */
function ContingencyGrid({ row }: { row: TableRow }) {
  const cells = [
    { label: "Hits", count: row.hits },
    { label: "False alarms", count: row.false_alarms },
    { label: "Misses", count: row.misses },
    { label: "Correct negatives", count: row.correct_negatives },
  ];
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <section>
      <h2>
        Contingency grid, &ge; {formatInches(row.threshold_in)}
      </h2>
      <div class="cgrid" role="group" aria-label={`Contingency grid at ${formatInches(row.threshold_in)}`}>
        {cells.map((cell) => (
          <div key={cell.label} class="cgrid-cell">
            <span class="cgrid-fill" style={{ "--k": Math.sqrt(cell.count / max) }} />
            <span class="stat mono">{formatCount(cell.count)}</span>
            <span class="cgrid-label">{cell.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}