import { MoonIcon, SunIcon } from "./icons";
import { useTheme } from "../state/theme";

/** One icon button. The icon names the action: moon in light, sun in dark. */
export function ThemeToggle() {
  const { resolved, set } = useTheme();
  const toDark = resolved === "light";
  return (
    <button
      type="button"
      class="icon-button"
      aria-label={toDark ? "Switch to dark theme" : "Switch to light theme"}
      onClick={() => set(toDark ? "dark" : "light")}
    >
      {toDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}