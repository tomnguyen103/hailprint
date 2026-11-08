import { python } from "@trigger.dev/python";
import { schedules } from "@trigger.dev/sdk/v3";

const PARTIAL_EXIT = 3;

function isPartialExit(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "exitCode" in err) {
    return (err as { exitCode?: unknown }).exitCode === PARTIAL_EXIT;
  }
  return err instanceof Error && /exit code 3\b/i.test(err.message);
}

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
        return { exitCode: PARTIAL_EXIT, partial: true };
      }
      throw err;
    }
  },
});
