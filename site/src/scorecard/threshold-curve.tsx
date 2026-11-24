import { useEffect, useRef, useState } from "preact/hooks";
import type { PooledRow } from "../pool";
import { METRIC_LABELS, METRICS, formatInches, type MetricKey } from "../format";
import { objectName } from "../ruler";
import { HEIGHT, LITERATURE_HSS, MARGIN, WIDTH, pathOf, xOf, yMinOf, yOf } from "./curve";

const MARKER_R = 4;
// After the first ResizeObserver callback, the viewBox width equals the pixel width (scale 1), so 22 units give a 44 px target.
// shortcut: at 375 px the closest points sit 40 px apart, so two neighbouring 44 px targets overlap by 4 px; a smaller radius would break the 44 px tap floor.
const HIT_R = 22;
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
  const [roving, setRoving] = useState(0);
  const hitTargets = useRef<(SVGCircleElement | null)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(WIDTH);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const yMin = yMinOf(rows.map((row) => row[metric]));
  const yBottom = yOf(yMin, yMin);
  const yTicks = yMin < 0 ? [yMin, 0, 0.5, 1] : Y_TICKS;
  const points = rows.map((row) => {
    const value = row[metric];
    return { row, value, x: xOf(row.threshold_in, width), y: value === null ? null : yOf(value, yMin) };
  });
  const validIndices = points.flatMap((p, idx) => (p.y !== null && p.value !== null ? [idx] : []));
  const activeRoving = validIndices.includes(roving) ? roving : (validIndices[0] ?? 0);
  const active = hover ?? focus;
  const tip = active === null ? null : points[active];

  const focusMarker = (idx: number) => {
    setRoving(idx);
    hitTargets.current[idx]?.focus();
  };
  const move = (dir: 1 | -1) => {
    const current = focus ?? activeRoving;
    let i = current + dir;
    while (i >= 0 && i < points.length) {
      if (points[i]?.y !== null) {
        focusMarker(i);
        return;
      }
      i += dir;
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (validIndices[0] !== undefined) focusMarker(validIndices[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = validIndices[validIndices.length - 1];
      if (last !== undefined) focusMarker(last);
    }
  };

  let tooltip = null;
  if (tip && tip.y !== null && tip.value !== null) {
    const text = `${objectName(tip.row.threshold_mm)}, ${formatInches(tip.row.threshold_in)}, ${METRIC_LABELS[metric]} ${tip.value.toFixed(2)}`;
    const w = text.length * TIP_CHAR_W + 16;
    const x = Math.max(0, Math.min(tip.x - w / 2, width - w));
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
        ref={svgRef}
        class="curve"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`${METRIC_LABELS[metric]} by threshold`}
        onKeyDown={onKeyDown}
      >
        <line class="axis" x1={MARGIN.left} y1={yBottom} x2={width - MARGIN.right} y2={yBottom} />
        <line class="axis" x1={MARGIN.left} y1={yOf(1, yMin)} x2={MARGIN.left} y2={yBottom} />
        {yMin < 0 ? (
          <line class="literature" x1={MARGIN.left} y1={yOf(0, yMin)} x2={width - MARGIN.right} y2={yOf(0, yMin)} />
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
        <text x={width - MARGIN.right} y={HEIGHT - 4} text-anchor="end">
          threshold, in
        </text>
        {metric === "hss" ? (
          <g>
            <line
              class="literature"
              x1={MARGIN.left}
              y1={yOf(LITERATURE_HSS, yMin)}
              x2={width - MARGIN.right}
              y2={yOf(LITERATURE_HSS, yMin)}
            />
            <text x={width - MARGIN.right} y={yOf(LITERATURE_HSS, yMin) - 6} text-anchor="end">
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
              <circle class="marker" cx={p.x} cy={p.y} r={MARKER_R} aria-hidden="true" />
              <circle
                ref={(el) => {
                  hitTargets.current[i] = el;
                }}
                class="marker-hit"
                cx={p.x}
                cy={p.y}
                r={HIT_R}
                tabIndex={i === activeRoving ? 0 : -1}
                aria-label={`${objectName(p.row.threshold_mm)}, ${formatInches(p.row.threshold_in)}, ${METRIC_LABELS[metric]} ${p.value.toFixed(2)}`}
                onClick={() => focusMarker(i)}
                onFocus={() => {
                  setRoving(i);
                  setFocus(i);
                }}
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