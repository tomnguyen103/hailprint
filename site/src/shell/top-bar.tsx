import { AREA_LABELS, type Area } from "../router";
import { GlobalSearch } from "./global-search";
import { CodeIcon, GlyphIcon, MenuIcon } from "./icons";
import { Link } from "./link";
import { ThemeToggle } from "./theme-toggle";

const SOURCE_URL = "https://github.com/tomnguyen103/hailprint";

interface Props {
  active: Area | null;
  mobileNavOpen?: boolean;
  onToggleMobileNav?: () => void;
}

/** 56 px single-row sticky top bar: brand + area title, center Ctrl+K search, right theme menu + source link. */
export function TopBar({ active, mobileNavOpen = false, onToggleMobileNav }: Props) {
  return (
    <header class="top-bar">
      <div class="top-bar-left">
        <button
          type="button"
          class="icon-button mobile-nav-trigger"
          aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileNavOpen}
          aria-controls="route-sidebar"
          onClick={onToggleMobileNav}
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
        <GlobalSearch />
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
