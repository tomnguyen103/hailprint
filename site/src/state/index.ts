import { useEffect, useRef, useState } from "preact/hooks";
import { STALE, fetchJson, latest } from "../data/fetch";
import { guardIndex } from "../data/guard";
import type { StormsIndex } from "../data/types";
import { type Load, useLoad } from "./load";

const INDEX_FILE = "storms.json";
export const REFRESH_MS = 3_600_000;

/**
 * The storm index, loaded on mount and refreshed in the background when the tab
 * becomes visible or every hour while visible. A failed background refresh keeps
 * the existing ready index untouched.
 */
export function useIndex(): Load<StormsIndex> & { showLoading: boolean; retry: () => void } {
  const initial = useLoad<StormsIndex>(INDEX_FILE, () => fetchJson(INDEX_FILE, guardIndex));
  const [fresh, setFresh] = useState<StormsIndex | null>(null);
  const runRefresh = useRef(latest<StormsIndex>());

  useEffect(() => {
    if (!initial.data) return;
    setFresh((prev) => {
      if (prev === null) return null;
      return initial.data.run_time >= prev.run_time ? null : prev;
    });
  }, [initial.data]);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof window === "undefined" ||
      typeof document.addEventListener !== "function" ||
      typeof window.setInterval !== "function"
    ) {
      return;
    }
    let live = true;
    const isVisible = () => (document.visibilityState ?? "visible") === "visible";
    const refresh = () => {
      if (!live || !isVisible()) return;
      runRefresh
        .current(() => fetchJson(INDEX_FILE, guardIndex))
        .then((next) => {
          if (live && next !== STALE) {
            setFresh((prev) => (prev === null || next.run_time >= prev.run_time ? next : prev));
          }
        })
        .catch(() => {
          // Keep existing ready data when a background refresh fails.
        });
    };
    let timer = window.setInterval(refresh, REFRESH_MS);
    const onVisibility = () => {
      window.clearInterval(timer);
      if (isVisible()) {
        refresh();
        timer = window.setInterval(refresh, REFRESH_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (initial.status === "ready") {
    const chosen =
      fresh !== null && fresh.run_time >= initial.data.run_time ? fresh : initial.data;
    return { ...initial, data: chosen };
  }
  if (fresh !== null) {
    return { status: "ready", data: fresh, showLoading: false, retry: initial.retry };
  }
  return initial;
}
