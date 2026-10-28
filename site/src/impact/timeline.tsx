import { STEPS } from "../data/constants";
import { type InternetFile, PHENOMENA, type PowerFile, type ReportsFile, type WarningsFile } from "../data/types";
import { formatCount, formatInches } from "../format";
import "../styles/time.css";
import { stepTime } from "../time/step";
import { dropOf } from "./internet";
import { ODIN_LABEL, percentText } from "./power";
import { type InternetSeries, type PowerSeries, barKey, internetSeries, powerSeries, reportTicks, runsOf, stepAt, warningBars } from "./series";
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
/** The internet row sits between the power row and the warnings row. */
const NET_H = 40;
const NET_PAD = 4;
const NO_SIGNAL = "No county signal";
/** The bar stroke in screen px; the dash lengths scale from it. */
const BAR_PX = 6;
const TICK_INSET = 6;
const TITLE_ID = "timeline-title";
const AXIS_STEPS = [0, STEPS / 2, STEPS];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const showStep = (n: number) => String(Math.round(n * 10) / 10);
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const axisLabel = (date: string, step: number) => `12Z ${DAY.format(stepTime(date, step))}`;
const NO_DATA = percentText(null);

/** The y of every row, top to bottom: power, internet, warnings, reports. Each row below moves down by the rows drawn above it. */
function layout(withPower: boolean, withInternet: boolean) {
  const internetY = withPower ? POWER_H + GAP : 0;
  const warningsY = withInternet ? internetY + NET_H + GAP : internetY;
  const reportsY = warningsY + WARNINGS_H + GAP;
  return { internetY, warningsY, reportsY, height: reportsY + REPORTS_H };
}

/** The y of a ratio inside the internet row, which spans 0 to NET_H. */
const netY = ({ top, bottom }: InternetSeries, ratio: number) =>
  NET_H - NET_PAD - ((ratio - bottom) / (top - bottom)) * (NET_H - 2 * NET_PAD);

/** One path per run of values, a point at the middle of each step. A run of one step is a dot. */
function internetPaths(series: InternetSeries): string[] {
  return runsOf(series.ratios)
    .filter((run) => !run.gap)
    .map((run) => {
      const points = series.ratios
        .slice(run.from, run.to)
        .map((ratio, i) => `${(run.from + i + 0.5) * STEP_PX} ${netY(series, ratio ?? 1).toFixed(2)}`);
      return `M${(points.length === 1 ? [...points, ...points] : points).join("L")}`;
    });
}

function internetTitle({ county, low, lowStep, gapSteps }: InternetSeries): string {
  if (low === null) return `${county.name} County: no data.`;
  const parts = [lowStep === null ? "no drop below baseline" : `largest drop ${percentText(dropOf(low))} below baseline at step ${lowStep}`];
  if (gapSteps > 0) parts.push(`${plural(gapSteps, "step")} without data`);
  return `${county.name} County: ${parts.join("; ")}.`;
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
  /** The internet file; null draws no internet row, unless `internetNote` says the file is off. */
  internet: InternetFile | null;
  /** The one line that tells why `internet` is null or off; null while the file loads. A line turns the row on and names the strip. */
  internetNote: string | null;
  /** The picked county; a county the file lacks draws no power or internet row. */
  fips: string;
  onStep: (step: number) => void;
}

type StripClick = (event: { clientX: number; currentTarget: { getBoundingClientRect(): { left: number; width: number } } }) => void;

/**
 * Warnings and reports on one 48-hour axis, with a cursor at the slider step.
 * A click on a strip moves the step. The slider stays the keyboard path, so the strips take no focus.
 * shortcut: bars that overlap in one row draw on top of each other; the Data pane table lists every one.
 */
export function Timeline({ date, step, warnings, note, reports, power, internet, internetNote, fips, onStep }: Props) {
  const bars = warningBars(warnings, date);
  const ticks = reportTicks(reports);
  const series = powerSeries(power, fips);
  const net = internetSeries(internet, fips);
  // The internet row shows for a county with a series, and for a settled file that is off or missing; a loading file shows none.
  const withInternet = net !== null || internetNote !== null;
  const { internetY, warningsY, reportsY, height } = layout(series !== null, withInternet);
  const pick: StripClick = (event) => onStep(stepAt(event.clientX, event.currentTarget.getBoundingClientRect()));
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
  const title = `Storm timeline for ${date}, 12:00 UTC to 12:00 UTC ${end}: ${counts.join(", ")}.`;
  const cursorX = step * STEP_PX;
  // The empty-state lines sit over their rows, which the rows above move down.
  const emptyStyle = warningsY > 0 ? { top: `${warningsY}px` } : undefined;
  const netEmptyStyle = internetY > 0 ? { top: `${internetY}px` } : undefined;
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
          {!withInternet ? null : (
            <li style={{ height: `${NET_H}px`, marginBottom: `${GAP}px` }}>Internet</li>
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
            {net === null || net.low === null ? null : (
              <g transform={`translate(0 ${internetY})`}>
                <line class="timeline-net-base" x1={0} x2={WIDTH} y1={netY(net, 1)} y2={netY(net, 1)} />
                {runsOf(net.ratios)
                  .filter((run) => run.gap)
                  .map((run) => (
                    <rect
                      key={run.from}
                      class="timeline-net-gap"
                      x={run.from * STEP_PX}
                      y={0}
                      width={(run.to - run.from) * STEP_PX}
                      height={NET_H}
                    />
                  ))}
                {internetPaths(net).map((d, i) => (
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
          {withInternet && (net === null || net.low === null) ? (
            <p class="timeline-empty timeline-empty-net" style={netEmptyStyle}>
              <span>{net === null ? internetNote : NO_SIGNAL}</span>
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
          {net === null || net.low === null ? null : (
            <p class="timeline-power-note">
              {`Internet reachability, ${net.county.name} County. Scale ${net.bottom.toFixed(2)} to ${net.top.toFixed(2)} of baseline.`}
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

/** The internet strip numbers for the picked county, one row per step: the same ratios the strip draws. */
export function InternetTable({ date, internet, fips }: { date: string; internet: InternetFile; fips: string }) {
  const series = internetSeries(internet, fips);
  if (series === null) return <p>No internet data for this county</p>;
  return (
    <div class="table-scroll power-table">
      <table class="table">
        <caption>{`Internet reachability for ${series.county.name} County, steps from 12:00 UTC on ${date}`}</caption>
        <thead>
          <tr>
            <th class="num">Step</th>
            <th>Time (UTC)</th>
            <th class="num">Ratio to baseline</th>
            <th class="num">Drop below baseline</th>
          </tr>
        </thead>
        <tbody>
          {series.ratios.map((ratio, step) => (
            <tr key={step}>
              <td class="num">{step}</td>
              <td class="mono">{UTC_MINUTE(stepTime(date, step).toISOString())}</td>
              <td class="num">{ratio === null ? NO_DATA : ratio.toFixed(3)}</td>
              <td class="num">{percentText(dropOf(ratio))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The chart numbers as tables for screen readers and the Data pane: the same bars and ticks, step for step. */
export function TimelineTables({ date, warnings, reports }: Omit<Props, "step" | "note" | "power" | "internet" | "internetNote" | "fips" | "onStep">) {
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
