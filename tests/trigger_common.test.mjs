import assert from "node:assert/strict";
import { test } from "node:test";

import { isPartialExit } from "../trigger/common.ts";

test("exitCode 3 on the error is partial", () => {
  assert.equal(isPartialExit(Object.assign(new Error("x"), { exitCode: 3 })), true);
});

test("result.exitCode 3 is partial", () => {
  assert.equal(isPartialExit({ result: { exitCode: 3 } }), true);
});

test("first line with code 3 is partial", () => {
  assert.equal(isPartialExit(new Error("Script exited with a non-zero code 3")), true);
});

test("codes 30 and 13 are not partial", () => {
  assert.equal(isPartialExit(new Error("exited with a non-zero code 30")), false);
  assert.equal(isPartialExit(new Error("exited with a non-zero code 13")), false);
});

test("a later stderr line with exit code 3 does not make code 1 partial", () => {
  const err = new Error("exited with a non-zero code 1\nstderr: previous exit code 3");
  assert.equal(isPartialExit(err), false);
});

test("a non-error value is not partial", () => {
  assert.equal(isPartialExit("exit code 3"), false);
  assert.equal(isPartialExit(undefined), false);
});
