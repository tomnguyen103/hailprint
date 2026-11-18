import { useEffect, useRef } from "preact/hooks";
import { AREAS, AREA_LABELS, type Area, href } from "../router";
import { useSidebar } from "../state/sidebar";
import { AREA_ICONS, SidebarToggleIcon } from "./icons";
import { Link } from "./link";

function areaHref(area: Area): string {
  return area === "storms" ? "/storms" : href({ area });
}

interface Props {
  active: Area | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** Persistent collapsible left route sidebar (256px / 56px desktop, 288px slide-over below 768px). */
export function RouteSidebar({ active, mobileOpen, onCloseMobile }: Props) {
  const { expanded, toggle } = useSidebar();
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
      } else if (mobileOpen && event.key === "Escape") {
        event.preventDefault();
        onCloseMobile();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile, toggle]);

  useEffect(() => {
    if (!mobileOpen) return;
    asideRef.current?.querySelector?.<HTMLAnchorElement>("a[href]")?.focus?.();
  }, [mobileOpen]);

  return (
    <>
      {mobileOpen ? (
        <div class="route-sidebar-backdrop" aria-hidden="true" onMouseDown={onCloseMobile} />
      ) : null}
      <aside
        id="route-sidebar"
        ref={asideRef}
        class="route-sidebar"
        aria-label="Primary navigation"
        data-collapsed={!expanded}
        data-mobile-open={mobileOpen}
      >
        <nav class="route-nav" aria-label="Workspace areas">
          {AREAS.map((area) => {
            const Icon = AREA_ICONS[area];
            const label = AREA_LABELS[area];
            const isCurrent = active === area;
            return (
              <Link
                key={area}
                href={areaHref(area)}
                class="route-link"
                aria-current={isCurrent ? "page" : undefined}
                aria-label={label}
                title={expanded ? undefined : label}
                onClick={() => {
                  if (mobileOpen) onCloseMobile();
                }}
              >
                <Icon size={20} />
                <span class="route-link-text">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div class="route-sidebar-footer">
          <button
            type="button"
            class="route-collapse-btn"
            aria-expanded={expanded}
            aria-controls="route-sidebar"
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            title={expanded ? "Collapse sidebar (Ctrl+B)" : "Expand sidebar (Ctrl+B)"}
            onClick={toggle}
          >
            <SidebarToggleIcon size={18} />
            <span class="route-collapse-text">{expanded ? "Collapse" : "Expand"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
