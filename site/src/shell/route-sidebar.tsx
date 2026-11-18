import { useEffect, useRef } from "preact/hooks";
import { AREAS, AREA_LABELS, type Area, href } from "../router";
import { useSidebar } from "../state/sidebar";
import { AREA_ICONS } from "./icons";
import { Link } from "./link";
import { useModalFocusTrap } from "./scope-drawer";

function areaHref(area: Area): string {
  return area === "storms" ? "/storms" : href({ area });
}

interface Props {
  active: Area | null;
  isDesktop?: boolean;
  mobileOpen: boolean;
  onToggleMobile?: () => void;
  onCloseMobile: () => void;
}

/** Persistent collapsible left route sidebar (256px / 56px desktop, 288px modal drawer below 768px). */
export function RouteSidebar({ active, isDesktop, mobileOpen, onToggleMobile, onCloseMobile }: Props) {
  const { expanded, toggle } = useSidebar();
  const asideRef = useRef<HTMLElement>(null);
  const desktop =
    isDesktop ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 768px)").matches
      : true);
  const isMobileModal = mobileOpen && !desktop;

  useModalFocusTrap(isMobileModal, asideRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        if (desktop) toggle();
        else if (onToggleMobile) onToggleMobile();
        else toggle();
      } else if (isMobileModal && event.key === "Escape") {
        event.preventDefault();
        onCloseMobile();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [desktop, isMobileModal, onCloseMobile, onToggleMobile, toggle]);

  return (
    <>
      {isMobileModal ? (
        <div class="route-sidebar-backdrop" aria-hidden="true" onMouseDown={onCloseMobile} />
      ) : null}
      <aside
        id="route-sidebar"
        ref={asideRef}
        class="route-sidebar"
        role={isMobileModal ? "dialog" : undefined}
        aria-modal={isMobileModal ? "true" : undefined}
        aria-label="Primary navigation"
        tabIndex={isMobileModal ? -1 : undefined}
        data-collapsed={!expanded}
        data-mobile-open={isMobileModal}
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
                  if (isMobileModal) onCloseMobile();
                }}
              >
                <Icon size={20} />
                <span class="route-link-text">{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
