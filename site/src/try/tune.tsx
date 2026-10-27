import { useId, useState } from "preact/hooks";
import type { StormsIndex } from "../data/types";
import { RULER, diameterPx } from "../ruler";
import { METRICS, METRIC_LABELS, type MetricKey } from "../format";
import { MetricText } from "../scorecard/metric-text";
import { ThresholdCurve } from "../scorecard/threshold-curve";
import { ContingencyGrid } from "../shell/contingency-grid";
import { RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { ALL_SCOPE, ScopeSelect, useScopeRows } from "./try";

// shortcut: 20 km stands in for radius_km_max until the first pairs.json arrives, upgrade when storms.json carries it
const RADIUS_MAX_FALLBACK = 20;
const DEFAULT_CLASS = 1; // quarter, 1.00 in

export function Tune({ index }: { index: StormsIndex }) {
  const [scope, setScope] = useState(ALL_SCOPE);
  const [radius, setRadius] = useState(index.radius_km_default);
  const [classIdx, setClassIdx] = useState(DEFAULT_CLASS);
  const [metric, setMetric] = useState<MetricKey>("hss");
  const { load, table, receipt, radiusMax, file } = useScopeRows(index, scope, radius);
  const sliderId = useId();
  const mark = RULER[classIdx] ?? RULER[DEFAULT_CLASS]!;
  const inches = `${mark.threshold_in.toFixed(2)} in`;

  let body = null;
  if (load.status === "error") body = <ErrorState error={load.error} onRetry={load.retry} />;
  else if (table === null) body = load.showLoading ? <LoadingState file="pairs.json" /> : null;
  else if ("error" in table) body = <ErrorState error={table.error} onRetry={load.retry} />;
  else {
    const row = table.rows.find((r) => r.threshold_mm === mark.threshold_mm);
    body =
      row === undefined || receipt === null ? null : (
        <>
          <div class="metric-row" role="group" aria-label={`Metrics, ${mark.object}, ${inches}`}>
            {METRICS.map((m) => (
              <div key={m} class="metric-cell">
                <span class="stat mono">
                  <MetricText value={row[m]} />
                </span>
                <span class="cgrid-label">{METRIC_LABELS[m]}</span>
              </div>
            ))}
          </div>
          <p class="pane-note">
            <ReceiptChip receipt={receipt} file={file} />
          </p>
          <div class="pane-grid">
            <ContingencyGrid row={row} />
            <section>
              <h2>{METRIC_LABELS[metric]} by threshold</h2>
              <ThresholdCurve rows={table.rows} metric={metric} onMetric={setMetric} highlightMm={mark.threshold_mm} />
            </section>
          </div>
        </>
      );
  }

  return (
    <>
      <div class="try-controls">
        <ScopeSelect storms={index.storms} value={scope} onChange={setScope} label="Scope" withAll />
        <RadiusSlider value={radius} max={radiusMax ?? RADIUS_MAX_FALLBACK} onChange={setRadius} />
        <div>
          <div class="radius-slider threshold-slider">
            <label for={sliderId}>Threshold</label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={RULER.length - 1}
              step={1}
              value={classIdx}
              aria-valuetext={`${inches}, ${mark.object}`}
              onInput={(event) => setClassIdx(Number(event.currentTarget.value))}
            />
            <output for={sliderId} class="mono">
              {inches}
            </output>
          </div>
          <div class="ruler-strip">
            {RULER.map((m) => (
              <span
                key={m.threshold_mm}
                class="ruler-mark"
                title={`${m.object}, ${m.threshold_in.toFixed(2)} in`}
                aria-current={m.threshold_mm === mark.threshold_mm ? "true" : undefined}
                style={{ width: diameterPx(m.threshold_in), height: diameterPx(m.threshold_in) }}
              />
            ))}
          </div>
        </div>
      </div>
      {body}
    </>
  );
}