import type { Storm } from "../data/types";
import { AREA_LABELS, type Area } from "../router";
import { GlobalSearch } from "./global-search";
import { CodeIcon, GlyphIcon, MenuIcon } from "./icons";
import { Link } from "./link";
import { ThemeToggle } from "./theme-toggle";

const SOURCE_URL = "https://github.com/tomnguyen103/hailprint";

interface Props {
  active: Area | null;
  storms?: readonly Storm[];
  isDesktop?: boolean;
  navExpanded?: boolean;
  onToggleNav?: () => void;
}

/** 56 px single-row sticky top bar: single hamburger toggle + brand + area title, center Ctrl+K search, right theme menu + source link. */
export function TopBar({ active, storms, isDesktop = true, navExpanded = true, onToggleNav }: Props) {
  const navLabel = isDesktop
    ? navExpanded
      ? "Collapse navigation"
      : "Expand navigation"
    : navExpanded
      ? "Close navigation"
      : "Open navigation";

  return (
    <header class="top-bar">
      <div class="top-bar-left">
        <button
          type="button"
          class="icon-button sidebar-toggle"
          aria-label={navLabel}
          aria-expanded={navExpanded}
          aria-controls="route-sidebar"
          title="Toggle navigation (Ctrl+B)"
          onClick={onToggleNav}
        >
          <MenuIcon size={20} />
        </button>
        <Link href="/" class="wordmark">
          <GlyphIcon size={20} />
          <span>Hailprint</span>
        </Link>
        {active ? <span class="top-bar-area">{AREA_LABELS[active]}</span> : null}
      </div>
      <div class="top-bar-center">
        <GlobalSearch storms={storms} />
      </div>
      <div class="top-bar-tools">
        <ThemeToggle />
        <a class="icon-button" href={SOURCE_URL} aria-label="Source code" rel="noopener">
          <CodeIcon />
        </a>
      </div>
    </header>
  );
}
