import type { ComponentChildren } from "preact";
import type { Area } from "../router";
import { Footer } from "./footer";
import { BottomBar, TopBar } from "./top-bar";

/** The one layout: skip link, top bar, main, footer, bottom bar. */
export function Layout({ active, children }: { active: Area | null; children: ComponentChildren }) {
  return (
    <div class="shell">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar active={active} />
      <main id="main" class="site-main">
        {children}
      </main>
      <Footer />
      <BottomBar active={active} />
    </div>
  );
}