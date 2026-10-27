import { RULER, diameterPx } from "../../ruler";

interface Props {
  hidden: ReadonlySet<number>;
  onToggle: (thresholdMm: number) => void;
}

/** The size ruler as the map legend. Each circle toggles its class. */
export function RulerLegend({ hidden, onToggle }: Props) {
  return (
    <div class="ruler-legend" role="group" aria-label="Size classes">
      {RULER.map((mark, i) => {
        const visible = !hidden.has(mark.threshold_mm);
        return (
          <button
            key={mark.threshold_mm}
            type="button"
            class="legend-item"
            aria-pressed={visible}
            onClick={() => onToggle(mark.threshold_mm)}
          >
            <span
              class="legend-circle"
              style={{
                width: diameterPx(mark.threshold_in),
                height: diameterPx(mark.threshold_in),
                background: `var(--hail-${i + 1})`,
              }}
            />
            <span class="legend-text">
              <span class="mono">{mark.threshold_in.toFixed(2)} in</span> {mark.object}
            </span>
          </button>
        );
      })}
    </div>
  );
}