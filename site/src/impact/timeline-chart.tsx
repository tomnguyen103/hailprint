import { STEPS } from "../data/constants";
import { PHENOMENA, type ReportsFile, type WarningsFile } from "../data/types";
import { stepTime } from "../time/step";
import { dropOf } from "./internet";
import { percentText } from "./power";
import { type Bar, type InternetSeries, type PowerSeries, type Tick, barKey, runsOf, stepAt } from "./series";
import { WARNING_STYLES } from "./warning-styles";

// The chart is one SVG on the 192-step axis. Its x unit is STEP_PX per step, so x / STEP_PX is the step.
const STEP_PX = 5;
const WIDTH = STEPS * STEP_PX;
export const ROW_H = 16;
export const GAP = 8;
export const REPORTS_H = 40;
const WARNINGS_H = ROW_H * PHENOMENA.length;
/** The power row sits above the warnings row, so the rows below it move down when a power file is drawn. */
export const POWER_H = 40;
const POWER_PAD = 4;
/** The internet row sits between the power row and the warnings row. */
export const NET_H = 40;
const NET_PAD = 4;
/** The bar stroke in screen px; the dash lengths scale from it. */
const BAR_PX = 6;
const TICK_INSET = 6;
export const AXIS_STEPS = [0, STEPS / 2, STEPS];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The y of every row, top to bottom: power, internet, warnings, reports. Each row below moves down by the rows drawn above it. */
export function layout(withPower: boolean, withInternet: boolean) {
  const internetY = withPower ? POWER_H + GAP : 0;
  const warningsY = withInternet ? internetY + NET_H + GAP : internetY;
  const reportsY = warningsY + WARNINGS_H + GAP;
  return { internetY, warningsY, reportsY, height: reportsY + REPORTS_H };
}

/** The y of a ratio inside the internet row, which spans 0 to NET_H. */
const netY = ({ top, bottom }: InternetSeries, ratio: number) =>
  NET_H - NET_PAD - ((ratio - bottom) / (top - bottom)) * (NET_H - 2 * NET_PAD);

/** One path per run of values, a point at the middle of each step. A run of one step is a dot. */
function linePaths(values: readonly (number | null)[], yOf: (value: number | null) => number): string[] {
  return runsOf(values)
    .filter((run) => !run.gap)
    .map((run) => {
      const points = values.slice(run.from, run.to).map((value, i) => `${(run.from + i + 0.5) * STEP_PX} ${yOf(value).toFixed(2)}`);
      return `M${(points.length === 1 ? [...points, ...points] : points).join("L")}`;
    });
}

/** One rectangle per run of null steps, as tall as its row. A plain function, so the vnodes sit in the tree of the caller. */
function gapRects(values: readonly (number | null)[], className: string, height: number) {
  return runsOf(values)
    .filter((run) => run.gap)
    .map((run) => (
      <rect key={run.from} class={className} x={run.from * STEP_PX} y={0} width={(run.to - run.from) * STEP_PX} height={height} />
    ));
}

function internetTitle({ county, low, lowStep, gapSteps }: InternetSeries): string {
  if (low === null) return `${county.name} County: no data.`;
  const parts = [lowStep === null ? "no drop below baseline" : `largest drop ${percentText(dropOf(low))} below baseline at step ${lowStep}`];
  if (gapSteps > 0) parts.push(`${plural(gapSteps, "step")} without data`);
  return `${county.name} County: ${parts.join("; ")}.`;
}

function powerTitle({ county, peak, peakStep, gapSteps }: PowerSeries): string {
  if (peak === null) return `${county.name} County: no data.`;
  const parts = [peakStep === null ? "no customers out" : `peak ${percentText(peak)} at step ${peakStep}`];
  if (gapSteps > 0) parts.push(`${plural(gapSteps, "step")} without data`);
  return `${county.name} County: ${parts.join("; ")}.`;
}

type StripClick = (event: { clientX: number; currentTarget: { getBoundingClientRect(): { left: number; width: number } } }) => void;

export type Rows = ReturnType<typeof layout>;

export interface ChartInput {
  /** The id of the `<title>` that names the chart. */
  titleId: string;
  date: string;
  step: number;
  warnings: WarningsFile | null;
  reports: ReportsFile | null;
  bars: Bar[];
  ticks: Tick[];
  series: PowerSeries | null;
  net: InternetSeries | null;
  /** The one line that tells why `net` is null or off; a line turns the internet row on. */
  internetNote: string | null;
  withInternet: boolean;
  rows: Rows;
  onStep: (step: number) => void;
}

