import { python } from "@trigger.dev/python";
import { schedules } from "@trigger.dev/sdk/v3";

export const odinTask = schedules.task({
  id: "odin",
  cron: "0 * * * *",
  machine: "small-1x",
  queue: {
    name: "odin",
    concurrencyLimit: 1,
  },
  run: async () => {
    const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "odin"], {
      env: { PYTHONPATH: "src" },
    });
    return { exitCode: result.exitCode };
  },
});
