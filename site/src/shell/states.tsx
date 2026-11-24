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

export type LoadingShape = "table" | "stats" | "map" | "text";

const BLOCKS: Record<LoadingShape, number> = { table: 6, stats: 4, map: 1, text: 4 };

/** A busy region of skeleton blocks in the shape of the loaded region; a hidden status names the file outside the busy region. */
export function LoadingState({ file, shape = "table" }: { file: string; shape?: LoadingShape }) {
  return (
    <>
      <span class="visually-hidden" role="status">
        Load {file}{"…"}
      </span>
      <div class={`state state-loading skeleton-${shape}`} aria-busy="true">
        {Array.from({ length: BLOCKS[shape] }, (_, i) => (
          <span key={i} class="skeleton-block" aria-hidden="true" />
        ))}
      </div>
    </>
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