import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { STALE, latest } from "../data/fetch";
import { DataError } from "../data/types";

export type Load<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: T; error?: undefined }
  | { status: "error"; data?: undefined; error: DataError };

const SHOW_AFTER_MS = 300;
const KEEP_FOR_MS = 500;

/**
 * Load one resource. `key` identifies the request: a key change starts a new request,
 * the latest wins, and an error without a DataError takes `key` as its file name.
 * `showLoading` turns on 300 ms after a request starts and stays on at least 500 ms,
 * so a fast response never flashes the loading state.
 * A render with a new key returns loading before the effect runs.
 */
export function useLoad<T>(
  key: string,
  start: () => Promise<T>,
): Load<T> & { showLoading: boolean; retry: () => void } {
  const [state, setState] = useState<{ key: string; load: Load<T> }>({ key, load: { status: "loading" } });
  const [showLoading, setShowLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const run = useRef(latest<T>());

  useEffect(() => {
    let live = true;
    let shownAt = 0;
    setState({ key, load: { status: "loading" } });
    setShowLoading(false);
    const show = window.setTimeout(() => {
      shownAt = Date.now();
      setShowLoading(true);
    }, SHOW_AFTER_MS);
    const settle = (next: Load<T>) => {
      if (!live) return;
      window.clearTimeout(show);
      const wait = shownAt === 0 ? 0 : Math.max(0, KEEP_FOR_MS - (Date.now() - shownAt));
      window.setTimeout(() => {
        if (!live) return;
        setShowLoading(false);
        setState({ key, load: next });
      }, wait);
    };
    run
      .current(start)
      .then((value) => {
        if (value !== STALE) settle({ status: "ready", data: value });
      })
      .catch((error: unknown) => {
        const typed =
          error instanceof DataError ? error : new DataError(key, error instanceof Error ? error.message : String(error));
        settle({ status: "error", error: typed });
      });
    return () => {
      live = false;
      window.clearTimeout(show);
    };
    // `start` is read once per key or attempt; a new closure alone restarts nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const load: Load<T> = state.key === key ? state.load : { status: "loading" };
  return { ...load, showLoading, retry };
}