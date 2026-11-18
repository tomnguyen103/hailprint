import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import "../styles/scope.css";
import { trapDrawerTab, useModalFocusTrap } from "./modal-focus";

export { trapDrawerTab, useModalFocusTrap };

const DESKTOP_MEDIA = "(min-width: 1280px)";

/** Close on Escape while `open` is true and the event was not already handled by an inner or top-bar overlay. */
function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Track whether the viewport is below the 1280 px docked sidebar breakpoint, and close an open drawer when crossing to >= 1280 px. */
function useDrawerViewport(open: boolean, onClose: () => void): boolean {
  const readBelow = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? !window.matchMedia(DESKTOP_MEDIA).matches
      : true;
  const [belowDesktop, setBelowDesktop] = useState<boolean>(readBelow);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_MEDIA);
    setBelowDesktop(!mql.matches);
    if (mql.matches && open) onClose();
    const onChange = (event: { matches: boolean }) => {
      setBelowDesktop(!event.matches);
      if (event.matches && open) onClose();
    };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [open, onClose]);
  return belowDesktop;
}

interface Props {
  id?: string;
  /** The landmark label; the backdrop reads "Close <label>". */
  label: string;
  /** The head text. */
  title: string;
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
  navRef?: RefObject<HTMLElement>;
  onKeyDown?: (event: KeyboardEvent) => void;
  /** Semantic landmark element; defaults to "nav" for link trees, or "aside" when the sidebar holds no links. */
  as?: "nav" | "aside";
}

/** The scope sidebar of the Storms, Method, and Pipeline areas: a modal drawer below 1280 px with a backdrop, a head, and a Close button. */
export function ScopeDrawer({ id, label, title, open, onClose, children, navRef, onKeyDown, as = "nav" }: Props) {
  const localRef = useRef<HTMLElement>(null);
  const resolvedRef = navRef ?? localRef;
  const belowDesktop = useDrawerViewport(open, onClose);
  const isModal = open && belowDesktop;
  useEscape(isModal, onClose);
  useModalFocusTrap(isModal, resolvedRef);

  const Tag = as;
  return (
    <>
      {isModal ? <button type="button" class="scope-backdrop" aria-label={`Close ${label}`} onClick={onClose} /> : null}
      <Tag
        id={id}
        ref={resolvedRef as never}
        class="scope"
        role={isModal ? "dialog" : undefined}
        aria-modal={isModal ? "true" : undefined}
        aria-label={label}
        data-open={open}
        onKeyDown={onKeyDown}
      >
        <div class="scope-head">
          <span class="section-label">{title}</span>
          <button type="button" class="button button-small scope-close" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </Tag>
    </>
  );
}
