import { useEffect, useRef, useState } from "preact/hooks";
import { DATA_BASE, fetchJson } from "../data/fetch";
import { guardPairs, guardPower } from "../data/guard";
import type { Pairs, PowerFile, Storm, StormsIndex } from "../data/types";
import { pool, scoredCount } from "../pool";
import { rescore } from "../rescore";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { useAllFiles } from "../state/pairs-all";
import { cliSequence } from "../storms/data-pane";
import { csvOf } from "./csv";
import { ScopeSelect, newestFirst } from "./try";

const PAIRS_FILE = "pairs.json";
const COPIED_MS = 1500;

/** Build the CLI command sequence to reproduce `date` according to its published files and power source. */
export function commandsFor(
  date: string,
  radius: number,
  storm?: Storm,
  powerSource: PowerFile["source"] | null = null,
): string[] {
  const hasPower = storm === undefined ? true : storm.files.power !== null;
  const effectiveSource = hasPower ? powerSource : null;
  const hasParcels = storm === undefined ? true : storm.files.zip_counts !== null;
  const hasWarnings = storm === undefined ? true : storm.files.warnings !== null;
  const hasInternet = storm === undefined ? true : storm.files.internet !== null;
  return [
    ...cliSequence({
      date,
      radius,
      parcels: hasParcels,
      warnings: hasWarnings,
      internet: hasInternet,
      power: effectiveSource,
    }),
    "cd site && npm run dev",
  ];
}

/** Return the ordered `[filename, path]` pairs for a storm date's published files. */
export function runPublishedFiles(storm: Storm | undefined): [string, string | null][] {
  if (!storm) return [];
  return [
    ["swath.geojson", storm.files.swath],
    ["reports.geojson", storm.files.reports],
    ["warnings.geojson", storm.files.warnings],
    ["power.json", storm.files.power],
    ["internet.json", storm.files.internet],
    ["pairs.json", storm.files.pairs],
    ["zip-counts.json", storm.files.zip_counts],
  ];
}

/** Select the text of one code block, the fallback when the clipboard API is absent or refuses. */
function selectText(node: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function Run({ index }: { index: StormsIndex }) {
  const [date, setDate] = useState(newestFirst(index.storms)[0]?.storm_date ?? "");
  const storm = index.storms.find((s) => s.storm_date === date);
  const pairs = useAllFiles<Pairs>(storm ? [storm.files.pairs] : [], guardPairs, index.run_time);
  const powerPath = storm?.files.power ?? null;
  const powerLoad = useLoad<PowerFile | null>(powerPath ? `run:${powerPath}` : "run:power:none", () =>
    powerPath === null ? Promise.resolve(null) : fetchJson(powerPath, guardPower),
  );
  const powerSource = powerLoad.status === "ready" && powerLoad.data !== null ? powerLoad.data.source : null;
  const [copied, setCopied] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const codes = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The pairs file owns the default radius; storms.json stands in until it arrives.
  const defaultRadius = pairs.status === "ready" && pairs.data[0] ? pairs.data[0].radius_km_default : index.radius_km_default;

  const copy = async (i: number, text: string) => {
    const node = codes.current[i];
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      setFallback(true);
      if (node) selectText(node);
      return;
    }
    setFallback(false);
    // A second press inside the window restarts the timer; the live text stays "Copied", so it announces once.
    window.clearTimeout(timer.current);
    setCopied(i);
    timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
  };

  const downloadCsv = (p: Pairs) => {
    const radius = p.radius_km_default;
    const rows = pool([rescore(p, radius)], [scoredCount(p, radius)]);
    const url = URL.createObjectURL(new Blob([csvOf(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `score-${date}-R${radius}.csv`;
    a.click();
    // Revoke after the click has started the download; 0 ms races the fetch in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const files = runPublishedFiles(storm);

  return (
    <>
      <div class="try-controls">
        <ScopeSelect storms={index.storms} value={date} onChange={setDate} label="Storm date" />
      </div>
      <div class="pane-grid">
        <section>
          <h2>Commands</h2>
          <ol class="command-list">
            {commandsFor(date, defaultRadius, storm, powerSource).map((text, i) => (
              <li key={text} class="command-row">
                <pre class="code-block">
                  <code
                    ref={(node) => {
                      codes.current[i] = node;
                    }}
                  >
                    {text}
                  </code>
                </pre>
                <button type="button" class="button button-small" onClick={() => void copy(i, text)}>
                  {fallback ? "Select and copy" : copied === i ? "Copied" : "Copy"}
                </button>
              </li>
            ))}
          </ol>
          <span class="visually-hidden" aria-live="polite">
            {copied === null ? "" : "Copied"}
          </span>
        </section>
        <section>
          <h2>Published files</h2>
          <ul class="file-list">
            {files.map(([name, path]) =>
              path ? (
                <li key={name}>
                  <a class="mono" href={DATA_BASE + path} download>
                    {name}
                  </a>
                </li>
              ) : null,
            )}
          </ul>
          <h2>Table</h2>
          {pairs.status === "error" ? <ErrorState error={pairs.error} onRetry={pairs.retry} /> : null}
          {pairs.status === "loading" && pairs.showLoading ? <LoadingState file={PAIRS_FILE} /> : null}
          {pairs.status === "ready" && pairs.data[0] ? (
            <p class="csv-row">
              <button type="button" class="button" onClick={() => downloadCsv(pairs.data[0] as Pairs)}>
                Download table CSV
              </button>
              <ReceiptChip receipt={pairs.data[0].receipt} file={PAIRS_FILE} />
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}