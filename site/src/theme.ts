// Theme selection and resolution. Pure: no Preact, no MapLibre; the DOM enters through arguments.
export type Selection = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const KEY = "theme";
const SELECTIONS: readonly Selection[] = ["light", "dark", "system"];

interface Getter {
  getItem(key: string): string | null;
}
interface Setter {
  setItem(key: string, value: string): void;
}

function isSelection(value: unknown): value is Selection {
  return typeof value === "string" && (SELECTIONS as readonly string[]).includes(value);
}

/** The theme to paint: an explicit stored selection wins; `system` follows the OS; anything else defaults to `light`. */
export function resolve(stored: unknown, systemDark: boolean): Resolved {
  if (stored === "dark") return "dark";
  if (stored === "system") return systemDark ? "dark" : "light";
  return "light";
}

function localStorageOrNull(): (Getter & Setter) | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored selection; a missing, unreadable, or unknown value reads as `light`. */
export function read(storage: Getter | null = localStorageOrNull()): Selection {
  try {
    const value = storage?.getItem(KEY);
    return isSelection(value) ? value : "light";
  } catch {
    return "light";
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

let swapRaf: number | null = null;

/** Stamp the resolved theme on the root element, suppressing transitions for one frame to avoid flash. */
export function apply(resolved: Resolved, root: HTMLElement = document.documentElement): void {
  if (swapRaf !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(swapRaf);
    swapRaf = null;
  }
  root.setAttribute?.("data-theme-swap", "");
  root.dataset["theme"] = resolved;
  root.style.colorScheme = resolved;
  void root.offsetHeight;
  const cleanup = () => {
    swapRaf = null;
    root.removeAttribute?.("data-theme-swap");
  };
  if (typeof requestAnimationFrame === "function") {
    swapRaf = requestAnimationFrame(() => {
      swapRaf = requestAnimationFrame(cleanup);
    });
  } else {
    cleanup();
  }
}