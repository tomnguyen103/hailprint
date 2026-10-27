import { useRef, useState } from "preact/hooks";
import "../styles/storms.css";
import "../styles/method.css";
import { METHOD_LABELS, METHOD_PAGES, href, type MethodPage } from "../router";
import { Link } from "../shell/link";
import { ScopeDrawer } from "../shell/scope-drawer";
import { useIndex } from "../state/index";
import { Blocks } from "./blocks";
import { METHOD_CONTENT } from "./content";

/** The page tree: one link per Method page, the current page marked. */
export function PageList({ page, onNavigate }: { page: MethodPage; onNavigate: () => void }) {
  return (
    <ul class="scope-list">
      {METHOD_PAGES.map((p) => (
        <li key={p}>
          <Link href={href({ area: "method", page: p })} aria-current={p === page ? "page" : undefined} onClick={onNavigate}>
            {METHOD_LABELS[p]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The Method area: the page tree as the scope sidebar, one reading column of blocks. */
export function Method({ page }: { page: MethodPage }) {
  const [pagesOpen, setPagesOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const index = useIndex();
  const content = METHOD_CONTENT[page];
  const close = () => setPagesOpen(false);

  /** ArrowDown and ArrowUp move focus through the page links; Enter follows the link as any anchor does. */
  const onNavKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(nav.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (at === -1) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : links.length - 1;
    links[(at + step) % links.length]?.focus();
  };

  return (
    <div class="workspace method">
      <div class="scope-rail">
        <button type="button" class="button button-small" aria-haspopup="dialog" onClick={() => setPagesOpen(true)}>
          Pages
        </button>
      </div>
      <ScopeDrawer label="Method pages" title="Pages" open={pagesOpen} onClose={close} navRef={nav} onKeyDown={onNavKey}>
        <PageList page={page} onNavigate={close} />
      </ScopeDrawer>
      <div class="workspace-main">
        <article class="reading">
          <h1 class="reading-title">{content.title}</h1>
          <Blocks blocks={content.blocks} index={index} />
        </article>
      </div>
    </div>
  );
}
