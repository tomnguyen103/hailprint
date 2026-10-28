import { PHENOMENA, type Phenomena, type PowerCounty, type PowerFile, type ReportsFile, type WarningsFile } from "../data/types";
import { formatCount, formatInches } from "../format";
import "../styles/time.css";
import { LAST_STEP, STEPS, STEP_MS, reportStep, stepTime } from "../time/step";
import { ODIN_LABEL, percentText, shareOut } from "./power";
import { WARNING_STYLES } from "./warning-styles";

// The chart is one SVG on the 192-step axis. Its x unit is STEP_PX per step, so x / STEP_PX is the step.
const STEP_PX = 5;
const WIDTH = STEPS * STEP_PX;
const ROW_H = 16;
const GAP = 8;
const REPORTS_H = 40;
const WARNINGS_H = ROW_H * PHENOMENA.length;
/** The power row sits above the warnings row, so the rows below it move down when a power file is drawn. */
const POWER_H = 40;
const POWER_PAD = 4;
/** The scale of the power row never drops below 1% of customers, so a tiny outage stays a small line. */
const SCALE_FLOOR = 0.01;
/** The bar stroke in screen px; the dash lengths scale from it. */
const BAR_PX = 6;
const TICK_INSET = 6;
const TITLE_ID = "timeline-title";
const AXIS_STEPS = [0, STEPS / 2, STEPS];

export interface Bar {
  phenomena: Phenomena;
  eventid: number;
  /** Fractional steps, clipped to the window. */
  from: number;
  to: number;
  begin: string;
  end: string;
}

export interface Tick {
  id: number;
  step: number;
  time: string;
  location: string;
  size_in: number;
}

/** One bar per warning polygon inside the window, in row order. A polygon that starts early clips at step 0. */
export function warningBars(file: WarningsFile | null, date: string): Bar[] {
  if (file === null) return [];
  const origin = stepTime(date, 0).getTime();
  const bars = file.features.flatMap(({ properties: p }): Bar[] => {
    const from = Math.max(0, (Date.parse(p.polygon_begin) - origin) / STEP_MS);
    const to = Math.min(STEPS, (Date.parse(p.polygon_end) - origin) / STEP_MS);
    return to > from ? [{ phenomena: p.phenomena, eventid: p.eventid, from, to, begin: p.polygon_begin, end: p.polygon_end }] : [];
  });
  return bars.sort((a, b) => PHENOMENA.indexOf(a.phenomena) - PHENOMENA.indexOf(b.phenomena) || a.from - b.from || a.eventid - b.eventid);
}

/** The row key of a bar. The eventid repeats across types, so the key names the type too. */
export const barKey = (bar: Bar) => `${bar.phenomena}-${bar.eventid}-${bar.begin}`;

/** One tick per report at its report step, earliest first. A report with a bad time has no tick. */
export function reportTicks(file: ReportsFile | null): Tick[] {
  const ticks = (file?.features ?? []).flatMap(({ properties: p }): Tick[] => {
    const step = reportStep(p.time);
    return step === null ? [] : [{ id: p.id, step, time: p.time, location: p.location, size_in: p.size_in }];
  });
  return ticks.sort((a, b) => a.step - b.step || a.id - b.id);
}

/** The step under a click: the share of the strip width, floored, from 0 to 191. */
export function stepAt(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0;
  return Math.min(LAST_STEP, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * STEPS)));
}

export interface Run {
  /** The first step of the run and the step after its last one. */
  from: number;
  to: number;
  gap: boolean;
}

/** Split a series into runs of values and runs of nulls. A null step is a gap, never a zero. */
export function runsOf(values: readonly (number | null)[]): Run[] {
  const runs: Run[] = [];
  values.forEach((value, i) => {
    const gap = value === null;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.gap === gap) last.to = i + 1;
    else runs.push({ from: i, to: i + 1, gap });
  });
  return runs;
}

export interface PowerSeries {
  county: PowerCounty;
  /** Share out per step; null where the source has no row. */
  shares: (number | null)[];
  /** The largest share; null when every step is a gap. */
  peak: number | null;
  /** The first step of the peak; null when the peak is null or zero. */
  peakStep: number | null;
  gapSteps: number;
  /** The share at the top of the row: the peak, or 1% when the peak is smaller. */
  scale: number;
}

