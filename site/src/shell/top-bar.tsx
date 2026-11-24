import type { Storm } from "../data/types";
import { Breadcrumb } from "./breadcrumb";
import { GlobalSearch } from "./global-search";
import { MenuIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";

interface Props {
  routePath: string;
  storms?: readonly Storm[];
  isDesktop?: boolean;
  navExpanded?: boolean;
  onToggleNav?: () => void;
}

/** 56 px sticky top bar: left breadcrumb (plus the hamburger below 768 px), center Ctrl+K search, right theme menu. */
export function TopBar({ routePath, storms, isDesktop = true, navExpanded = true, onToggleNav }: Props) {
  return (
    <header class="top-bar">
      <div class="top-bar-left">
        {isDesktop ? null : (
          <button
            type="button"
            class="icon-button sidebar-toggle"
            aria-label={navExpanded ? "Close navigation" : "Open navigation"}
            aria-expanded={navExpanded}
            aria-controls="route-sidebar"
            title="Toggle navigation (Ctrl+B)"
            onClick={onToggleNav}
          >
            <MenuIcon size={20} />
          </button>
        )}
        <Breadcrumb routePath={routePath} />
      </div>
      <div class="top-bar-center">
        <GlobalSearch storms={storms} />
      </div>
      <div class="top-bar-tools">
        <ThemeToggle />
      </div>
    </header>
  );
}
