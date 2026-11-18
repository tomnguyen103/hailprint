import { RULER, diameterPx } from "../../ruler";

const SHORT_OBJECT: Record<string, string> = {
  penny: "Penny",
  quarter: "Quarter",
  "half dollar": "Half",
  walnut: "Walnut",
  "golf ball": "Golf",
  "hen egg": "Egg",
  "tennis ball": "Tennis",
};

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
        const fullLabel = `${mark.threshold_in.toFixed(2)} in ${mark.object}`;
        const shortObject = SHORT_OBJECT[mark.object] ?? mark.object;
        return (
          <button
            key={mark.threshold_mm}
            type="button"
            class="legend-item"
            aria-pressed={visible}
            aria-label={fullLabel}
            title={fullLabel}
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
              <span class="mono">{mark.threshold_in.toFixed(2)}in</span> {shortObject}
            </span>
          </button>
        );
      })}
    </div>
  );
}