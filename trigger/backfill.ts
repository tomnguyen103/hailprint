import { python } from "@trigger.dev/python";
import { task } from "@trigger.dev/sdk/v3";

export const backfillTask = task({
  id: "backfill",
  machine: "medium-1x",
  queue: {
    name: "pipeline",
    concurrencyLimit: 1,
  },
  run: async () => {
    const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "backfill"], {
      env: { PYTHONPATH: "src" },
    });
    return { exitCode: result.exitCode };
  },
});
