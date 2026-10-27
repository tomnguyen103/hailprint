import { useMemo, useState } from "preact/hooks";
import "../styles/scorecard.css";
import { DataError, type StormsIndex } from "../data/types";
import { pool, scoredCount, type PooledRow } from "../pool";
import { rescore } from "../rescore";
import { SCORECARD_VIEWS, href, type ScorecardView } from "../router";
import { RULER } from "../ruler";
import { RadiusSlider } from "../shell/radius-slider";
import { ErrorState, LoadingState, PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { usePairsAll } from "../state/pairs-all";
import { GridView } from "./grid-view";
import { TableView } from "./table-view";

export const VIEW_LABELS: Record<ScorecardView, string> = {
  table: "Table",
  grid: "Grid",
  curve: "Curve",
};

const FILE = "pairs.json";
const SENTENCE = "The scorecard pools the contingency table across every storm date.";

/** The pooled rows at a radius, or the DataError a malformed file raises. */
export function pooledRows(pairs: Parameters<typeof rescore>[0][], radius: number): { rows: PooledRow[] } | { error: DataError } {
  try {
    return {
      rows: pool(
        pairs.map((p) => rescore(p, radius)),
        pairs.map((p) => scoredCount(p, radius)),
      ),
    };
  } catch (error) {
    if (error instanceof DataError) return { error };
    return { error: new DataError(FILE, error instanceof Error ? error.message : String(error)) };
  }
}

export function Scorecard({ index, view }: { index: StormsIndex; view: ScorecardView }) {
  const pairs = usePairsAll(index);
  const [radius, setRadius] = useState(index.radius_km_default);
  const [classMm, setClassMm] = useState(RULER[0]!.threshold_mm);
  const data = pairs.status === "ready" ? pairs.data : null;
  const table = useMemo(() => (data === null ? null : pooledRows(data, radius)), [data, radius]);
  const scored = useMemo(() => data?.reduce((acc, p) => acc + scoredCount(p, radius), 0) ?? null, [data, radius]);

  // shortcut: the pooled receipt chip opens the newest pairs.json receipt, upgrade when a pooled receipt is published
  const receipt = data?.[0]?.receipt;
  const file = `${FILE}, pooled over ${index.storms.length} storm dates`;

  let body;
  if (pairs.status === "error") body = <ErrorState error={pairs.error} onRetry={pairs.retry} />;
  else if (pairs.status === "loading" || table === null) body = pairs.showLoading ? <LoadingState file={FILE} /> : null;
  else if ("error" in table) body = <ErrorState error={table.error} onRetry={pairs.retry} />;
  else if (receipt === undefined) body = null;
  else if (view === "table") {
    body = <TableView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={file} />;
  } else if (view === "grid") {
    body = <GridView rows={table.rows} classMm={classMm} onClass={setClassMm} receipt={receipt} file={file} />;
  } else body = null;

  return (
    <>
      <PageHeader title="Scorecard">
        <p>
          {scored === null ? (
            SENTENCE
          ) : (
            <>
              <span class="mono">{index.storms.length}</span> storm dates, <span class="mono">{scored}</span> scored reports
            </>
          )}
        </p>
      </PageHeader>
      {data !== null && data[0] !== undefined ? (
        <div class="scorecard-controls">
          <RadiusSlider value={radius} max={data[0].radius_km_max} onChange={setRadius} />
        </div>
      ) : null}
      <SubTabs
        label="Scorecard views"
        tabs={SCORECARD_VIEWS.map((v) => ({ id: v, label: VIEW_LABELS[v], href: href({ area: "scorecard", view: v }) }))}
        selected={view}
      />
      <section class="pane" role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
        <h2 class="visually-hidden">{VIEW_LABELS[view]}</h2>
        {body}
      </section>
    </>
  );
}