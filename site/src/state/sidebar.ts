import { useCallback, useEffect, useState } from "preact/hooks";

export const SIDEBAR_KEY = "hailprint-sidebar";

function readExpanded(): boolean {
  try {
    return globalThis.localStorage?.getItem(SIDEBAR_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

function writeExpanded(expanded: boolean): void {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_KEY, expanded ? "expanded" : "collapsed");
  } catch {
    // Ignore blocked storage in restricted browser contexts.
  }
}

let expandedState: boolean = readExpanded();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function setSidebarExpanded(next: boolean): void {
  if (expandedState === next) return;
  expandedState = next;
  writeExpanded(next);
  notify();
}

export function toggleSidebarExpanded(): void {
  setSidebarExpanded(!expandedState);
}

/** Persistent desktop route sidebar expanded/rail state (`localStorage["hailprint-sidebar"]` + `Ctrl/Cmd+B`). */
export function useSidebar(): { expanded: boolean; setExpanded: (next: boolean) => void; toggle: () => void } {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const toggle = useCallback(() => {
    toggleSidebarExpanded();
  }, []);

  return { expanded: expandedState, setExpanded: setSidebarExpanded, toggle };
}
