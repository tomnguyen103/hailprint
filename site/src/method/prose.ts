// The prose budget for the Method pages: the fold stays under 120 words, a sentence under 26,
// no sentence opens with an -ing form, and the forbidden word never appears.
import type { Block, Page } from "./content";

export const FOLD_WORDS = 120;
export const SENTENCE_WORDS = 25;
/** `swath.FORBIDDEN_WORD` in Python; joined here so the word itself stays out of the site source. */
export const FORBIDDEN_WORD = ["dam", "age"].join("");

export interface Finding {
  page: string;
  rule: "fold" | "sentence" | "ing" | "forbidden";
  text: string;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Sentences split at a terminal mark followed by space, so a decimal such as 0.75 stays whole. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every text a block carries; code and figures count for the forbidden word only. */
function textsOf(block: Block): string[] {
  switch (block.kind) {
    case "list":
      return block.items;
    case "figure":
      return [];
    default:
      return [block.text];
  }
}

/** Word count of the title and every block before the first figure. */
export function foldWords(page: Page): number {
  const first = page.blocks.findIndex((b) => b.kind === "figure");
  const fold = first === -1 ? page.blocks : page.blocks.slice(0, first);
  return wordCount(page.title) + fold.flatMap(textsOf).reduce((sum, t) => sum + wordCount(t), 0);
}

export function proseFindings(content: Record<string, Page>): Finding[] {
  const findings: Finding[] = [];
  const forbidden = new RegExp(FORBIDDEN_WORD, "i");
  for (const [page, body] of Object.entries(content)) {
    const fold = foldWords(body);
    if (fold > FOLD_WORDS) findings.push({ page, rule: "fold", text: `${fold} words` });
    for (const block of body.blocks) {
      for (const text of textsOf(block)) {
        if (forbidden.test(text)) findings.push({ page, rule: "forbidden", text });
        if (block.kind === "code") continue;
        for (const sentence of sentences(text)) {
          if (wordCount(sentence) > SENTENCE_WORDS) findings.push({ page, rule: "sentence", text: sentence });
          const first = sentence.split(/\s+/)[0]?.replace(/[^a-z]/gi, "").toLowerCase() ?? "";
          if (first.endsWith("ing")) findings.push({ page, rule: "ing", text: sentence });
        }
      }
    }
    if (forbidden.test(body.title)) findings.push({ page, rule: "forbidden", text: body.title });
  }
  return findings;
}
