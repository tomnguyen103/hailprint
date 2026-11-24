import { useEffect, useRef } from "preact/hooks";
import { AREAS, AREA_LABELS, type Area, href } from "../router";
import { useSidebar } from "../state/sidebar";
import { AREA_ICONS, GlyphIcon, MenuIcon } from "./icons";
import { Link } from "./link";
import { useModalFocusTrap } from "./modal-focus";

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

/** Persistent collapsible left route sidebar (256px / 56px desktop, 288px modal drawer below 768px). Its 56px header holds the desktop hamburger and the brand link. */
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
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
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
        aria-label={isMobileModal ? "Site menu" : undefined}
        tabIndex={isMobileModal ? -1 : undefined}
        data-collapsed={!expanded}
        data-mobile-open={isMobileModal}
      >
        <div class="route-sidebar-header">
          {desktop ? (
            <button
              type="button"
              class="icon-button sidebar-toggle"
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={expanded}
              aria-controls="route-sidebar"
              title="Toggle navigation (Ctrl+B)"
              onClick={toggle}
            >
              <MenuIcon size={20} />
            </button>
          ) : null}
          <Link href="/" class="wordmark" onClick={isMobileModal ? onCloseMobile : undefined}>
            <GlyphIcon size={20} />
            <span>Hailprint</span>
          </Link>
        </div>
        <nav class="route-nav" aria-label="Primary">
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
