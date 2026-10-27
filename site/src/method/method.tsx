import { METHOD_LABELS, type MethodPage } from "../router";
import { EmptyState, PageHeader } from "../shell/states";

// shortcut: placeholder until ticket 05 renders METHOD_CONTENT, upgrade in ticket 05
export function Method({ page }: { page: MethodPage }) {
  return (
    <>
      <PageHeader title={METHOD_LABELS[page]} />
      <EmptyState sentence="This page is in progress." />
    </>
  );
}
