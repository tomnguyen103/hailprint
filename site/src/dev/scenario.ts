import { useEffect, useState } from "preact/hooks";

// The dev harness sets one scenario; the data hooks read it. Production never sets one.
export const SCENARIOS = ["none", "index-loading", "index-empty", "index-error", "swath-error"] as const;
export type Scenario = (typeof SCENARIOS)[number];

let current: Scenario = "none";
const listeners = new Set<() => void>();

export function setScenario(next: Scenario): void {
  current = next;
  listeners.forEach((fn) => fn());
}

export function useScenario(): Scenario {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const fn = () => setValue(current);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return value;
}