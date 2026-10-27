import { useEffect, useState } from "preact/hooks";
import { match, type Route } from "../router";

/** The current route; re-renders on popstate (Back, Forward, navigate, replace). */
export function useRoute(): { path: string; route: Route } {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return { path, route: match(path) };
}