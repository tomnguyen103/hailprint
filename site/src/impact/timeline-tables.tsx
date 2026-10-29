import type { InternetFile, PowerFile, ReportsFile, WarningsFile } from "../data/types";
import { formatCount, formatInches } from "../format";
import { stepTime } from "../time/step";
import { dropOf } from "./internet";
import { ODIN_LABEL, percentText } from "./power";
import { barKey, internetSeries, powerSeries, reportTicks, warningBars } from "./series";

const showStep = (n: number) => String(Math.round(n * 10) / 10);
const UTC_MINUTE = (iso: string) => iso.slice(0, 16).replace("T", " ");
const NO_DATA = percentText(null);

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
export function TimelineTables({ date, warnings, reports }: { date: string; warnings: WarningsFile | null; reports: ReportsFile | null }) {
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
