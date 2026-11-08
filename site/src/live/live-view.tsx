import "../styles/storms.css";
import "../styles/pipeline.css";
import "../styles/live.css";
import type { LiveFile } from "../data/types";
import { BELOW_FIRST_CLASS, formatCount, formatInches } from "../format";
import { ODIN_LABEL } from "../impact/power";
import { go, href } from "../router";
import { RULER } from "../ruler";
import { Link } from "../shell/link";
import { ErrorState, LoadingState } from "../shell/states";
import { type LiveData, useLive } from "../state/live";
import { LiveMap } from "../storms/map/live-map";
import { CASE_STUDIES } from "../storms/select";
import { ageMinutes, freshness } from "./freshness";

const LIVE_FILE = "live/now.json";

/** One status sentence for the 24 h live window: largest size class when present, else the quiet finding. */
export function statusSentence(now: LiveFile): string {
  if (now.mesh.class_count > 0) {
    const index = Math.min(now.mesh.class_count, RULER.length) - 1;
    const mark = RULER[index]!;
    return `Radar-estimated hail at or above ${mark.threshold_in.toFixed(2)} in (${mark.object}) fell over Harris County in the last 24 h.`;
  }
  return "No radar-estimated hail at or above 0.75 in over Harris County in the last 24 h.";
}

function formatAge(iso: string, now: Date): string {
  const age = ageMinutes(iso, now);
  return age === null ? "unknown" : `${age} min ago`;
}

export function LiveViewContent({
  data,
  newest,
  now = new Date(),
}: {
  data: LiveData;
  newest: string | null;
  now?: Date;
}) {
  const { now: live } = data;
  const state = freshness(live.run_time, now);
  const runAge = formatAge(live.run_time, now);

  const max24Value = live.mesh.max_mesh_mm !== null ? formatInches(live.mesh.max_mesh_mm / 25.4) : "0.00 in";
  const max24Note =
    live.mesh.max_mesh_mm !== null
      ? `${live.mesh.max_mesh_mm.toFixed(1)} mm \u00b7 ${live.mesh.class_count} ${live.mesh.class_count === 1 ? "class" : "classes"}`
      : BELOW_FIRST_CLASS;

  const lastHourValue =
    live.last_hour === null
      ? "\u2014"
      : live.last_hour.max_mesh_mm !== null
        ? formatInches(live.last_hour.max_mesh_mm / 25.4)
        : "0.00 in";
  const lastHourNote =
    live.last_hour === null
      ? "unavailable"
      : live.last_hour.max_mesh_mm !== null
        ? `${live.last_hour.max_mesh_mm.toFixed(1)} mm`
        : BELOW_FIRST_CLASS;

  const reportsNote = live.reports.max_size_in !== null ? `max ${formatInches(live.reports.max_size_in)}` : "50 km buffer";
  const powerValue = live.power === null ? "\u2014" : formatCount(live.power.customers_out);
  const powerNote = live.power === null ? "unavailable" : ODIN_LABEL;
  const isQuietSky = newest !== null && live.mesh.class_count === 0 && live.reports.count === 0;

  return (
    <div class="live-page">
      <header class="live-header">
        <div class="live-title-row">
          <h1>{"Live \u00b7 Harris County"}</h1>
          <span class="live-freshness" data-freshness={state}>
            <span class="dot" data-state={state === "fresh" ? "ok" : "missing"} aria-hidden="true" />
            <span class="live-freshness-state">{state}</span>
            <span class="mono">{runAge}</span>
          </span>
        </div>
        <div class="live-status-row">
          <p class="live-status">{statusSentence(live)}</p>
          {newest !== null ? (
            <p class="live-newest">
              Newest storm date:{" "}
              <Link class="mono" href={href({ area: "storms", date: newest, tab: "map" })}>
                {newest}
              </Link>
            </p>
          ) : null}
        </div>
        <p class="live-window mono">
          Window {live.window.start} to {live.window.end}
        </p>
      </header>

      {isQuietSky ? (
        <section class="quiet-sky-banner" aria-label="Archive case studies">
          <p class="quiet-sky-copy">
            Quiet 24-hour window. Select a flagship archive storm to inspect high-density radar swaths.
          </p>
          <div class="quiet-sky-actions">
            {CASE_STUDIES.map((cs) => (
              <button
                key={cs.storm_date}
                type="button"
                class="button button-small case-study-pill"
                onClick={() => go(href({ area: "storms", date: cs.storm_date, tab: "map" }))}
              >
                <span class="mono">{cs.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {data.notes.length > 0 ? (
        <ul class="live-notes" aria-label="Layer warnings">
          {data.notes.map((note) => (
            <li key={note} class="mono">
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      <section class="live-stats" aria-label="24-hour live summary">
        <div class="live-stat">
          <span class="section-label">Max 24 h</span>
          <span class="live-stat-value mono">{max24Value}</span>
          <span class="live-stat-note">{max24Note}</span>
        </div>
        <div class="live-stat">
          <span class="section-label">Max last hour</span>
          <span class="live-stat-value mono">{lastHourValue}</span>
          <span class="live-stat-note">{lastHourNote}</span>
        </div>
        <div class="live-stat">
          <span class="section-label">SPC reports</span>
          <span class="live-stat-value mono">{formatCount(live.reports.count)}</span>
          <span class="live-stat-note">{reportsNote}</span>
        </div>
        <div class="live-stat">
          <span class="section-label">HGX warnings</span>
          <span class="live-stat-value mono">
            {`${formatCount(live.warnings.active)} / ${formatCount(live.warnings.count)}`}
          </span>
          <span class="live-stat-note">active / 24 h total</span>
        </div>
        <div class="live-stat">
          <span class="section-label">Customers out</span>
          <span class="live-stat-value mono">{powerValue}</span>
          <span class="live-stat-note">{powerNote}</span>
        </div>
      </section>

      {live.power !== null && live.power.counties.length > 0 ? (
        <dl class="live-counties" aria-label="Metro county customers out">
          {live.power.counties.map((county) => (
            <div key={county.fips} class="live-county">
              <dt>{county.name}</dt>
              <dd class="mono">{`${formatCount(county.customers_out)} (${(county.share_out * 100).toFixed(1)}%)`}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section class="live-map-section" aria-label="Live map">
        <LiveMap swath={data.swath} reports={data.reports} warnings={data.warnings} />
      </section>

      <section class="live-sources" aria-labelledby="live-sources-heading">
        <h2 id="live-sources-heading">Source clocks</h2>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Product</th>
                <th scope="col">Valid time</th>
                <th scope="col" class="num">
                  Fetch age
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {live.sources.map((row) => (
                <tr key={`${row.source}-${row.product}`}>
                  <th scope="row" class="mono">
                    {row.source}
                  </th>
                  <td class="mono">{row.product}</td>
                  <td class="mono">{row.valid_time ?? "\u2014"}</td>
                  <td class="num">{formatAge(row.fetched_at, now)}</td>
                  <td>
                    <span class="live-source-status" data-ok={row.ok}>
                      <span class="dot" data-state={row.ok ? "ok" : "missing"} aria-hidden="true" />
                      <span>{row.ok ? "ok" : row.message ? `error: ${row.message}` : "error"}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** The `/live` page: loads `live/now.json` and its three layer files, and renders the monitoring view. */
export function LiveView({ newest }: { newest: string | null }) {
  const live = useLive();
  if (live.status === "error") return <ErrorState error={live.error} onRetry={live.retry} />;
  if (live.status === "loading") return live.showLoading ? <LoadingState file={LIVE_FILE} /> : null;
  return <LiveViewContent data={live.data} newest={newest} now={live.now} />;
}
