import { useMemo, useState } from "preact/hooks";
import "../styles/scorecard.css";
import { DataError, type Storm, type StormsIndex } from "../data/types";
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
import { MetricText } from "../shell/metric-text";
import { RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { usePairsAll } from "../state/pairs-all";
import { DEFAULT_MAX_RADIUS_KM, clampRadiusKm, useRadiusKm } from "../state/radius";
import { GridView } from "./grid-view";
import { TableView } from "./table-view";
import { ThresholdCurve } from "./threshold-curve";

export const VIEW_LABELS: Record<ScorecardView, string> = {
  table: "Table",
  grid: "Grid",
  curve: "Curve",
};

const FILE = "pairs.json";
const SENTENCE = "The scorecard pools the contingency table across every storm date.";

/** Format a cohort pill label with its dynamic year span derived from `storms`. */
function cohortLabel(base: string, storms: readonly Storm[]): string {
  if (storms.length === 0) return `${base} (0)`;
  const years = storms.map((s) => s.storm_date.slice(0, 4)).sort();
  const min = years[0]!;
  const max = years[years.length - 1]!;
  const span = min === max ? min : `${min}\u2013${max}`;
  return `${base} ${span} (${storms.length})`;
}

export function Scorecard({ index, view }: { index: StormsIndex; view: ScorecardView }) {
  const pairs = usePairsAll(index);
  const [cohort, setCohort] = useState<CohortId>("all");
  const [radius, setRadius] = useRadiusKm(index.radius_km_default);
  const [classMm, setClassMm] = useState(RULER[0]!.threshold_mm);
  const [metric, setMetric] = useState<MetricKey>("hss");
  const rawData = pairs.status === "ready" ? pairs.data : null;

  const years = useMemo(
    () => [...new Set(index.storms.map((s) => s.storm_date.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [index.storms],
  );
  const wcmStorms = useMemo(() => index.storms.filter((s) => s.report_source === "wcm"), [index.storms]);
  const dailyStorms = useMemo(() => index.storms.filter((s) => s.report_source === "spc-daily"), [index.storms]);

  const filtered = useMemo(
    () => (rawData === null ? null : filterCohort(index.storms, rawData, cohort)),
    [index.storms, rawData, cohort],
  );
  const data = filtered?.pairs ?? null;
  const activeStormCount = filtered?.storms.length ?? index.storms.length;
  const maxRadiusKm =
    data !== null && data.length > 0 ? Math.min(...data.map((f) => f.radius_km_max)) : DEFAULT_MAX_RADIUS_KM;
  const activeRadius = clampRadiusKm(radius, maxRadiusKm) ?? 0;

  const table = useMemo(
    () => (data === null || data.length === 0 ? null : pooledRows(data, activeRadius)),
    [data, activeRadius],
  );
  const scored = table !== null && !("error" in table) ? table.scored : null;
  const matrix = useMemo(() => (data === null || data.length === 0 ? [] : sensitivityMatrix(data)), [data]);
  const receipt = useMemo(() => (data === null ? null : pooledReceipt(data, index)), [data, index]);
  const summary = `pooled over ${activeStormCount} storm ${activeStormCount === 1 ? "date" : "dates"}`;

  const cohortOptions: { id: CohortId; label: string; count: number }[] = [
    { id: "all", label: `All (${index.storms.length})`, count: index.storms.length },
    { id: "wcm", label: cohortLabel("WCM", wcmStorms), count: wcmStorms.length },
    { id: "spc-daily", label: cohortLabel("SPC-Daily", dailyStorms), count: dailyStorms.length },
    ...years.map((y) => {
      const count = index.storms.filter((s) => s.storm_date.startsWith(y)).length;
      return {
        id: `year:${y}` as CohortId,
        label: count === 0 ? `${y} (0)` : y,
        count,
      };
    }),
  ];

  let body;
  if (pairs.status === "error") body = <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  else if (pairs.status === "loading") body = pairs.showLoading ? <LoadingState file={FILE} /> : null;
  else if (filtered !== null && filtered.storms.length === 0) {
    body = (
      <EmptyState
        sentence="No storm dates in this cohort."
        link={{ href: "/storms", label: "Browse storms" }}
      />
    );
  } else if (filtered !== null && filtered.pairs.length === 0) {
    body = <ErrorState error={new DataError(FILE, "no matching pairs for cohort")} onRetry={pairs.retry} />;
  } else if (table === null) body = null;
  else if ("error" in table) body = <ErrorState error={table.error} onRetry={pairs.retry} />;
  else if (receipt === null) body = null;
  else if (view === "table") {
    body = <TableView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={FILE} summary={summary} />;
  } else if (view === "grid") {
    body = <GridView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={FILE} summary={summary} />;
  } else {
    body = (
      <>
        <ThresholdCurve rows={table.rows} metric={metric} onMetric={setMetric} highlightMm={classMm} />
        <div class="pane-note">
          <ReceiptChip receipt={receipt} file={FILE} summary={summary} />
        </div>
      </>
    );
  }

  return (
    <>
      <header class="view-header">
        <PageHeader title="Scorecard">
          <div class="view-meta">
            {scored === null ? (
              SENTENCE
            ) : (
              <>
                <span class="mono">{activeStormCount}</span> storm {activeStormCount === 1 ? "date" : "dates"},{" "}
                <span class="mono">{scored}</span> scored reports
              </>
            )}
          </div>
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
                  disabled={opt.count === 0}
                  aria-pressed={cohort === opt.id}
                  onClick={() => setCohort(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <RadiusSlider
            value={activeRadius}
            max={maxRadiusKm}
            onChange={(next) => setRadius(next, maxRadiusKm)}
          />
        </div>
        <SubTabs
          label="Scorecard views"
          tabs={SCORECARD_VIEWS.map((v) => ({ id: v, label: VIEW_LABELS[v], href: href({ area: "scorecard", view: v }) }))}
          selected={view}
        />
      </header>
      <section class="pane view-body" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        <h2 class="visually-hidden">{VIEW_LABELS[view]}</h2>
        {body}
        {view === "curve" && matrix.length > 0 && receipt !== null ? (
          <section class="sensitivity-section" aria-label="Radius by threshold HSS sensitivity matrix">
            <div class="sensitivity-header">
              <h2>HSS sensitivity matrix</h2>
              <span class="view-meta">
                Active: <span class="mono">R = {activeRadius} km</span>, <span class="mono">&ge; {classMm} mm</span>.
              </span>
            </div>
            <div class="table-scroll">
              <table class="table">
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
                      <tr key={rKm} data-active={rKm === activeRadius}>
                        <th scope="row" class="mono">
                          {rKm} km
                        </th>
                        {rowCells.map((cell) => {
                          const selected = cell.radiusKm === activeRadius && cell.thresholdMm === classMm;
                          return (
                            <td key={cell.thresholdMm} class="num">
                              <button
                                type="button"
                                class="button button-small sensitivity-cell mono"
                                aria-pressed={selected}
                                title={`R=${cell.radiusKm} km, >= ${cell.thresholdMm} mm: a=${cell.hits}, b=${cell.false_alarms}, c=${cell.misses}, d=${cell.correct_negatives}`}
                                onClick={() => {
                                  setRadius(cell.radiusKm, maxRadiusKm);
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