import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Area } from "../router";
import { useSidebar } from "../state/sidebar";
import { Footer } from "./footer";
import { RouteSidebar } from "./route-sidebar";
import { TopBar } from "./top-bar";

/** Corporate Standard v1 shell: skip link, 56px top bar, collapsible route sidebar, main with footer inside. */
export function Layout({ active, children }: { active: Area | null; children: ComponentChildren }) {
  const { expanded } = useSidebar();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [active]);

  return (
    <div class="shell" data-shell data-sidebar-collapsed={!expanded}>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar
        active={active}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((prev) => !prev)}
      />
      <RouteSidebar
        active={active}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />
      <main id="main" class="site-main">
        {children}
        <Footer />
      </main>
    </div>
  );
}
