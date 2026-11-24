import { Link } from "./link";

export interface SubTab {
  id: string;
  label: string;
  href: string;
}

/** A nav of route links. The active link carries aria-current="page". */
export function SubTabs({ label, tabs, selected }: { label: string; tabs: SubTab[]; selected: string }) {
  return (
    <nav class="sub-tabs" aria-label={label}>
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} aria-current={t.id === selected ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
