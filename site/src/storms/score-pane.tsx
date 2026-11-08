import { useMemo, useState } from "preact/hooks";
import { fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import { DataError, type ReportsFile, type Storm, type TableRow } from "../data/types";
import { METRICS, METRIC_LABELS, formatInches, metricText } from "../format";
import { scoredCount } from "../pool";
import { rescore } from "../rescore";
import { RULER, objectName } from "../ruler";
import { ContingencyGrid } from "../shell/contingency-grid";
import { PeekDrawer } from "../shell/peek-drawer";
import { RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";
import { useRadiusKm } from "../state/radius";
import { ReportClassifierTable } from "./report-classifier-table";

const FILE = "pairs.json";

/** Render the single-storm verification scorecard and radius slider. */
export function ScorePane({
  storm,
  radiusKm: defaultRadiusKm,
  reports,
}: {
  storm: Storm;
  radiusKm?: number;
  reports: Load<ReportsFile>;
}) {
  const pairs = useLoad(storm.files.pairs, () => fetchJson(storm.files.pairs, guardPairs));
  const [selected, setSelected] = useState(RULER[0]!.threshold_mm);
  const [peekMm, setPeekMm] = useState<number | null>(null);
  const data = pairs.status === "ready" ? pairs.data : null;
  const fallbackRadius = data?.radius_km_default ?? defaultRadiusKm ?? 5;
  const [radiusKm, setRadiusKm] = useRadiusKm(fallbackRadius);

  const maxRadiusKm = pairs.status === "ready" ? pairs.data.radius_km_max : 20;
  const activeRadiusKm =
    pairs.status === "ready" ? Math.max(0, Math.min(pairs.data.radius_km_max, Math.round(radiusKm))) : radiusKm;
  const table = useMemo<{ rows: TableRow[] } | { error: DataError } | null>(() => {
    if (data === null) return null;
    try {
      return { rows: rescore(data, activeRadiusKm) };
    } catch (error) {
      if (error instanceof DataError) return { error };
      return { error: new DataError(FILE, error instanceof Error ? error.message : String(error)) };
    }
  }, [data, activeRadiusKm]);

  if (pairs.status === "error") return <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  if (pairs.status === "loading" || table === null) return pairs.showLoading ? <LoadingState file={FILE} /> : null;
  if ("error" in table) return <ErrorState error={table.error} onRetry={pairs.retry} />;

  const receipt = pairs.data.receipt;
  const row = table.rows.find((r) => r.threshold_mm === selected) ?? table.rows[0];
  const peekRow = peekMm !== null ? (table.rows.find((r) => r.threshold_mm === peekMm) ?? null) : null;
  const scored = scoredCount(pairs.data, activeRadiusKm);
  const reportsGeo = reports.status === "ready" ? reports.data : null;
  return (
    <>
      <div class="pane-grid">
        <section>
          <h2>Per-class table</h2>
          <RadiusSlider value={activeRadiusKm} max={maxRadiusKm} onChange={setRadiusKm} />
          <p class="pane-note">
            Radius <span class="mono">{activeRadiusKm} km</span> &middot; <span class="mono">{scored}</span> scored reports &middot;{" "}
            <span class="mono">{pairs.data.reports.length - scored}</span> near crop edge &middot;{" "}
            <ReceiptChip receipt={receipt} file={FILE} />
          </p>
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
                {table.rows.map((r) => (
                  <tr key={r.threshold_mm}>
                    <td>
                      <button
                        type="button"
                        class="class-pick"
                        aria-pressed={r.threshold_mm === selected}
                        onClick={() => {
                          setSelected(r.threshold_mm);
                          setPeekMm(r.threshold_mm);
                        }}
                      >
                        &ge; {formatInches(r.threshold_in)}
                      </button>
                    </td>
                    {(["csi", "hss"] as const).map((m) => {
                      const { text, hidden } = metricText(r[m]);
                      return (
                        <td key={m} class="num">
                          <span aria-hidden={hidden !== null ? "true" : undefined}>{text}</span>
                          {hidden ? <span class="visually-hidden">{hidden}</span> : null}
                        </td>
                      );
                    })}
                    <td class="num">{r.swath_km2.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {row ? <ContingencyGrid row={row} /> : null}
      </div>
      {row ? (
        <ReportClassifierTable
          stormDate={storm.storm_date}
          pairs={pairs.data}
          reportsGeo={reportsGeo}
          radiusKm={activeRadiusKm}
          thresholdMm={row.threshold_mm}
          thresholdIn={row.threshold_in}
        />
      ) : null}
      <PeekDrawer
        open={peekRow !== null}
        title={
          peekRow
            ? (() => {
                const obj = objectName(peekRow.threshold_mm);
                return `Threshold >= ${formatInches(peekRow.threshold_in)}${obj ? ` (${obj})` : ""}`;
              })()
            : "Threshold detail"
        }
        subtitle={peekRow ? `${peekRow.threshold_mm} mm · ${activeRadiusKm} km radius` : undefined}
        receipt={receipt}
        file={FILE}
        onClose={() => setPeekMm(null)}
      >
        {peekRow ? (
          <>
            <ContingencyGrid row={peekRow} />
            <dl class="receipt-list">
              <dt>Scored reports</dt>
              <dd class="mono">{scored}</dd>
              {METRICS.map((m) => (
                <div key={m}>
                  <dt>{METRIC_LABELS[m]}</dt>
                  <dd class="mono">{metricText(peekRow[m]).text}</dd>
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