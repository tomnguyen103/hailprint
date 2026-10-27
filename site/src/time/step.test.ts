import { describe, expect, it } from "vitest";
import { DEFAULT_STEP, LAST_STEP, STEPS, parseStep, readout, reportStep, resolveStep, stepTime } from "./step";

describe("the impact window", () => {
  it("holds 192 steps of 15 minutes, 12:00 UTC on D to 12:00 UTC on D+2", () => {
    expect(STEPS).toBe(192);
    expect(LAST_STEP).toBe(191);
    expect(stepTime("2024-05-28", 0).toISOString()).toBe("2024-05-28T12:00:00.000Z");
    expect(stepTime("2024-05-28", 48).toISOString()).toBe("2024-05-29T00:00:00.000Z");
    expect(stepTime("2024-05-28", 191).toISOString()).toBe("2024-05-30T11:45:00.000Z");
  });

  it("defaults to step 48, 00:00 UTC on D+1", () => {
    expect(DEFAULT_STEP).toBe(48);
  });
});

describe("parseStep", () => {
  it("accepts a whole number from 0 to 191", () => {
    expect(parseStep("0")).toBe(0);
    expect(parseStep("37")).toBe(37);
    expect(parseStep("191")).toBe(191);
  });

  it.each(["192", "-1", "abc", "1.5", "05", "5?t=1", "", " 5", "1e1"])("rejects %j", (text) => {
    expect(parseStep(text)).toBeNull();
  });
});

describe("resolveStep", () => {
  it("keeps a valid step", () => {
    expect(resolveStep(37)).toBe(37);
    expect(resolveStep(0, 60)).toBe(0);
  });

  it("falls back to the peak, then to step 48", () => {
    expect(resolveStep(null, 60)).toBe(60);
    expect(resolveStep(null)).toBe(48);
    expect(resolveStep(null, null)).toBe(48);
  });
});

describe("reportStep", () => {
  it("maps the UTC HHMM of a report inside the convective day to a step below 96", () => {
    expect(reportStep("1200")).toBe(0);
    expect(reportStep("2359")).toBe(47);
    expect(reportStep("0000")).toBe(48);
    expect(reportStep("1159")).toBe(95);
  });

  it("floors the minute to its 15-minute step", () => {
    expect(reportStep("1214")).toBe(0);
    expect(reportStep("1215")).toBe(1);
    expect(reportStep("0030")).toBe(50);
  });

  it.each(["2400", "1260", "12:00", "120", "abc", ""])("gives null for %j", (time) => {
    expect(reportStep(time)).toBeNull();
  });
});

describe("readout", () => {
  it("reads UTC and Houston local time, each with its own date, in CDT", () => {
    expect(readout("2024-05-28", 37)).toEqual({
      utc: "21:15 UTC Tue 28 May",
      local: "16:15 CDT Tue 28 May",
      zone: "CDT",
      text: "21:15 UTC Tue 28 May · 16:15 CDT Tue 28 May",
    });
  });

  it("reads 01:15 UTC Tue 28 May at step 53 of storm date 2024-05-27", () => {
    const { utc, local } = readout("2024-05-27", 53);
    expect(utc).toBe("01:15 UTC Tue 28 May");
    expect(local).toBe("20:15 CDT Mon 27 May");
  });

  it("shows two different dates after 00:00 UTC", () => {
    expect(readout("2024-05-28", 49).text).toBe("00:15 UTC Wed 29 May · 19:15 CDT Tue 28 May");
  });

  it("reads CST in winter", () => {
    const first = readout("2024-01-15", 0);
    expect(first.zone).toBe("CST");
    expect(first.text).toBe("12:00 UTC Mon 15 Jan · 06:00 CST Mon 15 Jan");
    expect(readout("2024-01-15", 48).text).toBe("00:00 UTC Tue 16 Jan · 18:00 CST Mon 15 Jan");
  });
});
