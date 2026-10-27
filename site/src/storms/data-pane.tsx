import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs } from "../data/guard";
import type { Storm } from "../data/types";
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
          <code>{`uv run hailprint ingest ${storm.storm_date}\nuv run hailprint publish`}</code>
        </pre>
      </section>
      <section>
        <h2>Receipt</h2>
        {pairs.status === "error" ? <ErrorState error={pairs.error} onRetry={pairs.retry} /> : null}
        {pairs.status === "loading" && pairs.showLoading ? <LoadingState file={FILE} /> : null}
        {pairs.status === "ready" ? (
          <dl class="receipt-list">
            <dt>Storm date</dt>
            <dd class="mono">{pairs.data.receipt.storm_date}</dd>
            {pairs.data.receipt.sources.map((s) => (
              <>
                <dt>Source</dt>
                <dd>
                  <span class="mono">{s.source}</span>, {s.product}, <span class="mono">{s.file}</span>
                </dd>
              </>
            ))}
            <dt>Confidence</dt>
            <dd>{pairs.data.receipt.confidence}</dd>
            <dt>Run time</dt>
            <dd class="mono">{pairs.data.receipt.run_time}</dd>
            <dt>Package</dt>
            <dd class="mono">{pairs.data.receipt.package_version}</dd>
            <dt>Report source</dt>
            <dd class="mono">{storm.report_source}</dd>
          </dl>
        ) : null}
      </section>
    </div>
  );
}