export const PARTIAL_EXIT = 3;

export function isPartialExit(err: unknown): boolean {
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
