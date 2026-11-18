// Focus-trap helpers shared by modal drawers and dialogs. Zero CSS imports.
import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

function focusableItems(root: HTMLElement | null): HTMLElement[] {
  if (!root || typeof root.querySelectorAll !== "function") return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => (el.closest?.("details:not([open])") === null || el.tagName === "SUMMARY") && isElementVisible(el),
  );
}

/** Wrap Tab and Shift+Tab inside the container while `open` is true. */
export function trapDrawerTab(event: KeyboardEvent, root: HTMLElement | null, open: boolean): void {
  if (!open || event.key !== "Tab" || !root) return;
  const items = focusableItems(root);
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement as HTMLElement | null;
  if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/** Move focus into `root` when `activeModal` becomes true, trap Tab at document level, and restore focus to the opener on close. */
export function useModalFocusTrap(activeModal: boolean, rootRef: RefObject<HTMLElement>): void {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!activeModal) return;
    const prev = document.activeElement;
    opener.current = prev && typeof (prev as HTMLElement).focus === "function" ? (prev as HTMLElement) : null;
    const root = rootRef.current;
    const first = focusableItems(root)[0];
    if (first) first.focus();
    else root?.focus?.();
    const onKey = (event: KeyboardEvent) => {
      trapDrawerTab(event, rootRef.current, true);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus?.();
    };
  }, [activeModal, rootRef]);
}
