import { defineConfig, devices } from "@playwright/test";

const ORIGIN = "http://localhost:4174";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  forbidOnly: true,
  retries: 0,
  use: { baseURL: ORIGIN },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 4174 --strictPort",
    url: ORIGIN,
    reuseExistingServer: false,
  },
});
