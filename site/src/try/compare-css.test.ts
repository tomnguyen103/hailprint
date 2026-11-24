import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("compare map CSS (G1)", () => {
  const css = readFileSync(fileURLToPath(new URL("../styles/try.css", import.meta.url)), "utf8");

  it("positions .compare-frame > .compare-map absolutely so it out-ranks .maplibregl-map", () => {
    const rule = /(?:^|\n)\.compare-frame > \.compare-map\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/position:\s*absolute/);
  });

  it("holds no rule with a bare .compare-map selector", () => {
    // A bare `.compare-map` selector not scoped by `.compare-frame > ` ties with `.maplibregl-map`.
    expect(css).not.toMatch(/(?<!\.compare-frame > )\.compare-map(?![\w-])\s*[{,]/);
  });
});
