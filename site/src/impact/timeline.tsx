import { PHENOMENA, type Phenomena, type ReportsFile, type WarningsFile } from "../data/types";
import { formatInches } from "../format";
import "../styles/time.css";
import { LAST_STEP, STEPS, STEP_MS, reportStep, stepTime } from "../time/step";
import { WARNING_STYLES } from "./warning-styles";

// The chart is one SVG on the 192-step axis. Its x unit is STEP_PX per step, so x / STEP_PX is the step.
const STEP_PX = 5;
const WIDTH = STEPS * STEP_PX;
const ROW_H = 16;
const GAP = 8;
const REPORTS_H = 40;
const WARNINGS_H = ROW_H * PHENOMENA.length;
const REPORTS_Y = WARNINGS_H + GAP;
const HEIGHT = REPORTS_Y + REPORTS_H;
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const showStep = (n: number) => String(Math.round(n * 10) / 10);
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const axisLabel = (date: string, step: number) => `12Z ${DAY.format(stepTime(date, step))}`;

interface Props {
  date: string;
  step: number;
  warnings: WarningsFile | null;
  /** The one line that tells why `warnings` is null; null while the file loads. */
  note: string | null;
  reports: ReportsFile | null;
  onStep: (step: number) => void;
}

type StripClick = (event: { clientX: number; currentTarget: { getBoundingClientRect(): { left: number; width: number } } }) => void;

/**
 * Warnings and reports on one 48-hour axis, with a cursor at the slider step.
 * A click on a strip moves the step. The slider stays the keyboard path, so the strips take no focus.
 * shortcut: bars that overlap in one row draw on top of each other; the Data pane table lists every one.
 */
export function Timeline({ date, step, warnings, note, reports, onStep }: Props) {
  const bars = warningBars(warnings, date);
  const ticks = reportTicks(reports);
  const pick: StripClick = (event) => onStep(stepAt(event.clientX, event.currentTarget.getBoundingClientRect()));
  const end = stepTime(date, STEPS).toISOString().slice(0, 10);
  const title = `Storm timeline for ${date}, 12:00 UTC to 12:00 UTC ${end}: ${plural(bars.length, "warning")}, ${plural(ticks.length, "report")}.`;
  const cursorX = step * STEP_PX;
  return (
    <section class="timeline" aria-labelledby="timeline-heading">
      <h3 id="timeline-heading" class="timeline-heading">
        Storm timeline
      </h3>
      <div class="timeline-body">
        <ul class="timeline-labels mono" aria-hidden="true">
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
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            height={HEIGHT}
            role="img"
            aria-labelledby={TITLE_ID}
          >
            <title id={TITLE_ID}>{title}</title>
            <rect class="timeline-strip" data-strip="warnings" x={0} y={0} width={WIDTH} height={WARNINGS_H} onClick={pick} />
            <rect class="timeline-strip" data-strip="reports" x={0} y={REPORTS_Y} width={WIDTH} height={REPORTS_H} onClick={pick} />
            {AXIS_STEPS.slice(1, -1).map((at) => (
              <line key={at} class="timeline-grid" x1={at * STEP_PX} x2={at * STEP_PX} y1={0} y2={HEIGHT} />
            ))}
            {bars.map((bar) => {
              const style = WARNING_STYLES[bar.phenomena];
              const y = PHENOMENA.indexOf(bar.phenomena) * ROW_H + ROW_H / 2;
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
                y1={REPORTS_Y + TICK_INSET}
                y2={HEIGHT - TICK_INSET}
              />
            ))}
            <line class="timeline-cursor" x1={cursorX} x2={cursorX} y1={0} y2={HEIGHT} />
          </svg>
          {warnings !== null && bars.length === 0 ? <p class="timeline-empty">No warnings in the window</p> : null}
          {warnings === null && note !== null ? <p class="timeline-empty">{note}</p> : null}
          <div class="timeline-axis mono" aria-hidden="true">
            {AXIS_STEPS.map((at) => (
              <span key={at}>{axisLabel(date, at)}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const UTC_MINUTE = (iso: string) => iso.slice(0, 16).replace("T", " ");

/** The chart numbers as tables for screen readers and the Data pane: the same bars and ticks, step for step. */
export function TimelineTables({ date, warnings, reports }: Omit<Props, "step" | "note" | "onStep">) {
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
