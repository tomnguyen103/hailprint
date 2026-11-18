import { useEffect, useRef, useState } from "preact/hooks";
import { fetchJson } from "../data/fetch";
import { guardPairs, guardPower } from "../data/guard";
import type { Pairs, PowerFile, Storm, StormsIndex } from "../data/types";
import { pool, scoredCount } from "../pool";
import { rescore } from "../rescore";
import { RadiusSlider } from "../shell/radius-slider";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { useLoad } from "../state/load";
import { useAllFiles } from "../state/pairs-all";
import { DEFAULT_MAX_RADIUS_KM, clampRadiusKm, useRadiusKm } from "../state/radius";
import { cliSequence } from "./cli-commands";
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
  const pairsDoc = pairs.status === "ready" && pairs.data[0] ? pairs.data[0] : null;
  const defaultRadius = pairsDoc ? pairsDoc.radius_km_default : index.radius_km_default;
  const [radiusKm, setRadiusKm] = useRadiusKm(defaultRadius);
  const maxRadius = pairsDoc ? pairsDoc.radius_km_max : DEFAULT_MAX_RADIUS_KM;
  const activeRadius = clampRadiusKm(radiusKm, maxRadius) ?? 0;

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

  const downloadCsv = (p: Pairs, radius: number) => {
    const rows = pool([rescore(p, radius)], [scoredCount(p, radius)]);
    const url = URL.createObjectURL(new Blob([csvOf(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `score-${date}-R${radius}.csv`;
    a.click();
    // Revoke after the click has started the download; 0 ms races the fetch in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <div class="try-controls">
        <ScopeSelect storms={index.storms} value={date} onChange={setDate} label="Storm date" />
        <RadiusSlider value={activeRadius} max={maxRadius} onChange={(next) => setRadiusKm(next, maxRadius)} />
      </div>
      <div class="pane-grid">
        <section>
          <h2>Commands</h2>
          <ol class="command-list">
            {commandsFor(date, activeRadius, storm, powerSource).map((text, i) => (
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
          <h2>Score CSV export</h2>
          {pairs.status === "error" ? <ErrorState error={pairs.error} onRetry={pairs.retry} /> : null}
          {pairs.status === "loading" && pairs.showLoading ? <LoadingState file={PAIRS_FILE} /> : null}
          {pairsDoc ? (
            <p class="csv-row">
              <button type="button" class="button" onClick={() => downloadCsv(pairsDoc, activeRadius)}>
                Download table CSV
              </button>
              <ReceiptChip receipt={pairsDoc.receipt} file={PAIRS_FILE} />
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}