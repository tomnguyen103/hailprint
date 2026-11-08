import { expect, it } from "vitest";
import { BLOCK_WORDS, FORBIDDEN_WORD, blockFindings, foldWords, proseFindings, sentences, wordCount } from "./prose";

const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

function pageOf(text: string) {
  return { title: "", blocks: [{ kind: "prose" as const, text }] };
}

it("counts words and splits sentences without breaking a decimal", () => {
  expect(wordCount("  one two\nthree ")).toBe(3);
  expect(sentences("The default is 0.75 in. The max is 2.5 in.")).toEqual(["The default is 0.75 in.", "The max is 2.5 in."]);
});

it("counts the fold as the title and every block before the first figure", () => {
  const page = {
    title: "Two words",
    blocks: [
      { kind: "prose" as const, text: "One two three." },
      { kind: "list" as const, items: ["four five", "six"] },
      { kind: "figure" as const, id: "receipt" as const },
      { kind: "prose" as const, text: "not counted" },
    ],
  };
  expect(foldWords(page)).toBe(8);
});

it("passes a fold of 120 words and names a fold of 121", () => {
  const short = (n: number) => Array.from({ length: n }, () => `${words(10)}.`).join(" ");
  expect(proseFindings({ data: pageOf(short(12)) })).toEqual([]);
  expect(proseFindings({ data: pageOf(`${short(12)} word.`) })).toEqual([{ page: "data", rule: "fold", text: "121 words" }]);
});

it("passes a sentence of 25 words and names a sentence of 26", () => {
  const good = `${words(25)}. ${words(25)}. ${words(25)}. ${words(25)}.`;
  expect(proseFindings({ data: pageOf(good) })).toEqual([]);
  const bad = `${words(26)}.`;
  expect(proseFindings({ data: pageOf(bad) })).toEqual([{ page: "data", rule: "sentence", text: bad }]);
});

it("names a sentence that starts with an ing form", () => {
  const text = "Scoring the swath takes one step.";
  expect(proseFindings({ scoring: pageOf(text) })).toEqual([{ page: "scoring", rule: "ing", text }]);
});

it("names a sentence with passive voice", () => {
  const s1 = "Sentinel cells are masked before arithmetic.";
  const s2 = "A report is not scored.";
  const s3 = "A report is excluded.";
  const s4 = "A file is used.";
  const s5 = "A file is added.";
  expect(proseFindings({ scoring: pageOf(`${s1} ${s2} ${s3} ${s4} ${s5}`) })).toEqual([
    { page: "scoring", rule: "passive", text: s1 },
    { page: "scoring", rule: "passive", text: s2 },
    { page: "scoring", rule: "passive", text: s3 },
    { page: "scoring", rule: "passive", text: s4 },
    { page: "scoring", rule: "passive", text: s5 },
  ]);
});

it("names the forbidden word in any case and in any block", () => {
  const text = `Hail ${FORBIDDEN_WORD.toUpperCase()} is not a phrase here.`;
  expect(proseFindings({ limits: pageOf(text) })).toEqual([{ page: "limits", rule: "forbidden", text }]);
  const code = { title: "", blocks: [{ kind: "code" as const, text: FORBIDDEN_WORD }] };
  expect(proseFindings({ limits: code })).toEqual([{ page: "limits", rule: "forbidden", text: FORBIDDEN_WORD }]);
});

it("passes a prose block of 25 words and flags a prose block of 26 words via blockFindings (AUD-18)", () => {
  expect(BLOCK_WORDS).toBe(25);
  expect(blockFindings({ data: pageOf(`${words(25)}.`) })).toEqual([]);
  const tooLong = `${words(15)}. ${words(11)}.`;
  expect(blockFindings({ data: pageOf(tooLong) })).toEqual([{ page: "data", rule: "block", text: tooLong }]);
});