/** The picked county as shares, with the peak, the gap count and the row scale; null for a file or county that is absent. */
export function powerSeries(file: PowerFile | null, fips: string): PowerSeries | null {
  const county = file?.counties.find((c) => c.fips === fips);
  if (county === undefined) return null;
  const shares = county.out.map((out) => shareOut(out, county.customers));
  let peak: number | null = null;
  let peakStep: number | null = null;
  for (let i = 0; i < shares.length; i++) {
    const share = shares[i] ?? null;
    if (share !== null && (peak === null || share > peak)) {
      peak = share;
      peakStep = share > 0 ? i : null;
    }
  }
  return { county, shares, peak, peakStep, gapSteps: shares.filter((s) => s === null).length, scale: Math.max(peak ?? 0, SCALE_FLOOR) };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const showStep = (n: number) => String(Math.round(n * 10) / 10);
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const axisLabel = (date: string, step: number) => `12Z ${DAY.format(stepTime(date, step))}`;
const NO_DATA = percentText(null);

/** The y of every row; the warnings and reports rows move down by the power row when one is drawn. */
function layout(withPower: boolean) {
  const warningsY = withPower ? POWER_H + GAP : 0;
  const reportsY = warningsY + WARNINGS_H + GAP;
  return { warningsY, reportsY, height: reportsY + REPORTS_H };
}

/** One path per run of values, a point at the middle of each step. A run of one step is a dot. */
function powerPaths(series: PowerSeries): string[] {
  const span = POWER_H - 2 * POWER_PAD;
  return runsOf(series.shares)
    .filter((run) => !run.gap)
    .map((run) => {
      const points = series.shares
        .slice(run.from, run.to)
        .map((share, i) => `${(run.from + i + 0.5) * STEP_PX} ${(POWER_H - POWER_PAD - ((share ?? 0) / series.scale) * span).toFixed(2)}`);
      return `M${(points.length === 1 ? [...points, ...points] : points).join("L")}`;
    });
}

function powerTitle({ county, peak, peakStep, gapSteps }: PowerSeries): string {
  if (peak === null) return `${county.name} County: no data.`;
  const parts = [peakStep === null ? "no customers out" : `peak ${percentText(peak)} at step ${peakStep}`];
  if (gapSteps > 0) parts.push(`${plural(gapSteps, "step")} without data`);
  return `${county.name} County: ${parts.join("; ")}.`;
}

interface Props {
  date: string;
  step: number;
  warnings: WarningsFile | null;
  /** The one line that tells why `warnings` is null; null while the file loads. */
  note: string | null;
  reports: ReportsFile | null;
  /** The power file; null draws no power row. */
  power: PowerFile | null;
  /** The picked county; a county the file lacks draws no power row. */
  fips: string;
  onStep: (step: number) => void;
}

type StripClick = (event: { clientX: number; currentTarget: { getBoundingClientRect(): { left: number; width: number } } }) => void;

/**
 * Warnings and reports on one 48-hour axis, with a cursor at the slider step.
 * A click on a strip moves the step. The slider stays the keyboard path, so the strips take no focus.
 * shortcut: bars that overlap in one row draw on top of each other; the Data pane table lists every one.
 */
export function Timeline({ date, step, warnings, note, reports, power, fips, onStep }: Props) {
  const bars = warningBars(warnings, date);
  const ticks = reportTicks(reports);
  const series = powerSeries(power, fips);
  const { warningsY, reportsY, height } = layout(series !== null);
  const pick: StripClick = (event) => onStep(stepAt(event.clientX, event.currentTarget.getBoundingClientRect()));
  const end = stepTime(date, STEPS).toISOString().slice(0, 10);
  // A null file reads as unavailable, never as a count of zero.
  const counts = [
    warnings === null ? "warnings unavailable" : plural(bars.length, "warning"),
    reports === null ? "reports unavailable" : plural(ticks.length, "report"),
    ...(series === null ? [] : [`${series.county.name} power ${series.peak === null ? "unavailable" : `peak ${percentText(series.peak)}`}`]),
  ];
  const title = `Storm timeline for ${date}, 12:00 UTC to 12:00 UTC ${end}: ${counts.join(", ")}.`;
  const cursorX = step * STEP_PX;
  // The empty-state line sits over the warnings row, which the power row moves down.
  const emptyStyle = warningsY > 0 ? { top: `${warningsY}px` } : undefined;
  return (
    <section class="timeline" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" class="timeline-heading">
        Storm timeline
      </h3>
      <div class="timeline-body">
        <ul class="timeline-labels mono" aria-hidden="true">
          {series === null ? null : (
            <li style={{ height: `${POWER_H}px`, marginBottom: `${GAP}px` }}>Power</li>
          )}
          {PHENOMENA.map((phenomena) => (
            <li key={phenomena} style={{ height: `${ROW_H}px` }}>
              {phenomena}
            </li>
          ))}
          <li style={{ height: `${REPORTS_H}px`, marginTop: `${GAP}px` }}>Reports</li>
        </ul>
        <div class="timeline-plot">
          <svg
            class="timeline-chart"
            viewBox={`0 0 ${WIDTH} ${height}`}
            preserveAspectRatio="none"
            height={height}
            role="img"
            aria-labelledby={TITLE_ID}
          >
            <title id={TITLE_ID}>{title}</title>
            {series === null ? null : (
              <rect class="timeline-strip" data-strip="power" x={0} y={0} width={WIDTH} height={POWER_H} onClick={pick}>
                <title>{powerTitle(series)}</title>
              </rect>
            )}
            <rect class="timeline-strip" data-strip="warnings" x={0} y={warningsY} width={WIDTH} height={WARNINGS_H} onClick={pick} />
            <rect class="timeline-strip" data-strip="reports" x={0} y={reportsY} width={WIDTH} height={REPORTS_H} onClick={pick} />
            {AXIS_STEPS.slice(1, -1).map((at) => (
              <line key={at} class="timeline-grid" x1={at * STEP_PX} x2={at * STEP_PX} y1={0} y2={height} />
            ))}
            {series === null
              ? null
              : runsOf(series.shares)
                  .filter((run) => run.gap)
                  .map((run) => (
                    <rect
                      key={run.from}
                      class="timeline-power-gap"
                      x={run.from * STEP_PX}
                      y={0}
                      width={(run.to - run.from) * STEP_PX}
                      height={POWER_H}
                    />
                  ))}
            {series === null ? null : powerPaths(series).map((d, i) => <path key={i} class="timeline-power-line" d={d} />)}
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
          {warnings !== null && bars.length === 0 ? (
            <p class="timeline-empty" style={emptyStyle}>
              No warnings in the window
            </p>
          ) : null}
          {warnings === null && note !== null ? (
            <p class="timeline-empty" style={emptyStyle}>
              {note}
            </p>
          ) : null}
          <div class="timeline-axis mono" aria-hidden="true">
            {AXIS_STEPS.map((at) => (
              <span key={at}>{axisLabel(date, at)}</span>
            ))}
          </div>
          {series === null ? null : (
            <p class="timeline-power-note">
              {`Power out, ${series.county.name} County. Scale 0 to ${percentText(series.scale)}.`}
              {power?.source === "odin" ? <strong class="timeline-power-source">{ODIN_LABEL}</strong> : null}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

const UTC_MINUTE = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** The power strip numbers for the picked county, one row per step: the same shares the strip draws. */
export function PowerTable({ date, power, fips }: { date: string; power: PowerFile; fips: string }) {
  const series = powerSeries(power, fips);
  if (series === null) return <p>No power data for this county</p>;
  return (
    <div class="table-scroll power-table">
      <table class="table">
        <caption>
          {`Power out for ${series.county.name} County, steps from 12:00 UTC on ${date}`}
          {power.source === "odin" ? <span class="power-source">{ODIN_LABEL}</span> : null}
        </caption>
        <thead>
          <tr>
            <th class="num">Step</th>
            <th>Time (UTC)</th>
            <th class="num">Customers out</th>
            <th class="num">Share out</th>
          </tr>
        </thead>
        <tbody>
          {series.county.out.map((out, step) => (
            <tr key={step}>
              <td class="num">{step}</td>
              <td class="mono">{UTC_MINUTE(stepTime(date, step).toISOString())}</td>
              <td class="num">{out === null ? NO_DATA : formatCount(out)}</td>
              <td class="num">{percentText(series.shares[step] ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The chart numbers as tables for screen readers and the Data pane: the same bars and ticks, step for step. */
export function TimelineTables({ date, warnings, reports }: Omit<Props, "step" | "note" | "power" | "fips" | "onStep">) {
  const bars = warningBars(warnings, date);
  const ticks = reportTicks(reports);
  return (
    <>
      {warnings === null ? null : bars.length === 0 ? (
        <p>No warnings in the window</p>
      ) : (
        <div class="table-scroll">
          <table class="table">
            <caption>Warnings in the window, steps from 12:00 UTC on {date}</caption>
            <thead>
              <tr>
                <th>Type</th>
                <th class="num">Event</th>
                <th class="num">From step</th>
                <th class="num">To step</th>
                <th>Begin (UTC)</th>
                <th>End (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {bars.map((bar) => (
                <tr key={barKey(bar)}>
                  <td class="mono">{bar.phenomena}</td>
                  <td class="num">{bar.eventid}</td>
                  <td class="num">{showStep(bar.from)}</td>
                  <td class="num">{showStep(bar.to)}</td>
                  <td class="mono">{UTC_MINUTE(bar.begin)}</td>
                  <td class="mono">{UTC_MINUTE(bar.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reports === null ? null : ticks.length === 0 ? (
        <p>No reports in the window</p>
      ) : (
        <div class="table-scroll">
          <table class="table">
            <caption>Reports in the window, steps from 12:00 UTC on {date}</caption>
            <thead>
              <tr>
                <th class="num">Step</th>
                <th>Time (UTC)</th>
                <th>Location</th>
                <th class="num">Size</th>
              </tr>
            </thead>
            <tbody>
              {ticks.map((tick) => (
                <tr key={tick.id}>
                  <td class="num">{tick.step}</td>
                  <td class="mono">{`${tick.time.slice(0, 2)}:${tick.time.slice(2)}`}</td>
                  <td>{tick.location}</td>
                  <td class="num">{formatInches(tick.size_in)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
