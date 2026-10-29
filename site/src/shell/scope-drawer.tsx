import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import "../styles/scope.css";

/** Close on Escape while `open` is true. */
function useEscape(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Remember the element that had focus when `open` became true, and focus it again when `open` becomes false. */
function useFocusReturn(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener.current?.focus();
  }, [open]);
}

interface Props {
  id?: string;
  /** The nav label; the backdrop reads "Close <label>". */
  label: string;
  /** The head text. */
  title: string;
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
  navRef?: RefObject<HTMLElement>;
  onKeyDown?: (event: KeyboardEvent) => void;
}

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute?.("aria-hidden") === "true") return false;
  if (
    typeof window !== "undefined" &&
    typeof window.getComputedStyle === "function" &&
    typeof Element !== "undefined" &&
    el instanceof Element
  ) {
    const style = window.getComputedStyle(el);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

/** Wrap Tab and Shift+Tab inside the drawer while it is open below 1280px. */
export function trapDrawerTab(event: KeyboardEvent, root: HTMLElement | null, open: boolean): void {
  if (!open || event.key !== "Tab" || !root) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => (el.closest("details:not([open])") === null || el.tagName === "SUMMARY") && isElementVisible(el),
  );
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/** The scope sidebar of the Method and Pipeline areas: a drawer below 1280 px with a backdrop, a head, and a Close button. */
export function ScopeDrawer({ id, label, title, open, onClose, children, navRef, onKeyDown }: Props) {
  const localNavRef = useRef<HTMLElement>(null);
  const resolvedRef = navRef ?? localNavRef;
  useEscape(open, onClose);
  useFocusReturn(open);
  const handleKeyDown = (event: KeyboardEvent) => {
    trapDrawerTab(event, resolvedRef.current, open);
    onKeyDown?.(event);
  };
  return (
    <>
      {open ? <button type="button" class="scope-backdrop" aria-label={`Close ${label}`} onClick={onClose} /> : null}
      <nav id={id} ref={resolvedRef} class="scope" aria-label={label} data-open={open} onKeyDown={handleKeyDown}>
        <div class="scope-head">
          <span class="section-label">{title}</span>
          <button type="button" class="button button-small scope-close" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </nav>
    </>
  );
}
