import { python } from "@trigger.dev/python";
import { task } from "@trigger.dev/sdk/v3";

const REQUIRED_ENV = [
  "SUPABASE_S3_ENDPOINT",
  "SUPABASE_S3_REGION",
  "SUPABASE_S3_ACCESS_KEY_ID",
  "SUPABASE_S3_SECRET_ACCESS_KEY",
  "HAILPRINT_STATE_BUCKET",
  "HAILPRINT_PUBLIC_BUCKET",
] as const;

export const helloTask = task({
  id: "hello",
  machine: "small-1x",
  run: async () => {
    const result = await python.runInline(
      "import json, sys, boto3, eccodes, pyogrio, rasterio, hailprint, hailprint.__main__; " +
        "print(json.dumps({'python': sys.version.split()[0], 'boto3': boto3.__version__, " +
        "'pyogrio': pyogrio.__version__, 'rasterio': rasterio.__version__}))",
      { env: { PYTHONPATH: "src" } },
    );
    const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
    const raw = result.stdout.trim();
    let versions: Record<string, string> = {};
    try {
      versions = JSON.parse(raw) as Record<string, string>;
    } catch {
      versions = { python: raw };
    }
    return {
      stdout: raw,
      versions,
      envReady: missingEnv.length === 0,
      missingEnv,
    };
  },
});
