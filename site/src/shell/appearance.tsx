import { SELECTIONS, type Selection } from "../theme";
import { useTheme } from "../state/theme";

const LABELS: Record<Selection, string> = { light: "Light", dark: "Dark", system: "System" };

/** Light / Dark / System radio group; System follows the OS scheme live. */
export function Appearance() {
  const { pref, set } = useTheme();
  return (
    <fieldset class="appearance">
      <legend class="section-label">Appearance</legend>
      {SELECTIONS.map((value) => (
        <label key={value} class="appearance-option">
          <input
            type="radio"
            name="appearance"
            value={value}
            checked={pref === value}
            onChange={() => set(value)}
          />
          {LABELS[value]}
        </label>
      ))}
    </fieldset>
  );
}