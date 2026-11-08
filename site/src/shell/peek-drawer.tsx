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

export function PeekDrawer({ open, title, subtitle, receipt, file = "pairs.json", onClose, children }: Props) {
  if (!open) return null;

  return (
    <aside
      class="peek-drawer"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
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
