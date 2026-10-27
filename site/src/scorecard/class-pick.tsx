import { diameterPx, type Mark } from "../ruler";
import { formatInches } from "../format";

/** One size class as a pressed button: the ruler mark, the object name, the threshold in inches. */
export function ClassPick({ mark, pressed, onPick }: { mark: Mark; pressed: boolean; onPick: (mm: number) => void }) {
  return (
    <button type="button" class="class-pick" aria-pressed={pressed} onClick={() => onPick(mark.threshold_mm)}>
      <span class="ruler-mark" style={{ width: diameterPx(mark.threshold_in), height: diameterPx(mark.threshold_in) }} />
      <span>
        {mark.object}, &ge; {formatInches(mark.threshold_in)}
      </span>
    </button>
  );
}