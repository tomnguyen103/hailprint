import { useMemo, useState } from "preact/hooks";
import "../styles/scorecard.css";
import type { StormsIndex } from "../data/types";
import { formatInches, type MetricKey } from "../format";
import {
  SENSITIVITY_RADII_KM,
  filterCohort,
  pooledReceipt,
  pooledRows,
  sensitivityMatrix,
  type CohortId,
} from "../pool";
import { SCORECARD_VIEWS, href, type ScorecardView } from "../router";
import { RULER } from "../ruler";
import { RADIUS_MAX_FALLBACK, RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState, PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { usePairsAll } from "../state/pairs-all";
import { GridView } from "./grid-view";
import { MetricText } from "./metric-text";
import { TableView } from "./table-view";
import { ThresholdCurve } from "./threshold-curve";

export const VIEW_LABELS: Record<ScorecardView, string> = {
  table: "Table",
  grid: "Grid",
  curve: "Curve",
};

const FILE = "pairs.json";
const SENTENCE = "The scorecard pools the contingency table across every storm date.";

export function Scorecard({ index, view }: { index: StormsIndex; view: ScorecardView }) {
  const pairs = usePairsAll(index);
  const [cohort, setCohort] = useState<CohortId>("all");
  const [radius, setRadius] = useState(index.radius_km_default);
  const [classMm, setClassMm] = useState(RULER[0]!.threshold_mm);
  const [metric, setMetric] = useState<MetricKey>("hss");
  const rawData = pairs.status === "ready" ? pairs.data : null;

  const years = useMemo(
    () => [...new Set(index.storms.map((s) => s.storm_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [index.storms],
  );
  const wcmCount = useMemo(() => index.storms.filter((s) => s.report_source === "wcm").length, [index.storms]);
  const dailyCount = useMemo(() => index.storms.filter((s) => s.report_source === "spc-daily").length, [index.storms]);

  const filtered = useMemo(
    () => (rawData === null ? null : filterCohort(index.storms, rawData, cohort)),
    [index.storms, rawData, cohort],
  );
  const data = filtered?.pairs ?? null;
  const activeStormCount = filtered?.storms.length ?? index.storms.length;

  const table = useMemo(() => (data === null || data.length === 0 ? null : pooledRows(data, radius)), [data, radius]);
  const scored = table !== null && !("error" in table) ? table.scored : null;
  const matrix = useMemo(() => (data === null || data.length === 0 ? [] : sensitivityMatrix(data)), [data]);
  const receipt = useMemo(() => (data === null ? null : pooledReceipt(data, index)), [data, index]);
  const file = `${FILE}, pooled over ${activeStormCount} storm ${activeStormCount === 1 ? "date" : "dates"}`;

  const cohortOptions: { id: CohortId; label: string }[] = [
    { id: "all", label: `All (${index.storms.length})` },
    { id: "wcm", label: `WCM 2021–2025 (${wcmCount})` },
    { id: "spc-daily", label: `SPC-Daily 2026 (${dailyCount})` },
    ...years.map((y) => ({
      id: `year:${y}` as CohortId,
      label: y,
    })),
  ];

  let body;
  if (pairs.status === "error") body = <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  else if (pairs.status === "loading" || table === null) body = pairs.showLoading ? <LoadingState file={FILE} /> : null;
  else if ("error" in table) body = <ErrorState error={table.error} onRetry={pairs.retry} />;
  else if (receipt === null) body = null;
  else if (view === "table") {
    body = <TableView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={file} />;
  } else if (view === "grid") {
    body = <GridView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={file} />;
  } else {
    body = (
      <>
        <ThresholdCurve rows={table.rows} metric={metric} onMetric={setMetric} />
        <p class="pane-note">
          <ReceiptChip receipt={receipt} file={file} />
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Scorecard">
        <p>
          {scored === null ? (
            SENTENCE
          ) : (
            <>
              <span class="mono">{activeStormCount}</span> storm {activeStormCount === 1 ? "date" : "dates"},{" "}
              <span class="mono">{scored}</span> scored reports
            </>
          )}
        </p>
      </PageHeader>
      <div class="scorecard-controls">
        <div class="cohort-bar" role="group" aria-label="Storm cohort filter">
          <span class="cohort-label">Cohort</span>
          <div class="cohort-pills">
            {cohortOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                class="button button-small cohort-pill"
                aria-pressed={cohort === opt.id}
                onClick={() => setCohort(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <RadiusSlider value={radius} max={rawData?.[0]?.radius_km_max ?? RADIUS_MAX_FALLBACK} onChange={setRadius} />
      </div>
      <SubTabs
        label="Scorecard views"
        tabs={SCORECARD_VIEWS.map((v) => ({ id: v, label: VIEW_LABELS[v], href: href({ area: "scorecard", view: v }) }))}
        selected={view}
      />
      <section class="pane" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        <h2 class="visually-hidden">{VIEW_LABELS[view]}</h2>
        {body}
        {matrix.length > 0 && receipt !== null ? (
          <section class="sensitivity-section" aria-label="Radius by threshold HSS sensitivity matrix">
            <h2>Radius × threshold HSS sensitivity matrix</h2>
            <p class="pane-note">
              Click any cell to set the scoring radius and size threshold. Active cell:{" "}
              <span class="mono">R = {radius} km</span>, <span class="mono">&ge; {classMm} mm</span>.
            </p>
            <div class="table-scroll">
              <table class="table sensitivity-matrix">
                <thead>
                  <tr>
                    <th scope="col">Radius</th>
                    {RULER.map((m) => (
                      <th key={m.threshold_mm} scope="col" class="num">
                        &ge; {formatInches(m.threshold_in)} ({m.threshold_mm} mm)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((rowCells, idx) => {
                    const rKm = SENSITIVITY_RADII_KM[idx]!;
                    return (
                      <tr key={rKm} data-active={rKm === radius}>
                        <th scope="row" class="mono">
                          {rKm} km
                        </th>
                        {rowCells.map((cell) => {
                          const selected = cell.radiusKm === radius && cell.thresholdMm === classMm;
                          return (
                            <td key={cell.thresholdMm} class="num">
                              <button
                                type="button"
                                class="button button-small sensitivity-cell mono"
                                aria-pressed={selected}
                                title={`R=${cell.radiusKm} km, >= ${cell.thresholdMm} mm: a=${cell.hits}, b=${cell.false_alarms}, c=${cell.misses}, d=${cell.correct_negatives}`}
                                onClick={() => {
                                  setRadius(cell.radiusKm);
                                  setClassMm(cell.thresholdMm);
                                }}
                              >
                                <MetricText value={cell.hss} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </>
  );
}