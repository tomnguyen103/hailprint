// On-demand slide-over peek drawer for inspecting secondary row metadata and receipts.
import type { ComponentChildren } from "preact";
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

let previousFocus: { focus?: () => void } | null = null;

/** Render an on-demand slide-over peek drawer for secondary row details and provenance receipts. */
export function PeekDrawer({ open, title, subtitle, receipt, file = "pairs.json", onClose, children }: Props) {
  if (!open) return null;

  const handleClose = () => {
    onClose();
    previousFocus?.focus?.();
    previousFocus = null;
  };

  return (
    <aside
      ref={(node: HTMLElement | null) => {
        if (!node) return;
        const active = typeof document !== "undefined" ? (document.activeElement as { focus?: () => void } | null) : null;
        if (active && active !== node) {
          previousFocus = active;
        }
        node.focus?.();
      }}
      class="peek-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") handleClose();
      }}
    >
      <div class="peek-drawer-header">
        <div>
          <h3 class="peek-drawer-title">{title}</h3>
          {subtitle ? <p class="peek-drawer-subtitle mono">{subtitle}</p> : null}
        </div>
        <button type="button" class="button button-small" onClick={handleClose} aria-label="Close detail drawer">
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

