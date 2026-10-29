import { python } from "@trigger.dev/python";
import { schedules } from "@trigger.dev/sdk/v3";

export const nightlyTask = schedules.task({
  id: "nightly",
  cron: "30 13 * * *",
  machine: "medium-1x",
  queue: {
    name: "pipeline",
    concurrencyLimit: 1,
  },
  run: async () => {
    const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "nightly"], {
      env: { PYTHONPATH: "src" },
    });
    return { exitCode: result.exitCode };
  },
});
