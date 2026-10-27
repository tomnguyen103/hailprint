import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import "../styles/scope.css";

/** Escape closes the drawer while it is open. */
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

/** A close returns focus to the element that opened the drawer, before the drawer turns hidden. */
function useFocusReturn(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    else opener.current?.focus();
  }, [open]);
}

interface Props {
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

/** The scope sidebar of the Method and Pipeline areas: a drawer below 1280 px with a backdrop, a head, and a Close button. */
export function ScopeDrawer({ label, title, open, onClose, children, navRef, onKeyDown }: Props) {
  useEscape(open, onClose);
  useFocusReturn(open);
  return (
    <>
      {open ? <button type="button" class="scope-backdrop" aria-label={`Close ${label}`} onClick={onClose} /> : null}
      <nav ref={navRef} class="scope" aria-label={label} data-open={open} onKeyDown={onKeyDown}>
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
