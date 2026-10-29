import { additionalFiles } from "@trigger.dev/build/extensions/core";
import type { BuildExtension } from "@trigger.dev/core/v3/build";
import { pythonExtension } from "@trigger.dev/python/extension";
import { defineConfig } from "@trigger.dev/sdk/v3";

const copyPythonPackageLayer: BuildExtension = {
  name: "copyPythonPackageLayer",
  onBuildComplete(context) {
    if (context.target === "dev") return;
    context.addLayer({
      id: "python-package-sources",
      image: {
        instructions: [
          "COPY pyproject.toml .",
          "COPY src ./src",
        ],
      },
    });
  },
};

export default defineConfig({
  project: "proj_hailprint",
  dirs: ["./trigger"],
  maxDuration: 3600,
  build: {
    extensions: [
      additionalFiles({
        files: ["./pyproject.toml", "./src/**"],
      }),
      copyPythonPackageLayer,
      pythonExtension({
        requirementsFile: "./requirements.txt",
        scripts: [
          "./src/**/*.py",
          "./src/**/*.json",
          "./src/**/*.geojson",
        ],
      }),
    ],
  },
});
