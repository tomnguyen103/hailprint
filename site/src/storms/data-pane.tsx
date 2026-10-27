import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs, guardReports, guardWarnings } from "../data/guard";
import type { ReportsFile, Storm, WarningsFile } from "../data/types";
import { TimelineTables } from "../impact/timeline";
import { ReceiptChip } from "../shell/receipt-chip";
import { ReceiptList } from "../shell/receipt-list";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";

const FILE = "pairs.json";

export function DataPane({ storm }: { storm: Storm }) {
  const pairs = useLoad(`data:${storm.files.pairs}`, () => fetchJson(storm.files.pairs, guardPairs));
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(`data:${warningsFile ?? "warnings:none"}`, () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const reports = useLoad<ReportsFile>(`data:${storm.files.reports}`, () => fetchJson(storm.files.reports, guardReports));
  const files: [string, string | null][] = [
    ["swath.geojson", storm.files.swath],
    ["reports.geojson", storm.files.reports],
    ["warnings.geojson", warningsFile],
    ["pairs.json", storm.files.pairs],
    ["zip-counts.json", storm.files.zip_counts],
  ];
  return (
    <div class="pane-grid">
      <section>
        <h2>Published files</h2>
        <ul class="file-list">
          {files.map(([name, path]) => (
            <li key={name}>
              {path ? (
                <>
                  <a class="mono" href={DATA_BASE + path} download>
                    {name}
                  </a>
                  {name === "warnings.geojson" && warnings.status === "ready" && warnings.data !== null ? (
                    <>
                      {" "}
                      <ReceiptChip receipt={warnings.data.receipt} file={name} />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <span class="mono">{name}</span>, none
                </>
              )}
            </li>
          ))}
        </ul>
        <h2>Reproduce</h2>
        <pre class="code-block">
          <code>
            {[
              `uv run hailprint ingest ${storm.storm_date}`,
              ...(storm.files.zip_counts ? [`uv run hailprint parcels ${storm.storm_date}`] : []),
              "uv run hailprint publish",
            ].join("\n")}
          </code>
        </pre>
      </section>
      <section>
        <h2>Receipt</h2>
        {pairs.status === "error" ? <ErrorState error={pairs.error} onRetry={pairs.retry} /> : null}
        {pairs.status === "loading" && pairs.showLoading ? <LoadingState file={FILE} /> : null}
        {pairs.status === "ready" ? (
          <ReceiptList
            receipt={pairs.data.receipt}
            file={FILE}
            extra={
              <>
                <dt>Report source</dt>
                <dd class="mono">{storm.report_source}</dd>
              </>
            }
          />
        ) : null}
      </section>
      <section class="timeline-numbers">
        <h2>Timeline numbers</h2>
        {warnings.status === "error" ? <ErrorState error={warnings.error} onRetry={warnings.retry} /> : null}
        {reports.status === "error" ? <ErrorState error={reports.error} onRetry={reports.retry} /> : null}
        <TimelineTables
          date={storm.storm_date}
          warnings={warnings.status === "ready" ? warnings.data : null}
          reports={reports.status === "ready" ? reports.data : null}
        />
      </section>
    </div>
  );
}