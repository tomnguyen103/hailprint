import type { ComponentChildren } from "preact";
import { useEffect, useErrorBoundary } from "preact/hooks";
import { DataError } from "../data/types";
import { ErrorState } from "./states";

/** Catch a throw during render in the page body, so the top bar stays and the reader can retry or leave. */
export function AreaBoundary({ resetKey, children }: { resetKey: string; children: ComponentChildren }) {
  const [error, reset] = useErrorBoundary(console.error);
  // The effect reads this render's `error`, so the first mount never clears a throw it has just caught.
  useEffect(() => {
    if (error !== undefined) reset();
  }, [resetKey]);
  if (error !== undefined) return <ErrorState error={new DataError("page", String(error))} onRetry={reset} />;
  return <>{children}</>;
}
