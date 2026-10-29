import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Receipt } from "../data/types";
import { ReceiptList } from "./receipt-list";

const VIEWPORT_PAD = 8;
const POP_GAP = 6;
const DEFAULT_POP_W = 360;
const DEFAULT_POP_H = 180;

let activeChipId: string | null = null;
const chipListeners = new Set<(id: string | null) => void>();

export function openReceiptChip(id: string | null): void {
  activeChipId = id;
  for (const listener of chipListeners) listener(id);
}

export function getActiveReceiptChipId(): string | null {
  return activeChipId;
}

export function clampPopoverPosition(
  triggerRect: { top: number; bottom: number; left: number; right: number },
  popSize: { width: number; height: number },
  viewport: { width: number; height: number },
): { top: number; left: number; maxHeight: number } {
  const maxHeight = Math.max(80, viewport.height - VIEWPORT_PAD * 2);
  const effectiveHeight = Math.min(popSize.height, maxHeight);
  const maxLeft = Math.max(VIEWPORT_PAD, viewport.width - popSize.width - VIEWPORT_PAD);
  const idealLeft = triggerRect.right - popSize.width;
  const left = Math.min(Math.max(VIEWPORT_PAD, idealLeft), maxLeft);
  const belowTop = triggerRect.bottom + POP_GAP;
  const fitsBelow = belowTop + effectiveHeight <= viewport.height - VIEWPORT_PAD;
  const aboveTop = triggerRect.top - POP_GAP - effectiveHeight;
  const top = fitsBelow
    ? belowTop
    : Math.min(Math.max(VIEWPORT_PAD, aboveTop), Math.max(VIEWPORT_PAD, viewport.height - effectiveHeight - VIEWPORT_PAD));
  return { top, left, maxHeight };
}

/**
 * A mono chip after a published number. It opens a small dialog with the receipt of
 * the file that holds the number. Escape or a click outside closes it; focus returns.
 */
export function ReceiptChip({ receipt, file }: { receipt: Receipt; file: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number }>({
    top: VIEWPORT_PAD,
    left: VIEWPORT_PAD,
    maxHeight: 600,
  });
  const chip = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onActive = (nextId: string | null) => {
      setOpen(nextId === id);
    };
    chipListeners.add(onActive);
    return () => {
      chipListeners.delete(onActive);
      if (activeChipId === id) activeChipId = null;
    };
  }, [id]);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      const btn = chip.current;
      if (!btn || typeof window === "undefined") return;
      const rect = btn.getBoundingClientRect();
      const popRect = pop.current?.getBoundingClientRect();
      const width = popRect && popRect.width > 0 ? popRect.width : Math.min(DEFAULT_POP_W, window.innerWidth - VIEWPORT_PAD * 2);
      const height = popRect && popRect.height > 0 ? popRect.height : DEFAULT_POP_H;
      setPos(clampPopoverPosition(rect, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
    };
    updatePos();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        openReceiptChip(null);
        chip.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !chip.current?.contains(target)) openReceiptChip(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  return (
    <span class="chip-host">
      <button
        ref={chip}
        type="button"
        class="chip mono"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => openReceiptChip(open ? null : id)}
      >
        {file}
      </button>
      {open ? (
        <div
          ref={pop}
          id={id}
          class="receipt-pop"
          role="dialog"
          aria-label={`Receipt for ${file}`}
          style={{ top: `${pos.top}px`, left: `${pos.left}px`, maxHeight: `${pos.maxHeight}px` }}
        >
          <ReceiptList receipt={receipt} file={file} />
        </div>
      ) : null}
    </span>
  );
}
