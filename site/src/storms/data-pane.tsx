import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs, guardReports, guardSwath, guardWarnings, guardZipCounts } from "../data/guard";
import type {
  InternetFile,
  PowerFile,
  Receipt,
  ReportsFile,
  Storm,
  SwathFile,
  WarningsFile,
  ZipCounts,
} from "../data/types";
import { InternetTable, PowerTable, TimelineTables } from "../impact/timeline-tables";
import { ReceiptChip } from "../shell/receipt-chip";
import { ReceiptList } from "../shell/receipt-list";
import { ErrorState, LoadingState } from "../shell/states";
import { type Load, useLoad } from "../state/load";

const FILE = "pairs.json";

/** Distinct calendar years touched by the 48-hour impact window (192 steps of 15 min from 12:00 UTC on `stormDate`). */
export function eagleiYearsFor(stormDate: string): string[] {
  const start = new Date(`${stormDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return [stormDate.slice(0, 4)];
  const last = new Date(start.getTime() + 191 * 15 * 60 * 1000);
  return [...new Set([String(start.getUTCFullYear()), String(last.getUTCFullYear())])].sort();
}

/** Distinct UTC calendar days touched by the 48-hour impact window (`D`, `D+1`, `D+2`). */
export function odinWindowDays(stormDate: string): string[] {
  const start = new Date(`${stormDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return [stormDate];
  const last = new Date(start.getTime() + 191 * 15 * 60 * 1000);
  const startDayMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastDayMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const days: string[] = [];
  for (let ms = startDayMs; ms <= lastDayMs; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

/** CLI command to pull the historical ODIN day files of a storm date's impact window from the state bucket. */
export function odinSyncCommandFor(stormDate: string): string {
  const keys = odinWindowDays(stormDate)
    .map((day) => `'derived/odin/odin-${day}.parquet'`)
    .join(", ");
  return `uv run python -c "from hailprint import cloud, paths; c = cloud.Config.from_env(); cloud.sync_down(cloud.s3_client(c), c.state_bucket, (${keys},), paths.ROOT / 'data')"`;
}

/** Build the shared CLI command sequence for a storm date's resolved published files and power source. */
export function cliSequence(o: {
  date: string;
  radius: number;
  parcels: boolean;
  warnings: boolean;
  internet: boolean;
  power: PowerFile["source"] | null;
}): string[] {
  const powerCommands =
    o.power === "odin"
      ? [odinSyncCommandFor(o.date), `uv run hailprint power ${o.date}`]
      : o.power === "eaglei"
        ? [`uv run hailprint eaglei ${eagleiYearsFor(o.date).join(" ")}`, `uv run hailprint power ${o.date}`]
        : [];
  return [
    `uv run hailprint ingest ${o.date}`,
    ...(o.parcels ? [`uv run hailprint parcels ${o.date}`] : []),
    `uv run hailprint score ${o.date} --radius-km ${o.radius}`,
    ...(o.warnings ? [`uv run hailprint warnings ${o.date}`] : []),
    ...powerCommands,
    ...(o.internet ? [`uv run hailprint internet ${o.date}`] : []),
    `uv run hailprint publish ${o.date}${o.internet ? " --with-internet" : ""}`,
  ];
}

/** Full CLI sequence to reproduce every published file for `storm`. */
export function reproduceCommands(
  storm: Storm,
  radiusKm = 5,
  powerSource: PowerFile["source"] | null = null,
): string[] {
  const effectiveSource = storm.files.power ? powerSource : null;
  return cliSequence({
    date: storm.storm_date,
    radius: radiusKm,
    parcels: Boolean(storm.files.zip_counts),
    warnings: Boolean(storm.files.warnings),
    internet: Boolean(storm.files.internet),
    power: effectiveSource,
  });
}

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
  /** Optional reports file load from the workspace; fetched internally when omitted. */
  reports?: Load<ReportsFile> & { retry: () => void };
  /** The power file load from the workspace, which also feeds the map. */
  power: Load<PowerFile | null> & { retry: () => void };
  /** The internet file load from the workspace, which also feeds the map. */
  internet: Load<InternetFile | null> & { retry: () => void };
  fips: string;
}

export function DataPane({ storm, reports: reportsProp, power, internet, fips }: Props) {
  const swath = useLoad<SwathFile>(`data:${storm.files.swath}`, () => fetchJson(storm.files.swath, guardSwath));
  const pairs = useLoad(`data:${storm.files.pairs}`, () => fetchJson(storm.files.pairs, guardPairs));
  const warningsFile = storm.files.warnings;
  const warnings = useLoad<WarningsFile | null>(`data:${warningsFile ?? "warnings:none"}`, () =>
    warningsFile === null ? Promise.resolve(null) : fetchJson(warningsFile, guardWarnings),
  );
  const zipFile = storm.files.zip_counts;
  const zipCounts = useLoad<ZipCounts | null>(`data:${zipFile ?? "zips:none"}`, () =>
    zipFile === null ? Promise.resolve(null) : fetchJson(zipFile, guardZipCounts),
  );
  const internalReports = useLoad<ReportsFile>(
    reportsProp ? "data:reports:external" : `data:${storm.files.reports}`,
    () =>
      reportsProp
        ? Promise.resolve(null as unknown as ReportsFile)
        : fetchJson(storm.files.reports, guardReports),
  );
  const reports = reportsProp ?? internalReports;
  const swathReceipt = swath.status === "ready" && swath.data !== null ? swath.data.receipt : null;
  const warningsReceipt = warnings.status === "ready" && warnings.data !== null ? warnings.data.receipt : null;
  const zipReceipt = zipCounts.status === "ready" && zipCounts.data !== null ? zipCounts.data.receipt : null;
  const powerData = power.status === "ready" ? power.data : null;
  const internetData = internet.status === "ready" ? internet.data : null;
  const files: [string, string | null, Receipt | null][] = [
    ["swath.geojson", storm.files.swath, swathReceipt],
    ["reports.geojson", storm.files.reports, reports.status === "ready" && reports.data ? reports.data.receipt : null],
    ["warnings.geojson", warningsFile, warningsReceipt],
    ["power.json", storm.files.power, powerData?.receipt ?? null],
    ["internet.json", storm.files.internet, internetData?.receipt ?? null],
    ["pairs.json", storm.files.pairs, pairs.status === "ready" ? pairs.data.receipt : null],
    ["zip-counts.json", storm.files.zip_counts, zipReceipt],
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
            {reproduceCommands(
              storm,
              pairs.status === "ready" ? pairs.data.radius_km_default : 5,
              powerData?.source ?? null,
            ).join("\n")}
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