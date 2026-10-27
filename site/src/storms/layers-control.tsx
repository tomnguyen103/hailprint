import { PHENOMENA } from "../data/types";
import { WARNING_STYLES } from "../impact/warning-styles";
import { type LayerName, LINE_PX } from "./map/layers";

export type LayerState = Record<LayerName, boolean>;

export const LAYER_ROWS: { name: LayerName; label: string }[] = [
  { name: "swath", label: "Hail swath" },
  { name: "reports", label: "SPC reports" },
  { name: "warnings", label: "NWS warnings" },
];

interface ControlProps {
  layers: LayerState;
  warnings: { available: boolean; note: string | null };
  onToggle: (name: LayerName, on: boolean) => void;
}

/** Three layer switches, the warning line key while warnings show, and one line when the warnings file is off. */
export function LayersControl({ layers, warnings, onToggle }: ControlProps) {
  return (
    <fieldset class="layers">
      <legend class="visually-hidden">Map layers</legend>
      {LAYER_ROWS.map(({ name, label }) => {
        const off = name === "warnings" && !warnings.available;
        return (
          <label key={name} class="layer-row">
            <input type="checkbox" checked={layers[name] && !off} disabled={off} onChange={(event) => onToggle(name, event.currentTarget.checked)} />
            <span>{label}</span>
          </label>
        );
      })}
      {warnings.available && layers.warnings ? (
        <ul class="warning-key">
          {PHENOMENA.map((phenomena) => {
            const style = WARNING_STYLES[phenomena];
            return (
              <li key={phenomena}>
                <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true">
                  <line
                    class={`warning-key-${phenomena.toLowerCase()}`}
                    x1="0"
                    y1="4"
                    x2="28"
                    y2="4"
                    stroke-dasharray={style.dash ? style.dash.map((n) => n * LINE_PX).join(" ") : undefined}
                  />
                </svg>
                <span class="mono">{phenomena}</span>
                <span>{style.name}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {warnings.note ? <p class="layers-note">{warnings.note}</p> : null}
    </fieldset>
  );
}
