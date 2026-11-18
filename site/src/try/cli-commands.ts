// Pure CLI reproduction command builders for Try > Run.
import type { PowerFile } from "../data/types";
import { LAST_STEP, stepTime } from "../time/step";

/** Return distinct calendar years touched by the 48-hour impact window for `stormDate`. */
export function eagleiYearsFor(stormDate: string): string[] {
  const start = stepTime(stormDate, 0);
  if (Number.isNaN(start.getTime())) return [stormDate.slice(0, 4)];
  const last = stepTime(stormDate, LAST_STEP);
  return [...new Set([String(start.getUTCFullYear()), String(last.getUTCFullYear())])].sort();
}

/** Return distinct UTC calendar days touched by the 48-hour impact window (`D`, `D+1`, `D+2`). */
export function odinWindowDays(stormDate: string): string[] {
  const start = stepTime(stormDate, 0);
  if (Number.isNaN(start.getTime())) return [stormDate];
  const last = stepTime(stormDate, LAST_STEP);
  const startDayMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const lastDayMs = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const days: string[] = [];
  for (let ms = startDayMs; ms <= lastDayMs; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

/** Build the CLI command that pulls historical ODIN day files for `stormDate` from the state bucket. */
export function odinSyncCommandFor(stormDate: string): string {
  const keys = odinWindowDays(stormDate)
    .map((day) => `'derived/odin/odin-${day}.parquet'`)
    .join(", ");
  return `uv run python -c "from hailprint import cloud, paths; c = cloud.Config.from_env(); cloud.sync_down(cloud.s3_client(c), c.state_bucket, (${keys},), paths.ROOT / 'data')"`;
}

/** Build the shared CLI command sequence for a storm date's published files and power source. */
export function cliSequence(o: {
  date: string;
  radius: number;
  parcels: boolean;
  warnings: boolean;
  internet: boolean;
  power: PowerFile["source"] | null;
}): string[] {
  const powerCommands =
    o.power === "odin"
      ? [odinSyncCommandFor(o.date), `uv run hailprint power ${o.date}`]
      : o.power === "eaglei"
        ? [`uv run hailprint eaglei ${eagleiYearsFor(o.date).join(" ")}`, `uv run hailprint power ${o.date}`]
        : [];
  return [
    `uv run hailprint ingest ${o.date}`,
    ...(o.parcels ? [`uv run hailprint parcels ${o.date}`] : []),
    `uv run hailprint score ${o.date} --radius-km ${o.radius}`,
    ...(o.warnings ? [`uv run hailprint warnings ${o.date}`] : []),
    ...powerCommands,
    ...(o.internet ? [`uv run hailprint internet ${o.date}`] : []),
    `uv run hailprint publish ${o.date}${o.internet ? " --with-internet" : ""}`,
  ];
}
