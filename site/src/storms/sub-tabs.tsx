import type { JSX } from "preact";
import { TABS, TAB_LABELS, type Tab, href, navigate } from "../router";
import { Link } from "../shell/link";

/** Four sub-tabs as a tablist. Arrow keys move focus; Enter or Space navigates. */
export function SubTabs({ date, tab }: { date: string; tab: Tab }) {
  const onKey = (event: JSX.TargetedKeyboardEvent<HTMLAnchorElement>, index: number) => {
    const last = TABS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === " ") {
      event.preventDefault();
      navigate(href({ area: "storms", date, tab: TABS[index]! }));
      return;
    }
    if (next === null) return;
    event.preventDefault();
    const list = event.currentTarget.parentElement;
    (list?.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div class="sub-tabs" role="tablist" aria-label="Storm panes">
      {TABS.map((t, i) => (
        <Link
          key={t}
          role="tab"
          id={`tab-${t}`}
          aria-selected={t === tab}
          aria-controls={`pane-${t}`}
          tabIndex={t === tab ? 0 : -1}
          href={href({ area: "storms", date, tab: t })}
          onKeyDown={(event) => onKey(event, i)}
        >
          {TAB_LABELS[t]}
        </Link>
      ))}
    </div>
  );
}