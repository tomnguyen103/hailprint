import { additionalFiles, syncEnvVars } from "@trigger.dev/build/extensions/core";
import type { BuildExtension } from "@trigger.dev/core/v3/build";
import { pythonExtension } from "@trigger.dev/python/extension";
import { defineConfig } from "@trigger.dev/sdk/v3";

const HAILPRINT_ENV_KEYS = [
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_REGION",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "HAILPRINT_STATE_BUCKET",
  "HAILPRINT_PUBLIC_BUCKET",
  "MAX_INGEST",
  "PUBLISH_INTERNET",
] as const;

const copyPythonPackageLayer: BuildExtension = {
  name: "copyPythonPackageLayer",
  onBuildComplete(context) {
    if (context.target === "dev") return;
    context.addLayer({
      id: "python-package-sources",
      image: {
        instructions: [
          "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libeccodes0 libeccodes-data && rm -rf /var/lib/apt/lists/*",
          "COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv",
          "RUN uv python install 3.12 --install-dir /opt/python && rm -f /opt/python/*/lib/python3.12/EXTERNALLY-MANAGED && ln -sf $(find /opt/python -name python3.12 -type f | head -n 1) /usr/local/bin/python3",
          "COPY pyproject.toml .",
          "COPY src ./src",
        ],
      },
    });
  },
};

export default defineConfig({
  project: "proj_mjwgiidkcgxnkmfqptiq",
  dirs: ["./trigger"],
  maxDuration: 3600,
  build: {
    extensions: [
      syncEnvVars(({ env }) => {
        const picked: Record<string, string> = {};
        for (const key of HAILPRINT_ENV_KEYS) {
          const val = env[key] ?? process.env[key];
          if (val) picked[key] = val;
        }
        return picked;
      }),
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
