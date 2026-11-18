import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { DataError } from "../../data/types";
import type { CreateMapOptions, MapHandle } from "./create-map";
import type { Theme } from "./layers";

export interface UseMapOptions extends CreateMapOptions {
  onReady?: (handle: MapHandle) => void;
}

/** Mount one MapLibre map in a ref container, sync theme changes, and destroy on unmount or retry. */
export function useMap(theme: Theme, options?: UseMapOptions) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<DataError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const navigation = options?.navigation;
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onReadyRef = useRef(options?.onReady);
  onReadyRef.current = options?.onReady;

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    let live = true;
    let created: MapHandle | null = null;
    setError(null);
    import("./create-map")
      .then(async ({ createMap }) => {
        const next =
          navigation === undefined
            ? await createMap(node, themeRef.current)
            : await createMap(node, themeRef.current, { navigation });
        if (!live) {
          next.destroy();
          return;
        }
        try {
          onReadyRef.current?.(next);
        } catch (cause) {
          handle.current = null;
          try {
            next.destroy();
          } catch {
            // Preserve the original onReady error.
          }
          throw cause;
        }
        created = next;
        handle.current = next;
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (live) setError(new DataError("map", String(cause)));
      });
    return () => {
      live = false;
      created?.destroy();
      handle.current = null;
      setReady(false);
    };
  }, [attempt, navigation]);

  useEffect(() => {
    if (ready) handle.current?.setTheme(theme);
  }, [ready, theme]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { container, handle, ready, error, retry };
}
