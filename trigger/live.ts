import { python } from "@trigger.dev/python";
import { schedules } from "@trigger.dev/sdk/v3";

export const liveTask = schedules.task({
  id: "live",
  cron: "*/10 * * * *",
  machine: "small-1x",
  queue: {
    name: "live",
    concurrencyLimit: 1,
  },
  run: async () => {
    const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "live"], {
      env: { PYTHONPATH: "src" },
    });
    return { exitCode: result.exitCode };
  },
});
