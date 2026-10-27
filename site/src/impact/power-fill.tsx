// The county fill control and its legend. Both are stateless: map-pane.tsx holds the choice.
import type { PowerFile } from "../data/types";
import { BIN_LABELS, type Fill, ODIN_BOUND, ODIN_LABEL } from "./power";

const OPTIONS: { value: Fill; label: string }[] = [
  { value: "none", label: "None" },
  { value: "power", label: "Power out" },
];

interface ControlProps {
  fill: Fill;
  /** False when the power file is missing or failed: Power is off and None shows as chosen. */
  available: boolean;
  note: string | null;
  onFill: (fill: Fill) => void;
}

/** Two radios for the county fill, and one line when the power file is off. */
export function PowerFillControl({ fill, available, note, onFill }: ControlProps) {
  const shown: Fill = available ? fill : "none";
  return (
    <fieldset class="power-fill">
      <legend>County fill</legend>
      {OPTIONS.map(({ value, label }) => (
        <label key={value} class="layer-row">
          <input type="radio" name="county-fill" checked={shown === value} disabled={value === "power" && !available} onChange={() => onFill(value)} />
          <span>{label}</span>
        </label>
      ))}
      {note ? <p class="layers-note">{note}</p> : null}
    </fieldset>
  );
}

interface LegendProps {
  fill: Fill;
  source: PowerFile["source"];
}

/** The share-out bins with text beside each swatch. A missing step has its own hatched swatch. */
export function PowerLegend({ fill, source }: LegendProps) {
  if (fill !== "power") return null;
  return (
    <section class="power-legend" aria-label="Customers without power">
      <h3 class="power-legend-title">Customers out</h3>
      <ul>
        <li>
          <span class="power-swatch power-swatch-none" aria-hidden="true" />
          <span class="mono">0%</span>
        </li>
        {BIN_LABELS.map((label, i) => (
          <li key={label}>
            <span class="power-swatch" style={{ background: `var(--out-${i + 1})` }} aria-hidden="true" />
            <span class="mono">{label}</span>
          </li>
        ))}
        <li>
          <span class="power-swatch power-swatch-gap" aria-hidden="true" />
          <span>Missing</span>
        </li>
      </ul>
      {source === "odin" ? (
        <p class="power-legend-note">
          <span>{ODIN_LABEL}.</span> <span>{ODIN_BOUND}</span>
        </p>
      ) : null}
    </section>
  );
}
