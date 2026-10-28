import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs, guardReports, guardWarnings } from "../data/guard";
import type { InternetFile, PowerFile, Receipt, ReportsFile, Storm, WarningsFile } from "../data/types";
import { InternetTable, PowerTable, TimelineTables } from "../impact/timeline-tables";
import { ReceiptChip } from "../shell/receipt-chip";
import { ReceiptList } from "../shell/receipt-list";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";

const FILE = "pairs.json";

/** One published file: a download link, with its receipt chip when the file carries a receipt, or "none". */
export function FileItem({ name, path, receipt }: { name: string; path: string | null; receipt: Receipt | null }) {
  if (path === null) {
    return (
      <>
        <span class="mono">{name}</span>, none
      </>
    );
  }
  return (
    <>
      <a class="mono" href={DATA_BASE + path} download>
        {name}
      </a>
      {receipt === null ? null : (
        <>
          {" "}
          <ReceiptChip receipt={receipt} file={name} />
        </>
      )}
    </>
  );
}

interface Props {
  storm: Storm;
  /** The power file load from the workspace, which also feeds the map. */
  power: Load<PowerFile | null> & { retry: () => void };
  /** The internet file load from the workspace, which also feeds the map. */
  internet: Load<InternetFile | null> & { retry: () => void };
  fips: string;
}

export function DataPane({ storm, power, internet, fips }: Props) {
  const pairs = useLoad(`data:${storm.files.pairs}`, () => fetchJson(storm.files.pairs, guardPairs));
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(`data:${warningsFile ?? "warnings:none"}`, () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const reports = useLoad<ReportsFile>(`data:${storm.files.reports}`, () => fetchJson(storm.files.reports, guardReports));
  const warningsReceipt = warnings.status === "ready" && warnings.data !== null ? warnings.data.receipt : null;
  const powerData = power.status === "ready" ? power.data : null;
  const internetData = internet.status === "ready" ? internet.data : null;
  const files: [string, string | null, Receipt | null][] = [
    ["swath.geojson", storm.files.swath, null],
    ["reports.geojson", storm.files.reports, null],
    ["warnings.geojson", warningsFile, warningsReceipt],
    ["power.json", storm.files.power, powerData?.receipt ?? null],
    ["internet.json", storm.files.internet, internetData?.receipt ?? null],
    ["pairs.json", storm.files.pairs, null],
    ["zip-counts.json", storm.files.zip_counts, null],
  ];
  return (
    <div class="pane-grid">
      <section>
        <h2>Published files</h2>
        <ul class="file-list">
          {files.map(([name, path, receipt]) => (
            <li key={name}>
              <FileItem name={name} path={path || null} receipt={receipt} />
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
        {power.status === "error" ? <ErrorState error={power.error} onRetry={power.retry} /> : null}
        {powerData === null ? null : <PowerTable date={storm.storm_date} power={powerData} fips={fips} />}
        {internet.status === "error" ? <ErrorState error={internet.error} onRetry={internet.retry} /> : null}
        {internetData === null ? null : <InternetTable date={storm.storm_date} internet={internetData} fips={fips} />}
      </section>
    </div>
  );
}