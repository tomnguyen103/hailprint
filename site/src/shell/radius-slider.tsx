import { useId } from "preact/hooks";

// shortcut: 20 km stands in for radius_km_max until the first pairs.json arrives, upgrade when storms.json carries it
export const RADIUS_MAX_FALLBACK = 20;

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
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, Math.round(next))));
        }}
      />
      <output for={id} class="mono">
        {value} km
      </output>
    </div>
  );
}