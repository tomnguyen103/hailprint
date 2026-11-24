import { readFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

test.beforeEach(async ({ page }) => {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.abort();
    if (!url.pathname.startsWith("/data/")) return route.continue();
    const file = normalize(join(FIXTURES, url.pathname));
    if (!file.startsWith(FIXTURES + sep)) return route.fulfill({ status: 404 });
    try {
      return await route.fulfill({ body: await readFile(file), contentType: "application/json" });
    } catch {
      return route.fulfill({ status: 404 });
    }
  });
});

for (const [width, height] of [
  [1280, 800],
  [1920, 1080],
] as const) {
  test(`HSS matrix fits its pane at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/scorecard/curve");
    const scroll = page.locator(".table-scroll", { has: page.locator("table.table-fit") });
    await expect(scroll.locator("table")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const { scrollWidth, clientWidth } = await scroll.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    // A pane that grows to the matrix width would pass the check above and scroll the page.
    const doc = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.innerWidth);

    if (width === 1280) {
      await expect(
        page.getByRole("columnheader", { name: "≥ 0.75 in (19.05 mm)", exact: true }),
      ).toBeVisible();
    }
  });
}
