import { describe, expect, it } from "vitest";
import { read, resolve } from "./theme";

describe("resolve", () => {
  it("follows the system scheme when nothing is stored", () => {
    expect(resolve(null, true)).toBe("dark");
    expect(resolve(null, false)).toBe("light");
  });
  it("keeps an explicit selection", () => {
    expect(resolve("light", true)).toBe("light");
    expect(resolve("dark", false)).toBe("dark");
  });
  it("treats garbage as system", () => {
    expect(resolve("banana", false)).toBe("light");
    expect(resolve("system", true)).toBe("dark");
  });
});

describe("read", () => {
  it("returns system when the storage getter throws", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("blocked");
      },
    };
    expect(read(storage)).toBe("system");
  });
  it("returns the stored selection", () => {
    expect(read({ getItem: () => "dark" })).toBe("dark");
    expect(read({ getItem: () => "nope" })).toBe("system");
  });
});
