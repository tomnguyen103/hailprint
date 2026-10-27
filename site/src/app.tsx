import { useEffect } from "preact/hooks";
import { LaterArea } from "./areas/later";
import { StormsArea } from "./areas/storms";
import { href, replace, type Area } from "./router";
import { Scorecard } from "./scorecard/scorecard";
import { Layout } from "./shell/layout";
import { EmptyState, ErrorState, LoadingState } from "./shell/states";
import { useIndex } from "./state/index";
import { useRoute } from "./state/route";
import { TryIt } from "./try/try";

const NO_INDEX = "No storm date is published yet.";

export function App() {
  const { route } = useRoute();
  const index = useIndex();
  const storms = index.status === "ready" ? index.data.storms : [];
  const newest = storms[0];

  useEffect(() => {
    if (route.kind === "redirect-latest" && newest) {
      replace(href({ area: "storms", date: newest.storm_date, tab: "map" }));
    }
  }, [route.kind, newest]);

  const active: Area | null =
    route.kind === "area"
      ? route.area
      : route.kind === "scorecard" || route.kind === "try"
        ? route.kind
        : route.kind === "not-found"
          ? null
          : "storms";

  let body;
  if (route.kind === "not-found") {
    body = <EmptyState sentence="No page at this address." link={{ href: "/storms", label: "Storms" }} />;
  } else if (route.kind === "area") {
    body = <LaterArea area={route.area} />;
  } else if (index.status === "error") {
    body = <ErrorState error={index.error} onRetry={index.retry} />;
  } else if (index.status === "loading") {
    body = index.showLoading ? <LoadingState file="storms.json" /> : null;
  } else if (!newest) {
    body = <EmptyState sentence={NO_INDEX} />;
  } else if (route.kind === "redirect-latest") {
    body = null;
  } else if (route.kind === "scorecard") {
    body = <Scorecard index={index.data} view={route.view} />;
  } else if (route.kind === "try") {
    body = <TryIt index={index.data} tool={route.tool} />;
  } else {
    const storm = storms.find((s) => s.storm_date === route.date);
    body = storm ? (
      <StormsArea index={index.data} storm={storm} tab={route.tab} />
    ) : (
      <EmptyState
        sentence={`No storm date ${route.date} is published.`}
        link={{ href: href({ area: "storms", date: newest.storm_date }), label: newest.storm_date }}
      />
    );
  }

  return <Layout active={active}>{body}</Layout>;
}