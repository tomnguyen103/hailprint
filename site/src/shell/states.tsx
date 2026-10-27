import type { ComponentChildren } from "preact";
import type { DataError } from "../data/types";
import { GlyphIcon } from "./icons";
import { Link } from "./link";

/** One sentence that names why, and the next step as a link. */
export function EmptyState({
  sentence,
  link,
}: {
  sentence: string;
  link?: { href: string; label: string } | undefined;
}) {
  return (
    <div class="state state-empty">
      <GlyphIcon size={32} />
      <p>{sentence}</p>
      {link ? <Link href={link.href}>{link.label}</Link> : null}
    </div>
  );
}

/** The DataError message names the file and the reason; Retry refetches. */
export function ErrorState({ error, onRetry }: { error: DataError; onRetry: () => void }) {
  return (
    <div class="state state-error" role="alert">
      <GlyphIcon size={32} />
      <p>{error.message}</p>
      <button type="button" class="button button-primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function LoadingState({ file }: { file: string }) {
  return (
    <p class="state state-loading" aria-live="polite">
      Loading {file}.
    </p>
  );
}

/** A page title with one sentence under it; the areas and the empty pages use it. */
export function PageHeader({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  );
}