import { useId, useMemo, useState } from "preact/hooks";
import type { Metric, StormsIndex } from "../data/types";
import { pooledRows } from "../pool";
import { RULER } from "../ruler";
import { ClassPick } from "../scorecard/class-pick";
import { MetricText } from "../scorecard/metric-text";
import { ReceiptChip } from "../shell/receipt-chip";
import { ErrorState, LoadingState } from "../shell/states";
import { usePairsAll } from "../state/pairs-all";

const FILE = "pairs.json";

/** The guess minus the actual, signed to two decimals; an en dash when the actual is null. */
export function difference(guess: number, actual: Metric): string {
  if (actual === null) return "–";
  const delta = guess - actual;
  const text = Math.abs(delta).toFixed(2);
  return `${delta < 0 && text !== "0.00" ? "-" : "+"}${text}`;
}

/** Guess the pooled HSS of one size class, then reveal the Scorecard value at the default radius. */
export function GuessReveal({ index }: { index: StormsIndex }) {
  const pairs = usePairsAll(index);
  const [guess, setGuess] = useState(0.5);
  const [revealed, setRevealed] = useState(false);
  const [classMm, setClassMm] = useState(RULER[0]!.threshold_mm);
  const id = useId();
  const data = pairs.status === "ready" ? pairs.data : null;
  const table = useMemo(() => (data === null ? null : pooledRows(data, index.radius_km_default)), [data, index.radius_km_default]);

  const pick = (mm: number) => {
    setClassMm(mm);
    setRevealed(false);
  };

  let result = null;
  if (revealed) {
    if (pairs.status === "error") result = <ErrorState error={pairs.error} onRetry={pairs.retry} />;
    else if (pairs.status === "loading" || table === null) result = pairs.showLoading ? <LoadingState file={FILE} /> : null;
    else if ("error" in table) result = <ErrorState error={table.error} onRetry={pairs.retry} />;
    else {
      const actual = table.rows.find((r) => r.threshold_mm === classMm)?.hss ?? null;
      result = (
        <>
          <dl class="guess-row">
            <div>
              <dt>Your guess</dt>
              <dd class="mono">{guess.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Actual HSS</dt>
              <dd class="mono">
                <MetricText value={actual} />
              </dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd class="mono">{difference(guess, actual)}</dd>
            </div>
          </dl>
          <p class="pane-note">
            Pooled at <span class="mono">{index.radius_km_default} km</span>:{" "}
            <ReceiptChip receipt={data![0]!.receipt} file={`${FILE}, pooled over ${index.storms.length} storm dates`} />
          </p>
        </>
      );
    }
  }

  return (
    <div class="guess">
      <div class="guess-classes" role="group" aria-label="Size class">
        {RULER.map((mark) => (
          <ClassPick key={mark.threshold_mm} mark={mark} pressed={mark.threshold_mm === classMm} onPick={pick} />
        ))}
      </div>
      {/* The radius slider styles fit any native range: label, track, mono output. */}
      <div class="radius-slider">
        <label for={id}>Your guess for pooled HSS</label>
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={guess}
          aria-valuetext={guess.toFixed(2)}
          onInput={(event) => setGuess(Number(event.currentTarget.value))}
        />
        <output for={id} class="mono">
          {guess.toFixed(2)}
        </output>
      </div>
      <button type="button" class="button button-small" aria-expanded={revealed} onClick={() => setRevealed((v) => !v)}>
        {revealed ? "Hide" : "Reveal"}
      </button>
      {result}
    </div>
  );
}
