import { expect, it } from "vitest";
import { AGING_MIN, STALE_MIN, ageMinutes, freshness } from "./freshness";

const RUN = "2026-11-03T14:00:00Z";
const at = (iso: string) => new Date(iso);

it("is fresh under 20 min, aging from 20 to 59 min, stale at 60 min and up", () => {
  expect(AGING_MIN).toBe(20);
  expect(STALE_MIN).toBe(60);
  expect(freshness(RUN, at("2026-11-03T14:00:00Z"))).toBe("fresh");
  expect(freshness(RUN, at("2026-11-03T14:19:59Z"))).toBe("fresh");
  expect(freshness(RUN, at("2026-11-03T14:20:00Z"))).toBe("aging");
  expect(freshness(RUN, at("2026-11-03T14:59:59Z"))).toBe("aging");
  expect(freshness(RUN, at("2026-11-03T15:00:00Z"))).toBe("stale");
  expect(freshness(RUN, at("2026-11-05T15:00:00Z"))).toBe("stale");
});

it("counts a negative age (clock skew) as 0, so the state is fresh", () => {
  expect(ageMinutes(RUN, at("2026-11-03T13:30:00Z"))).toBe(0);
  expect(freshness(RUN, at("2026-11-03T13:30:00Z"))).toBe("fresh");
});

it("gives whole minutes, floored", () => {
  expect(ageMinutes(RUN, at("2026-11-03T14:20:59Z"))).toBe(20);
});

it("reads a time that does not parse as stale", () => {
  expect(ageMinutes("not a time", at(RUN))).toBeNull();
  expect(freshness("not a time", at(RUN))).toBe("stale");
});
