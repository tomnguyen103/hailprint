import { useRef, useState } from "preact/hooks";
import type { PooledRow } from "../pool";
import { METRIC_LABELS, METRICS, formatInches, type MetricKey } from "../format";
import { objectName } from "../ruler";
import { HEIGHT, LITERATURE_HSS, MARGIN, WIDTH, pathOf, xOf, yMinOf, yOf } from "./curve";

const MARKER_R = 4;
const HIGHLIGHT_R = 6;
const TIP_H = 24;
const TIP_CHAR_W = 7.2;
const Y_TICKS = [0, 0.5, 1];

export function ThresholdCurve({
  rows,
  metric,
  onMetric,
  highlightMm,
}: {
  rows: PooledRow[];
  metric: MetricKey;
  onMetric: (metric: MetricKey) => void;
  highlightMm?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const markers = useRef<(SVGCircleElement | null)[]>([]);
  const yMin = yMinOf(rows.map((row) => row[metric]));
  const yBottom = yOf(yMin, yMin);
  const yTicks = yMin < 0 ? [yMin, 0, 0.5, 1] : Y_TICKS;
  const points = rows.map((row) => {
    const value = row[metric];
    return { row, value, x: xOf(row.threshold_in), y: value === null ? null : yOf(value, yMin) };
  });
  const active = hover ?? focus;
  const tip = active === null ? null : points[active];

  const move = (dir: 1 | -1) => {
    let i = (focus ?? -1) + dir;
    while (i >= 0 && i < points.length) {
      if (points[i]?.y !== null) {
        markers.current[i]?.focus();
        return;
      }
      i += dir;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    move(event.key === "ArrowRight" ? 1 : -1);
  };

  let tooltip = null;
  if (tip && tip.y !== null && tip.value !== null) {
    const text = `${objectName(tip.row.threshold_mm)}, ${formatInches(tip.row.threshold_in)}, ${METRIC_LABELS[metric]} ${tip.value.toFixed(2)}`;
    const w = text.length * TIP_CHAR_W + 16;
    const x = Math.min(Math.max(0, tip.x - w / 2), WIDTH - w);
    const above = tip.y - MARKER_R - 8 - TIP_H;
    const y = above >= 0 ? above : tip.y + MARKER_R + 8;
    tooltip = (
      <g class="curve-tooltip" aria-hidden="true">
        <rect x={x} y={y} width={w} height={TIP_H} rx={4} />
        <text x={x + w / 2} y={y + TIP_H / 2} text-anchor="middle" dominant-baseline="central">
          {text}
        </text>
      </g>
    );
  }

  return (
    <div>
      <div class="metric-pick" role="group" aria-label="Metric">
        {METRICS.map((m) => (
          <button key={m} type="button" class="button button-small" aria-pressed={m === metric} onClick={() => onMetric(m)}>
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>
      <svg
        class="curve"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${METRIC_LABELS[metric]} by threshold`}
        onKeyDown={onKeyDown}
      >
        <line class="axis" x1={MARGIN.left} y1={yBottom} x2={WIDTH - MARGIN.right} y2={yBottom} />
        <line class="axis" x1={MARGIN.left} y1={yOf(1, yMin)} x2={MARGIN.left} y2={yBottom} />
        {yMin < 0 ? (
          <line class="literature" x1={MARGIN.left} y1={yOf(0, yMin)} x2={WIDTH - MARGIN.right} y2={yOf(0, yMin)} />
        ) : null}
        {yTicks.map((t) => (
          <g key={t}>
            <line class="axis" x1={MARGIN.left - 4} y1={yOf(t, yMin)} x2={MARGIN.left} y2={yOf(t, yMin)} />
            <text x={MARGIN.left - 8} y={yOf(t, yMin)} text-anchor="end" dominant-baseline="central">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {points.map((p) => (
          <text key={p.row.threshold_mm} x={p.x} y={yBottom + 20} text-anchor="middle">
            {p.row.threshold_in.toFixed(2)}
          </text>
        ))}
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 4} text-anchor="end">
          threshold, in
        </text>
        {metric === "hss" ? (
          <g>
            <line
              class="literature"
              x1={MARGIN.left}
              y1={yOf(LITERATURE_HSS, yMin)}
              x2={WIDTH - MARGIN.right}
              y2={yOf(LITERATURE_HSS, yMin)}
            />
            <text x={WIDTH - MARGIN.right} y={yOf(LITERATURE_HSS, yMin) - 6} text-anchor="end">
              Literature HSS {LITERATURE_HSS.toFixed(2)}
            </text>
          </g>
        ) : null}
        <path class="series" d={pathOf(points)} />
        {points.map((p, i) =>
          p.y === null || p.value === null ? null : (
            <g key={p.row.threshold_mm}>
              {p.row.threshold_mm === highlightMm ? (
                <circle class="highlight" cx={p.x} cy={p.y} r={HIGHLIGHT_R} />
              ) : null}
              <circle
                ref={(el) => {
                  markers.current[i] = el;
                }}
                class="marker"
                cx={p.x}
                cy={p.y}
                r={MARKER_R}
                tabIndex={0}
                aria-label={`${objectName(p.row.threshold_mm)}, ${formatInches(p.row.threshold_in)}, ${METRIC_LABELS[metric]} ${p.value.toFixed(2)}`}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ),
        )}
        {tooltip}
      </svg>
    </div>
  );
}