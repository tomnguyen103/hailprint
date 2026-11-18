import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import type { Area } from "../router";
import { useSidebar } from "../state/sidebar";
import { Footer } from "./footer";
import { RouteSidebar } from "./route-sidebar";
import { TopBar } from "./top-bar";

const DESKTOP_NAV_MEDIA = "(min-width: 768px)";

function readDesktopNav(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_NAV_MEDIA).matches
    : true;
}

/** Corporate Standard v1 shell: skip link, 56px top bar with single hamburger toggle, collapsible route sidebar, main with footer inside. */
export function Layout({ active, children }: { active: Area | null; children: ComponentChildren }) {
  const { expanded, toggle } = useSidebar();
  const [isDesktop, setIsDesktop] = useState<boolean>(readDesktopNav);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_NAV_MEDIA);
    setIsDesktop(mql.matches);
    if (mql.matches) setMobileNavOpen(false);
    const onChange = (event: { matches: boolean }) => {
      setIsDesktop(event.matches);
      if (event.matches) setMobileNavOpen(false);
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [active]);

  const onToggleNav = useCallback(() => {
    if (isDesktop) toggle();
    else setMobileNavOpen((prev) => !prev);
  }, [isDesktop, toggle]);

  const onToggleMobile = useCallback(() => {
    setMobileNavOpen((prev) => !prev);
  }, []);

  const onCloseMobile = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  return (
    <div class="shell" data-shell data-sidebar-collapsed={!expanded}>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar
        active={active}
        isDesktop={isDesktop}
        navExpanded={isDesktop ? expanded : mobileNavOpen}
        onToggleNav={onToggleNav}
      />
      <RouteSidebar
        active={active}
        isDesktop={isDesktop}
        mobileOpen={mobileNavOpen}
        onToggleMobile={onToggleMobile}
        onCloseMobile={onCloseMobile}
      />
      <main id="main" class="site-main">
        {children}
        <Footer />
      </main>
    </div>
  );
}
