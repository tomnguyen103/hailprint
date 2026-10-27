import { expect, it } from "vitest";
import { ageOf } from "./age";

const now = new Date("2024-06-01T12:00:00Z");

it("names the age in minutes, hours, or days", () => {
  expect(ageOf("2024-06-01T11:58:00Z", now)).toBe("2 min ago");
  expect(ageOf("2024-06-01T10:00:00Z", now)).toBe("2 h ago");
  expect(ageOf("2024-05-29T12:00:00Z", now)).toBe("3 d ago");
});

it("floors a part day and never goes negative", () => {
  expect(ageOf("2024-05-30T13:00:00Z", now)).toBe("1 d ago");
  expect(ageOf("2024-06-01T12:00:30Z", now)).toBe("0 min ago");
});