/** The chart name for screen readers: the date range and one count per row. */
function chartTitle({ date, warnings, reports, bars, ticks, series, net, withInternet }: ChartInput): string {
  const end = stepTime(date, STEPS).toISOString().slice(0, 10);
  // A null file reads as unavailable, never as a count of zero.
  const counts = [
    warnings === null ? "warnings unavailable" : plural(bars.length, "warning"),
    reports === null ? "reports unavailable" : plural(ticks.length, "report"),
    ...(series === null ? [] : [`${series.county.name} power ${series.peak === null ? "unavailable" : `peak ${percentText(series.peak)}`}`]),
    ...(!withInternet
      ? []
      : [
          net === null || net.low === null
            ? "internet reachability unavailable"
            : net.lowStep === null
              ? `${net.county.name} internet reachability no drop below baseline`
              : `${net.county.name} internet reachability largest drop ${percentText(dropOf(net.low))}`,
        ]),
  ];
  return `Storm timeline for ${date}, 12:00 UTC to 12:00 UTC ${end}: ${counts.join(", ")}.`;
}

/**
 * The chart SVG: the strips, the power and internet lines, the warning bars, the report ticks, and the cursor at the slider step.
 * A click on a strip moves the step. The slider stays the keyboard path, so the strips take no focus.
 * A plain function, so a test reads the vnodes without a renderer.
 * shortcut: bars that overlap in one row draw on top of each other; the Data pane table lists every one.
 */
export function chartSvg(input: ChartInput) {
  const { titleId, step, bars, ticks, series, net, internetNote, withInternet, rows, onStep } = input;
  const { internetY, warningsY, reportsY, height } = rows;
  const pick: StripClick = (event) => onStep(stepAt(event.clientX, event.currentTarget.getBoundingClientRect()));
  const cursorX = step * STEP_PX;
  const powerSpan = POWER_H - 2 * POWER_PAD;
  return (
    <svg
      class="timeline-chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      height={height}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{chartTitle(input)}</title>
      {series === null ? null : (
        <rect class="timeline-strip" data-strip="power" x={0} y={0} width={WIDTH} height={POWER_H} onClick={pick}>
          <title>{powerTitle(series)}</title>
        </rect>
      )}
      {!withInternet ? null : (
        <rect class="timeline-strip" data-strip="internet" x={0} y={internetY} width={WIDTH} height={NET_H} onClick={pick}>
          <title>{net === null ? internetNote : internetTitle(net)}</title>
        </rect>
      )}
      <rect class="timeline-strip" data-strip="warnings" x={0} y={warningsY} width={WIDTH} height={WARNINGS_H} onClick={pick} />
      <rect class="timeline-strip" data-strip="reports" x={0} y={reportsY} width={WIDTH} height={REPORTS_H} onClick={pick} />
      {AXIS_STEPS.slice(1, -1).map((at) => (
        <line key={at} class="timeline-grid" x1={at * STEP_PX} x2={at * STEP_PX} y1={0} y2={height} />
      ))}
      {series === null ? null : gapRects(series.shares, "timeline-power-gap", POWER_H)}
      {series === null
        ? null
        : linePaths(series.shares, (share) => POWER_H - POWER_PAD - ((share ?? 0) / series.scale) * powerSpan).map((d, i) => (
            <path key={i} class="timeline-power-line" d={d} />
          ))}
      {net === null || net.low === null ? null : (
        <g transform={`translate(0 ${internetY})`}>
          <line class="timeline-net-base" x1={0} x2={WIDTH} y1={netY(net, 1)} y2={netY(net, 1)} />
          {gapRects(net.ratios, "timeline-net-gap", NET_H)}
          {linePaths(net.ratios, (ratio) => netY(net, ratio ?? 1)).map((d, i) => (
            <path key={i} class="timeline-net-line" d={d} />
          ))}
        </g>
      )}
      {bars.map((bar) => {
        const style = WARNING_STYLES[bar.phenomena];
        const y = warningsY + PHENOMENA.indexOf(bar.phenomena) * ROW_H + ROW_H / 2;
        return (
          <line
            key={barKey(bar)}
            class={`timeline-bar timeline-bar-${bar.phenomena.toLowerCase()}`}
            data-phenomena={bar.phenomena}
            x1={bar.from * STEP_PX}
            x2={bar.to * STEP_PX}
            y1={y}
            y2={y}
            stroke-dasharray={style.dash ? style.dash.map((n) => n * BAR_PX).join(" ") : undefined}
          />
        );
      })}
      {ticks.map((tick) => (
        <line
          key={tick.id}
          class="timeline-tick"
          x1={tick.step * STEP_PX}
          x2={tick.step * STEP_PX}
          y1={reportsY + TICK_INSET}
          y2={height - TICK_INSET}
        />
      ))}
      <line class="timeline-cursor" x1={cursorX} x2={cursorX} y1={0} y2={height} />
    </svg>
  );
}
