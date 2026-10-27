import type { ComponentChildren } from "preact";
import type { Area } from "../router";
import { Harness } from "../dev/harness";
import { Footer } from "./footer";
import { BottomBar, TopBar } from "./top-bar";

/** The one layout: skip link, top bar, main, footer, dev harness, bottom bar. */
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
      {import.meta.env.DEV ? <Harness /> : null}
      <BottomBar active={active} />
    </div>
  );
}