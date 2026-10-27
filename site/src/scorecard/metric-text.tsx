import type { Metric } from "../data/types";
import { metricText } from "../format";

/** A metric to two decimals; null draws an en dash and reads "undefined, zero denominator". */
export function MetricText({ value }: { value: Metric }) {
  const { text, hidden } = metricText(value);
  return (
    <>
      <span aria-hidden={hidden !== null ? "true" : undefined}>{text}</span>
      {hidden ? <span class="visually-hidden">{hidden}</span> : null}
    </>
  );
}