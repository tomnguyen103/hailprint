// Step math for the impact window: 192 steps of 15 minutes, 12:00 UTC on D to 12:00 UTC on D+2.
// Step 0 is 12:00 UTC on the storm date D. Step 48 is 00:00 UTC on D+1. Pure: no DOM, no clock.

export const STEP_MINUTES = 15;
export const STEPS_PER_HOUR = 60 / STEP_MINUTES;
export const STEPS = 192;
export const LAST_STEP = STEPS - 1;
/** The step a link without a step opens: 00:00 UTC on D+1, until a power file names a peak. */
export const DEFAULT_STEP = 48;

const STEP_MS = STEP_MINUTES * 60_000;
const WHOLE_STEP = /^(0|[1-9]\d*)$/;
const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

export function isStep(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= LAST_STEP;
}

/** The step in a path part; null for anything but a whole number from 0 to 191. */
export function parseStep(text: string): number | null {
  if (!WHOLE_STEP.test(text)) return null;
  const step = Number(text);
  return isStep(step) ? step : null;
}

/** The step the map opens at: the path step, else the Harris power peak, else step 48. */
export function resolveStep(step: number | null, peak: number | null = null): number {
  return step ?? peak ?? DEFAULT_STEP;
}

/** The start of a step as an instant. `date` is the storm date `YYYY-MM-DD`. */
export function stepTime(date: string, step: number): Date {
  return new Date(Date.parse(`${date}T12:00:00Z`) + step * STEP_MS);
}

/** The step of an SPC report time `HHMM` (UTC, inside the convective day); null for a bad time. */
export function reportStep(time: string): number | null {
  if (!HHMM.test(time)) return null;
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2));
  return ((hour + 12) % 24) * STEPS_PER_HOUR + Math.floor(minute / STEP_MINUTES);
}

const FIELDS = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" } as const;
const UTC = new Intl.DateTimeFormat("en-US", { ...FIELDS, timeZone: "UTC" });
const HOUSTON = new Intl.DateTimeFormat("en-US", { ...FIELDS, timeZone: "America/Chicago" });

function label(format: Intl.DateTimeFormat, when: Date): { text: string; zone: string } {
  const part: Record<string, string> = {};
  for (const { type, value } of format.formatToParts(when)) part[type] = value;
  const zone = part["timeZoneName"] ?? "";
  return { text: `${part["hour"]}:${part["minute"]} ${zone} ${part["weekday"]} ${part["day"]} ${part["month"]}`, zone };
}

export type Readout = { utc: string; local: string; zone: string; text: string };

/** A step in UTC and in Houston local time, each with its own date (the two dates can differ). */
export function readout(date: string, step: number): Readout {
  const when = stepTime(date, step);
  const utc = label(UTC, when);
  const local = label(HOUSTON, when);
  return { utc: utc.text, local: local.text, zone: local.zone, text: `${utc.text} · ${local.text}` };
}
