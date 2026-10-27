import { useEffect, useId, useRef, useState } from "preact/hooks";
import type { Receipt } from "../data/types";

/**
 * A mono chip after a published number. It opens a small dialog with the receipt of
 * the file that holds the number. Escape or a click outside closes it; focus returns.
 */
export function ReceiptChip({ receipt, file }: { receipt: Receipt; file: string }) {
  const [open, setOpen] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        chip.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!pop.current?.contains(target) && !chip.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
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
        onClick={() => setOpen((v) => !v)}
      >
        {file}
      </button>
      {open ? (
        <div ref={pop} id={id} class="receipt-pop" role="dialog" aria-label={`Receipt for ${file}`}>
          <dl class="receipt-list">
            <dt>File</dt>
            <dd class="mono">{file}</dd>
            <dt>Storm date</dt>
            <dd class="mono">{receipt.storm_date}</dd>
            {receipt.sources.map((s) => (
              <>
                <dt>Source</dt>
                <dd>
                  <span class="mono">{s.source}</span>, {s.product}, <span class="mono">{s.file}</span>
                </dd>
              </>
            ))}
            <dt>Confidence</dt>
            <dd>{receipt.confidence}</dd>
            <dt>Run time</dt>
            <dd class="mono">{receipt.run_time}</dd>
            <dt>Package</dt>
            <dd class="mono">{receipt.package_version}</dd>
          </dl>
        </div>
      ) : null}
    </span>
  );
}