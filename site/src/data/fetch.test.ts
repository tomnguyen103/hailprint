import { afterEach, expect, it } from "vitest";
import { STALE, fetchJson, latest, setFetch } from "./fetch";
import { DataError } from "./types";

afterEach(() => setFetch(null));

function response(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

it("throws DataError with the file name on a 404", async () => {
  setFetch(async () => response(404, "nope"));
  const promise = fetchJson("storms/2019-01-01/pairs.json", (v) => v);
  await expect(promise).rejects.toBeInstanceOf(DataError);
  await expect(promise).rejects.toThrow(/pairs\.json: HTTP 404/);
});

it("throws DataError when the body is not JSON", async () => {
  setFetch(async () => response(200, "{oops"));
  await expect(fetchJson("storms.json", (v) => v)).rejects.toThrow(/storms\.json: .*JSON/);
});

it("passes the parsed body through the guard", async () => {
  setFetch(async (input) => {
    expect(String(input)).toBe("/data/storms.json");
    return response(200, JSON.stringify({ n: 1 }));
  });
  await expect(fetchJson("storms.json", (v) => (v as { n: number }).n)).resolves.toBe(1);
});

it("lets the latest request win across two overlapping calls", async () => {
  const run = latest<string>();
  const slow = new Promise<string>((resolve) => setTimeout(() => resolve("first"), 30));
  const fast = new Promise<string>((resolve) => setTimeout(() => resolve("second"), 5));
  const a = run(() => slow);
  const b = run(() => fast);
  expect(await b).toBe("second");
  expect(await a).toBe(STALE);
});

it("drops the error of a stale request", async () => {
  const run = latest<string>();
  const a = run(() => Promise.reject(new Error("old")));
  const b = run(() => Promise.resolve("new"));
  expect(await a).toBe(STALE);
  expect(await b).toBe("new");
});