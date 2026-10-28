// The county fill control and its legends. All are stateless: map-pane.tsx holds the choice.
import type { InternetFile, PowerFile } from "../data/types";
import type { Load } from "../state/load";
import { internetNote, NET_LABELS } from "./internet";
import { BIN_LABELS, type Fill, ODIN_BOUND, ODIN_LABEL, powerNote } from "./power";

const OPTIONS: { value: Fill; label: string }[] = [
  { value: "none", label: "None" },
  { value: "power", label: "Power out" },
  { value: "internet", label: "Internet reachability" },
];

/** Whether one county layer can draw, and the one line that says why not. */
export interface LayerState {
  available: boolean;
  note: string | null;
}

interface ControlProps {
  fill: Fill;
  /** False when a file is missing or failed: that option is off and None shows as chosen. */
  power: LayerState;
  internet: LayerState;
  onFill: (fill: Fill) => void;
}

/**
 * The one line for each county fill that is off. A failed county outline file turns both fills off, so
 * the power line names it once; the internet line speaks only of the internet file.
 */
export function fillNotes(
  files: { power: string | null; internet: string | null },
  power: Load<PowerFile | null>,
  internet: Load<InternetFile | null>,
  outlines: Load<unknown>,
): { power: string | null; internet: string | null } {
  const file = powerNote(files.power, power);
  const outline = outlines.status === "error" ? outlines.error.message : null;
  return {
    power: outline === null ? file : `${file ?? "Power off."} ${outline}`,
    internet: internetNote(files.internet, internet),
  };
}

/** Three radios for the county fill, and one line for each file that is off. */
export function PowerFillControl({ fill, power, internet, onFill }: ControlProps) {
  const ready: Record<Fill, boolean> = { none: true, power: power.available, internet: internet.available };
  const shown: Fill = ready[fill] ? fill : "none";
  return (
    <fieldset class="power-fill">
      <legend>County fill</legend>
      {OPTIONS.map(({ value, label }) => (
        <label key={value} class="layer-row">
          <input type="radio" name="county-fill" checked={shown === value} disabled={!ready[value]} onChange={() => onFill(value)} />
          <span>{label}</span>
        </label>
      ))}
      {[power.note, internet.note].map((note) => (note ? <p key={note} class="layers-note">{note}</p> : null))}
    </fieldset>
  );
}

interface LegendProps {
  title: string;
  label: string;
  /** The design token family: `out` or `net`. */
  family: "out" | "net";
  bins: readonly string[];
  note?: string[];
}

/** Bin swatches with text beside each. A missing step has its own hatched swatch. A plain function, so a test reads the tree without rendering. */
function legend({ title, label, family, bins, note }: LegendProps) {
  return (
    <section class="power-legend" aria-label={label}>
      <h3 class="power-legend-title">{title}</h3>
      <ul>
        <li>
          <span class="power-swatch power-swatch-none" aria-hidden="true" />
          <span class="mono">0%</span>
        </li>
        {bins.map((text, i) => (
          <li key={text}>
            <span class="power-swatch" style={{ background: `var(--${family}-${i + 1})` }} aria-hidden="true" />
            <span class="mono">{text}</span>
          </li>
        ))}
        <li>
          <span class="power-swatch power-swatch-gap" aria-hidden="true" />
          <span>Missing</span>
        </li>
      </ul>
      {note ? (
        <p class="power-legend-note">
          {note.map((sentence) => (
            <span key={sentence}>{sentence} </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

interface PowerLegendProps {
  fill: Fill;
  source: PowerFile["source"];
}

/** The share-out legend; it shows only while the power fill is chosen. */
export function PowerLegend({ fill, source }: PowerLegendProps) {
  if (fill !== "power") return null;
  return legend({
    title: "Customers out",
    label: "Customers without power",
    family: "out",
    bins: BIN_LABELS,
    note: source === "odin" ? [`${ODIN_LABEL}.`, ODIN_BOUND] : undefined,
  });
}

/** The drop-below-baseline legend; it shows only while the internet fill is chosen. */
export function InternetLegend({ fill }: { fill: Fill }) {
  if (fill !== "internet") return null;
  return legend({ title: "Reachability below baseline", label: "Internet reachability below baseline", family: "net", bins: NET_LABELS });
}
