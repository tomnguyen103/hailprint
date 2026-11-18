import { useEffect, useState } from "preact/hooks";
import { apply, read, resolve, store, type Resolved, type Selection } from "../theme";

export type ThemePreference = Selection;

// One store for the page: one preference, one listener set, one matchMedia listener.
const media =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
let pref: Selection = read();
let systemDark = media?.matches ?? false;
const listeners = new Set<() => void>();

function notify(): void {
  apply(resolve(pref, systemDark));
  listeners.forEach((fn) => fn());
}

media?.addEventListener("change", (event) => {
  systemDark = event.matches;
  if (pref === "system") notify();
});

/** Read the stored theme preference (`"light" | "dark" | "system"`). */
export function readThemePreference(): ThemePreference {
  return read();
}

/** Store the preference, stamp the resolved theme on the root, and notify every subscriber. */
export function setTheme(next: Selection): void {
  store(next);
  pref = next;
  notify();
}

/** Alias for `setTheme` matching the Corporate Standard v1 theme contract. */
export function setThemePreference(next: ThemePreference): void {
  setTheme(next);
}

/** The stored preference, the resolved theme, and the setter. Every caller sees one value. */
export function useTheme(): { pref: Selection; resolved: Resolved; set: (next: Selection) => void } {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return { pref, resolved: resolve(pref, systemDark), set: setTheme };
}
