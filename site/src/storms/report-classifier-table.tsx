import { useMemo, useState } from "preact/hooks";
import type { Pairs, ReportsFile } from "../data/types";
import { formatInches, formatReportTime } from "../format";
import { OUTCOME_LABELS, classifyReports, type ReportOutcome } from "../rescore";
import { go, href } from "../router";
import { PeekDrawer } from "../shell/peek-drawer";
import { setPin } from "../state/pin";
import { reportStep } from "../time/step";
import { objectForSize } from "./select";

type FilterOutcome = "all" | ReportOutcome;

interface Props {
  stormDate: string;
  pairs: Pairs;
  reportsGeo: ReportsFile | null;
  radiusKm: number;
  thresholdMm: number;
  thresholdIn: number;
}

export function ReportClassifierTable({
  stormDate,
  pairs,
  reportsGeo,
  radiusKm,
  thresholdMm,
  thresholdIn,
}: Props) {
  const [filter, setFilter] = useState<FilterOutcome>("all");
  const [peekId, setPeekId] = useState<number | null>(null);

  const classified = useMemo(
    () => classifyReports(pairs, radiusKm, thresholdMm, reportsGeo),
    [pairs, radiusKm, thresholdMm, reportsGeo],
  );

  const counts = useMemo(() => {
    const out: Record<ReportOutcome, number> = {
      hit: 0,
      miss: 0,
      false_alarm: 0,
      correct_negative: 0,
      excluded: 0,
    };
    for (const r of classified) out[r.outcome] += 1;
    return out;
  }, [classified]);

  const rows = useMemo(
    () => (filter === "all" ? classified : classified.filter((r) => r.outcome === filter)),
    [classified, filter],
  );

  const peekReport = peekId !== null ? (classified.find((r) => r.id === peekId) ?? null) : null;

  if (classified.length === 0) {
    return (
      <section class="report-classifier-section">
        <h2>Per-report contingency classifier</h2>
        <p class="pane-note">Zero SPC reports on {stormDate}.</p>
      </section>
    );
  }

  const filterPills: { id: FilterOutcome; label: string }[] = [
    { id: "all", label: `All (${classified.length})` },
    { id: "hit", label: `Hits (${counts.hit})` },
    { id: "miss", label: `Misses (${counts.miss})` },
    { id: "false_alarm", label: `False alarms (${counts.false_alarm})` },
    { id: "correct_negative", label: `Correct negatives (${counts.correct_negative})` },
    { id: "excluded", label: `Excluded (${counts.excluded})` },
  ];

  const inspectOnMap = (lngLat: [number, number], location: string | null, time: string | null) => {
    setPin(lngLat, { source: "map", label: location ?? `Report on ${stormDate}` });
    const step = time ? (reportStep(time) ?? undefined) : undefined;
    go(href({ area: "storms", date: stormDate, tab: "map", step }));
  };

  return (
    <section class="report-classifier-section" aria-label="Per-report contingency classifier">
      <h2>Per-report contingency classifier</h2>
      <p class="pane-note">
        <span class="mono">R = {radiusKm} km</span> &middot;{" "}
        <span class="mono">
          &ge; {formatInches(thresholdIn)} ({thresholdMm} mm)
        </span>
      </p>
      <div class="classifier-filter-bar" role="group" aria-label="Filter reports by contingency outcome">
        {filterPills.map((p) => (
          <button
            key={p.id}
            type="button"
            class="button button-small classifier-pill"
            aria-pressed={filter === p.id}
            onClick={() => setFilter(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div class="table-scroll">
        <table class="table report-classifier-table">
          <thead>
            <tr>
              <th scope="col">Report</th>
              <th scope="col" class="num">
                Reported size
              </th>
              <th scope="col">Outcome</th>
              <th scope="col" class="num">
                Swath distance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} class="pane-note">
                  No reports match this outcome filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const distText =
                  r.dist_m === null
                    ? "no swath"
                    : r.dist_m === 0
                      ? "0.0 km (inside)"
                      : `${(r.dist_m / 1000).toFixed(1)} km`;
                return (
                  <tr key={r.id} data-outcome={r.outcome}>
                    <td>
                      <button
                        type="button"
                        class="class-pick"
                        aria-pressed={peekId === r.id}
                        onClick={() => setPeekId(r.id)}
                      >
                        <span class="mono">#{r.id + 1}</span>
                        {r.location ? ` · ${r.location}` : ""}
                      </button>
                    </td>
                    <td class="num">
                      <span class="mono">{formatInches(r.size_in)}</span> ({objectForSize(r.size_in)})
                    </td>
                    <td>
                      <span class="outcome-badge" data-outcome={r.outcome}>
                        {OUTCOME_LABELS[r.outcome]}
                      </span>
                    </td>
                    <td class="num mono">{distText}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <PeekDrawer
        open={peekReport !== null}
        title={
          peekReport
            ? `Report #${peekReport.id + 1}${peekReport.location ? ` · ${peekReport.location}` : ""}`
            : "Report detail"
        }
        subtitle={peekReport ? `${stormDate} · ${OUTCOME_LABELS[peekReport.outcome]}` : undefined}
        receipt={pairs.receipt}
        file="pairs.json"
        onClose={() => setPeekId(null)}
      >
        {peekReport ? (
          <>
            <dl class="receipt-list">
              <dt>Report time</dt>
              <dd class="mono">{peekReport.time ? formatReportTime(peekReport.time) : "–"}</dd>
              <dt>Reported size</dt>
              <dd class="mono">
                {formatInches(peekReport.size_in)} ({objectForSize(peekReport.size_in)})
              </dd>
              <dt>Outcome</dt>
              <dd>{OUTCOME_LABELS[peekReport.outcome]}</dd>
              <dt>Nearest swath</dt>
              <dd class="mono">
                {peekReport.dist_m === null
                  ? "no swath"
                  : peekReport.dist_m === 0
                    ? "0.0 km (inside)"
                    : `${(peekReport.dist_m / 1000).toFixed(1)} km`}
              </dd>
              <dt>Crop edge distance</dt>
              <dd class="mono">{`${(peekReport.edge_m / 1000).toFixed(1)} km`}</dd>
              {peekReport.lngLat ? (
                <>
                  <dt>Coordinates</dt>
                  <dd class="mono">{`${peekReport.lngLat[1].toFixed(4)}, ${peekReport.lngLat[0].toFixed(4)}`}</dd>
                </>
              ) : null}
            </dl>
            {peekReport.lngLat ? (
              <p class="pane-note">
                <button
                  type="button"
                  class="button button-small"
                  onClick={() => inspectOnMap(peekReport.lngLat!, peekReport.location, peekReport.time)}
                >
                  Inspect on map
                </button>
              </p>
            ) : null}
          </>
        ) : null}
      </PeekDrawer>
    </section>
  );
}
