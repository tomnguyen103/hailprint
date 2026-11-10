import { python } from "@trigger.dev/python";
import { schedules } from "@trigger.dev/sdk/v3";
import { PARTIAL_EXIT, isPartialExit } from "./common";

export const nightlyTask = schedules.task({
  id: "nightly",
  cron: "30 13 * * *",
  machine: "medium-1x",
  queue: {
    name: "pipeline",
    concurrencyLimit: 1,
  },
  run: async () => {
    try {
      const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "nightly"], {
        env: { PYTHONPATH: "src" },
      });
      return { exitCode: result.exitCode, partial: result.exitCode === PARTIAL_EXIT };
    } catch (err) {
      if (isPartialExit(err)) {
        console.warn(JSON.stringify({ task: "nightly", exitCode: PARTIAL_EXIT, partial: true }));
        return { exitCode: PARTIAL_EXIT, partial: true };
      }
      throw err;
    }
  },
});
