import { AREA_LABELS, AREAS, type Area, href } from "../router";
import { AREA_ICONS, CodeIcon } from "./icons";
import { Link } from "./link";
import { ThemeToggle } from "./theme-toggle";

export const SOURCE_URL = "https://github.com/tomnguyen103/hailprint";

function areaHref(area: Area): string {
  return area === "storms" ? "/storms" : href({ area });
}

export function TopBar({ active }: { active: Area | null }) {
  return (
    <header class="top-bar">
      <Link href="/" class="wordmark">
        Hailprint
      </Link>
      <nav class="area-nav" aria-label="Areas">
        {AREAS.map((area) => (
          <Link key={area} href={areaHref(area)} aria-current={active === area ? "page" : undefined}>
            {AREA_LABELS[area]}
          </Link>
        ))}
      </nav>
      <div class="top-bar-tools">
        <ThemeToggle />
        <a class="icon-button" href={SOURCE_URL} aria-label="Source code" rel="noopener">
          <CodeIcon />
        </a>
      </div>
    </header>
  );
}

/** Below 768 px the five areas move here: icon over label, sticky at the bottom. */
export function BottomBar({ active }: { active: Area | null }) {
  return (
    <nav class="bottom-bar" aria-label="Areas">
      {AREAS.map((area) => {
        const Icon = AREA_ICONS[area];
        return (
          <Link key={area} href={areaHref(area)} aria-current={active === area ? "page" : undefined}>
            <Icon size={22} />
            <span>{AREA_LABELS[area]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

