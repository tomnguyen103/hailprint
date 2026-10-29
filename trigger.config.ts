import { pythonExtension } from "@trigger.dev/python/extension";
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_hailprint",
  dirs: ["./trigger"],
  maxDuration: 3600,
  build: {
    extensions: [
      pythonExtension({
        requirementsFile: "./requirements.txt",
        scripts: ["./src/**/*.py"],
      }),
    ],
  },
});
