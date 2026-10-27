import { useCallback, useEffect, useState } from "preact/hooks";
import { apply, read, resolve, store, type Resolved, type Selection } from "../theme";

const QUERY = "(prefers-color-scheme: dark)";

/** The stored selection, the resolved theme, and a setter that stores and applies. */
export function useTheme(): { selection: Selection; resolved: Resolved; set: (next: Selection) => void } {
  const [selection, setSelection] = useState<Selection>(() => read());
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = resolve(selection, systemDark);
  useEffect(() => apply(resolved), [resolved]);

  const set = useCallback((next: Selection) => {
    store(next);
    setSelection(next);
  }, []);
  return { selection, resolved, set };
}