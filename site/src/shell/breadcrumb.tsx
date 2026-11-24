import { AREA_LABELS, METHOD_LABELS, PIPELINE_LABELS, TAB_LABELS, TOOL_LABELS, VIEW_LABELS, href, match, type Area } from "../router";
import { Link } from "./link";

interface Crumb {
  label: string;
  to?: string;
  mono?: boolean;
}

function crumbs(routePath: string): Crumb[] {
  const route = match(routePath);
  const area = (a: Area): Crumb => ({ label: AREA_LABELS[a], to: a === "storms" ? "/storms" : href({ area: a }) });
  switch (route.kind) {
    case "live":
      return [{ label: AREA_LABELS.live }];
    case "storms":
      return [
        area("storms"),
        { label: route.date, to: href({ area: "storms", date: route.date }), mono: true },
        { label: TAB_LABELS[route.tab] },
      ];
    case "scorecard":
      return [area("scorecard"), { label: VIEW_LABELS[route.view] }];
    case "try":
      return [area("try"), { label: TOOL_LABELS[route.tool] }];
    case "method":
      return [area("method"), { label: METHOD_LABELS[route.page] }];
    case "pipeline":
      return [area("pipeline"), { label: PIPELINE_LABELS[route.view] }];
    default:
      return [];
  }
}

// shortcut: breadcrumb holds at most three items, upgrade when an area gains a deeper level
/** Area, storm date, and current page for a route path; nothing for a redirect or unknown route. */
export function Breadcrumb({ routePath }: { routePath: string }) {
  const items = crumbs(routePath);
  if (items.length === 0) return null;
  const last = items.length - 1;
  return (
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={item.label}>
            {i === last || item.to === undefined ? (
              <span aria-current="page" class={item.mono ? "mono" : undefined}>
                {item.label}
              </span>
            ) : (
              <Link href={item.to} class={item.mono ? "mono" : undefined}>
                <span class="crumb-label">{item.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
