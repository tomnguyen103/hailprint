import type { Metric } from "../data/types";
import { metricText } from "../format";

/** Render a metric to two decimals, or an en dash with a screen-reader label when null. */
export function MetricText({ value }: { value: Metric }) {
  const { text, hidden } = metricText(value);
  return (
    <>
      <span aria-hidden={hidden !== null ? "true" : undefined}>{text}</span>
      {hidden ? <span class="visually-hidden">{hidden}</span> : null}
    </>
  );
}
