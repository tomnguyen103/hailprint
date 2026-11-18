import { diameterPx, type Mark } from "../ruler";
import { formatInches } from "../format";

/** One size class as a pressed threshold button paired with its common object name. */
export function ClassPick({ mark, pressed, onPick }: { mark: Mark; pressed: boolean; onPick: (mm: number) => void }) {
  const inches = formatInches(mark.threshold_in);
  return (
    <span class="class-pick-item">
      <button
        type="button"
        class="class-pick"
        aria-pressed={pressed}
        aria-label={`${mark.object}, >= ${inches}`}
        onClick={() => onPick(mark.threshold_mm)}
      >
        <span class="ruler-mark" style={{ width: diameterPx(mark.threshold_in), height: diameterPx(mark.threshold_in) }} />
        <span>&ge; {inches}</span>
      </button>
      <span class="class-object">{mark.object}</span>
    </span>
  );
}