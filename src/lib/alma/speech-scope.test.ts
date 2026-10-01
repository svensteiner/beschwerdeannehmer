import assert from "node:assert/strict";
import { test } from "node:test";
import { speechPracticeId } from "./speech-scope.ts";

test("homepage demo never inherits authenticated practice vocabulary", () => {
  assert.equal(speechPracticeId(true, "practice-a"), undefined);
  assert.equal(speechPracticeId(true), undefined);
});

test("practice speech retains its own scope and anonymous speech has none", () => {
  assert.equal(speechPracticeId(false, "practice-a"), "practice-a");
  assert.equal(speechPracticeId(false), undefined);
});
