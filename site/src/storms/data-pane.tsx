import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import type { Storm } from "../data/types";
import { ReceiptList } from "../shell/receipt-list";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";

const FILE = "pairs.json";

export function DataPane({ storm }: { storm: Storm }) {
  const pairs = useLoad(`data:${storm.files.pairs}`, () => fetchJson(storm.files.pairs, guardPairs));
  const files: [string, string | null][] = [
    ["swath.geojson", storm.files.swath],
    ["reports.geojson", storm.files.reports],
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
                <a class="mono" href={DATA_BASE + path} download>
                  {name}
                </a>
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
    </div>
  );
}