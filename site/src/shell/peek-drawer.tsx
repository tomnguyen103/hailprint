// On-demand slide-over peek drawer for inspecting secondary row metadata and receipts.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Receipt } from "../data/types";
import { ReceiptList } from "./receipt-list";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  receipt?: Receipt;
  file?: string;
  onClose: () => void;
  children?: ComponentChildren;
};

/** Render an on-demand slide-over peek drawer for secondary row details and provenance receipts. */
export function PeekDrawer({ open, title, subtitle, receipt, file = "pairs.json", onClose, children }: Props) {
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<{ focus?: () => void } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const active =
      typeof document !== "undefined" ? (document.activeElement as { focus?: () => void } | null) : null;
    openerRef.current = active && active !== drawerRef.current ? active : null;
    drawerRef.current?.focus?.();
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        onCloseRef.current();
      }
    };
    const hasDocEvents = typeof document !== "undefined" && typeof document.addEventListener === "function";
    if (hasDocEvents) document.addEventListener("keydown", onKey);
    return () => {
      if (hasDocEvents) document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <aside
      ref={drawerRef}
      class="peek-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
    >
      <div class="peek-drawer-header">
        <div>
          <h3 class="peek-drawer-title">{title}</h3>
          {subtitle ? <p class="peek-drawer-subtitle mono">{subtitle}</p> : null}
        </div>
        <button type="button" class="button button-small" onClick={onClose} aria-label="Close detail drawer">
          Close
        </button>
      </div>
      <div class="peek-drawer-body">
        {children}
        {receipt ? (
          <section class="peek-drawer-receipt">
            <h4 class="section-label">Provenance receipt</h4>
            <ReceiptList receipt={receipt} file={file} />
          </section>
        ) : null}
      </div>
    </aside>
  );
}

