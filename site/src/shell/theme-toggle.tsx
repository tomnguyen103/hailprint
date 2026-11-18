import { useEffect, useId, useRef, useState } from "preact/hooks";
import { useTheme } from "../state/theme";
import type { Selection } from "../theme";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "./icons";

const OPTIONS: readonly { value: Selection; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function SelectionIcon({ mode }: { mode: Selection }) {
  if (mode === "light") return <SunIcon size={18} />;
  if (mode === "dark") return <MoonIcon size={18} />;
  return <MonitorIcon size={18} />;
}

/** Single top-bar icon button opening a Light / Dark / System radio menu. */
export function ThemeToggle() {
  const { pref, set } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const currentIdx = OPTIONS.findIndex((opt) => opt.value === pref);
    itemRefs.current[currentIdx >= 0 ? currentIdx : 0]?.focus?.();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus?.();
      } else if (event.key === "Tab") {
        setOpen(false);
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (hostRef.current && target && !hostRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open, pref]);

  const choose = (value: Selection) => {
    set(value);
    setOpen(false);
    triggerRef.current?.focus?.();
  };

  const onMenuKey = (event: KeyboardEvent, idx: number) => {
    const last = OPTIONS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = idx === last ? 0 : idx + 1;
    else if (event.key === "ArrowUp") next = idx === 0 ? last : idx - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      choose(OPTIONS[idx]!.value);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus?.();
  };

  return (
    <div ref={hostRef} class="theme-menu-host">
      <button
        ref={triggerRef}
        type="button"
        class="icon-button"
        aria-label="Theme"
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        <SelectionIcon mode={pref} />
      </button>
      {open ? (
        <div id={menuId} class="theme-menu" role="menu" aria-label="Theme">
          {OPTIONS.map((opt, idx) => {
            const checked = pref === opt.value;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="menuitemradio"
                class="theme-menu-item"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => choose(opt.value)}
                onKeyDown={(event) => onMenuKey(event, idx)}
              >
                <span class="theme-menu-label">
                  <SelectionIcon mode={opt.value} />
                  <span>{opt.label}</span>
                </span>
                <span class="theme-menu-check" aria-hidden="true">
                  {checked ? <CheckIcon size={16} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
