import { python } from "@trigger.dev/python";
import { task } from "@trigger.dev/sdk/v3";

const PARTIAL_EXIT = 3;

function isPartialExit(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    if ("exitCode" in err && (err as { exitCode?: unknown }).exitCode === PARTIAL_EXIT) {
      return true;
    }
    const result = (err as { result?: { exitCode?: unknown } }).result;
    if (result && typeof result === "object" && result.exitCode === PARTIAL_EXIT) {
      return true;
    }
  }
  return err instanceof Error && /exited with (?:a non-zero )?code 3\b|exit code 3\b/i.test(err.message);
}

export const backfillTask = task({
  id: "backfill",
  machine: "medium-1x",
  queue: {
    name: "pipeline",
    concurrencyLimit: 1,
  },
  run: async () => {
    try {
      const result = await python.runScript("./src/hailprint/__main__.py", ["cloud", "backfill"], {
        env: { PYTHONPATH: "src" },
      });
      return { exitCode: result.exitCode, partial: result.exitCode === PARTIAL_EXIT };
    } catch (err) {
      if (isPartialExit(err)) {
        console.warn(JSON.stringify({ task: "backfill", exitCode: PARTIAL_EXIT, partial: true }));
        return { exitCode: PARTIAL_EXIT, partial: true };
      }
      throw err;
    }
  },
});
