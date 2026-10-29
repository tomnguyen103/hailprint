import { python } from "@trigger.dev/python";
import { task } from "@trigger.dev/sdk/v3";

export const helloTask = task({
  id: "hello",
  machine: "small-1x",
  run: async () => {
    const result = await python.runInline(
      "import sys, hailprint.__main__, boto3, eccodes, pyogrio, rasterio, hailprint; print(sys.version)",
      { env: { PYTHONPATH: "src" } },
    );
    return { stdout: result.stdout.trim() };
  },
});
