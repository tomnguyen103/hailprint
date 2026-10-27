import { useId } from "preact/hooks";

/** The scoring radius in whole km, a native range from 0 to `max`. Home and End are native. */
export function RadiusSlider({ value, max, onChange }: { value: number; max: number; onChange: (km: number) => void }) {
  const id = useId();
  return (
    <div class="radius-slider">
      <label for={id}>Scoring radius</label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-valuetext={`${value} km`}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output for={id} class="mono">
        {value} km
      </output>
    </div>
  );
}