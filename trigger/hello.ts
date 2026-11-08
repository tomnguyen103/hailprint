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
      "import sys, hailprint.__main__, boto3, eccodes, pyogrio, rasterio, hailprint; print(sys.version)",
      { env: { PYTHONPATH: "src" } },
    );
    const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
    return {
      stdout: result.stdout.trim(),
      envReady: missingEnv.length === 0,
      missingEnv,
    };
  },
});
