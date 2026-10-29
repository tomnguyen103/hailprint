import { useId } from "preact/hooks";
import { type InternetFile, PHENOMENA, type PowerFile, type ReportsFile, type WarningsFile } from "../data/types";
import "../styles/time.css";
import { stepTime } from "../time/step";
import { ODIN_LABEL, percentText } from "./power";
import { internetSeries, powerSeries, reportTicks, warningBars } from "./series";
import { AXIS_STEPS, GAP, NET_H, POWER_H, REPORTS_H, ROW_H, chartSvg, layout } from "./timeline-chart";

const NO_SIGNAL = "No county signal";
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const axisLabel = (date: string, step: number) => `12Z ${DAY.format(stepTime(date, step))}`;

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

/**
 * The timeline without hooks: `id` names the heading and the chart title, so a test reads the vnodes without a renderer.
 * Warnings and reports on one 48-hour axis, with a cursor at the slider step.
 */
export function TimelineView({ id, date, step, warnings, note, reports, power, internet, internetNote, fips, onStep }: Props & { id: string }) {
  const bars = warningBars(warnings, date);
  const ticks = reportTicks(reports);
  const series = powerSeries(power, fips);
  const net = internetSeries(internet, fips);
  // The internet row shows for a county with a series, and for a settled file that is off or missing; a loading file shows none.
  const withInternet = net !== null || internetNote !== null;
  const rows = layout(series !== null, withInternet);
  const { internetY, warningsY } = rows;
  const headingId = `${id}-heading`;
  // The empty-state lines sit over their rows, which the rows above move down.
  const emptyStyle = warningsY > 0 ? { top: `${warningsY}px` } : undefined;
  const netEmptyStyle = internetY > 0 ? { top: `${internetY}px` } : undefined;
  return (
    <section class="timeline" aria-labelledby={headingId}>
      <h3 id={headingId} class="timeline-heading">
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
          {chartSvg({ titleId: `${id}-title`, date, step, warnings, reports, bars, ticks, series, net, internetNote, withInternet, rows, onStep })}
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

/** The storm timeline. A click on a strip moves the step. The slider stays the keyboard path, so the strips take no focus. */
export function Timeline(props: Props) {
  return <TimelineView {...props} id={useId()} />;
}
