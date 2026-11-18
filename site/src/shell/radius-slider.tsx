import { useId } from "preact/hooks";
import { clampRadiusKm } from "../state/radius";

/** The scoring radius in whole km, a native range from `min` (default 0) to `max`. Home and End are native. */
export function RadiusSlider({
  value,
  min = 0,
  max,
  onChange,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (km: number) => void;
}) {
  const id = useId();
  return (
    <div class="radius-slider">
      <label for={id}>Scoring radius</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value} km`}
        onInput={(event) => {
          const clamped = clampRadiusKm(Number(event.currentTarget.value), max);
          if (clamped !== null) onChange(Math.min(max, Math.max(min, clamped)));
        }}
      />
      <output for={id} class="mono">
        {value} km
      </output>
    </div>
  );
}