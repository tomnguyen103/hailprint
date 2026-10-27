import type { JSX } from "preact";
import { navigate } from "../router";
import { Link } from "./link";

export interface SubTab {
  id: string;
  label: string;
  href: string;
}

/** A tablist of links. The selected tab owns the panel `panel-<id>`; arrows, Home, End move focus and Space follows the link. */
export function SubTabs({ label, tabs, selected }: { label: string; tabs: SubTab[]; selected: string }) {
  const onKey = (event: JSX.TargetedKeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === " ") {
      event.preventDefault();
      navigate(tabs[index]!.href);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    const list = event.currentTarget.parentElement;
    (list?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div class="sub-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <Link
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={t.id === selected}
          aria-controls={t.id === selected ? `panel-${t.id}` : undefined}
          tabIndex={t.id === selected ? 0 : -1}
          href={t.href}
          onKeyDown={(event) => onKey(event, i)}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}