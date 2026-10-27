// Theme selection and resolution. Pure: no Preact, no MapLibre; the DOM enters through arguments.
export type Selection = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const KEY = "theme";
export const SELECTIONS: readonly Selection[] = ["light", "dark", "system"];

interface Getter {
  getItem(key: string): string | null;
}
interface Setter {
  setItem(key: string, value: string): void;
}

export function isSelection(value: unknown): value is Selection {
  return value === "light" || value === "dark" || value === "system";
}

/** The theme to paint: an explicit stored selection wins; anything else follows the system. */
export function resolve(stored: unknown, systemDark: boolean): Resolved {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

function localStorageOrNull(): (Getter & Setter) | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored selection; a missing, unreadable, or unknown value reads as `system`. */
export function read(storage: Getter | null = localStorageOrNull()): Selection {
  try {
    const value = storage?.getItem(KEY);
    return isSelection(value) ? value : "system";
  } catch {
    return "system";
  }
}

/** Persist the selection; a blocked storage is not an error for the viewer. */
export function store(selection: Selection, storage: Setter | null = localStorageOrNull()): void {
  try {
    storage?.setItem(KEY, selection);
  } catch {
    // shortcut: a blocked localStorage keeps the theme for this page only, upgrade when a
    // viewer reports the loss
  }
}

/** Stamp the resolved theme on the root element, as the head script does before paint. */
export function apply(resolved: Resolved, root: HTMLElement = document.documentElement): void {
  root.dataset["theme"] = resolved;
  root.style.colorScheme = resolved;
}