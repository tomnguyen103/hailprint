import { useEffect } from "preact/hooks";
import { Method } from "./method/method";
import { Pipeline } from "./pipeline/pipeline";
import { href, replace, type Area } from "./router";
import { Scorecard } from "./scorecard/scorecard";
import { AreaBoundary } from "./shell/area-boundary";
import { Layout } from "./shell/layout";
import { EmptyState, ErrorState, LoadingState } from "./shell/states";
import { useIndex } from "./state/index";
import { useRoute } from "./state/route";
import { landingStorm } from "./storms/select";
import { Workspace } from "./storms/workspace";
import { TryIt } from "./try/try";

const NO_INDEX = "No storm date is published yet.";

export function App() {
  const { path, route } = useRoute();
  const index = useIndex();
  const storms = index.status === "ready" ? index.data.storms : [];
  const newest = storms[0];
  const landing = landingStorm(storms);
  useEffect(() => {
    if (route.kind === "redirect-latest" && landing) {
      replace(href({ area: "storms", date: landing.storm_date, tab: "map" }));
    }
  }, [route.kind, landing]);
  const active: Area | null =
    route.kind === "scorecard" || route.kind === "try" || route.kind === "method" || route.kind === "pipeline"
      ? route.kind
      : route.kind === "not-found" ? null : "storms";
  let body;
  if (route.kind === "not-found") {
    body = <EmptyState sentence="No page at this address." link={{ href: "/storms", label: "Storms" }} />;
  } else if (route.kind === "method") {
    body = <Method page={route.page} />;
  } else if (route.kind === "pipeline") {
    body = <Pipeline view={route.view} />;
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
    body = storm ? <Workspace index={index.data} storm={storm} tab={route.tab} />
      : <EmptyState sentence={`No storm date ${route.date} is published.`} link={{ href: href({ area: "storms", date: newest.storm_date }), label: newest.storm_date }} />;
  }
  return (
    <Layout active={active}>
      <AreaBoundary resetKey={path}>{body}</AreaBoundary>
    </Layout>
  );
}
