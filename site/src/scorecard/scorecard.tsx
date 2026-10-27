import { useMemo, useState } from "preact/hooks";
import "../styles/scorecard.css";
import type { StormsIndex } from "../data/types";
import type { MetricKey } from "../format";
import { pooledRows } from "../pool";
import { SCORECARD_VIEWS, href, type ScorecardView } from "../router";
import { RULER } from "../ruler";
import { RADIUS_MAX_FALLBACK, RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState, PageHeader } from "../shell/states";
import { SubTabs } from "../shell/sub-tabs";
import { usePairsAll } from "../state/pairs-all";
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

export function Scorecard({ index, view }: { index: StormsIndex; view: ScorecardView }) {
  const pairs = usePairsAll(index);
  const [radius, setRadius] = useState(index.radius_km_default);
  const [classMm, setClassMm] = useState(RULER[0]!.threshold_mm);
  const [metric, setMetric] = useState<MetricKey>("hss");
  const data = pairs.status === "ready" ? pairs.data : null;
  const table = useMemo(() => (data === null ? null : pooledRows(data, radius)), [data, radius]);
  const scored = table !== null && !("error" in table) ? table.scored : null;

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
              <span class="mono">{index.storms.length}</span> storm dates, <span class="mono">{scored}</span> scored reports
            </>
          )}
        </p>
      </PageHeader>
      <div class="scorecard-controls">
        <RadiusSlider value={radius} max={data?.[0]?.radius_km_max ?? RADIUS_MAX_FALLBACK} onChange={setRadius} />
      </div>
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