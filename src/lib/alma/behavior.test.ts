import assert from "node:assert/strict";
import { test } from "node:test";
import { behaviorPromptBlock } from "./behavior.ts";

test("behaviorPromptBlock is empty for empty/whitespace-only input", () => {
  assert.equal(behaviorPromptBlock(""), "");
  assert.equal(behaviorPromptBlock("   "), "");
  assert.equal(behaviorPromptBlock(undefined), "");
  assert.equal(behaviorPromptBlock(null), "");
});

test("behaviorPromptBlock trims and wraps the text as its own block", () => {
  const block = behaviorPromptBlock("  Nie ueber Preise am Telefon reden.  ");
  assert.equal(block, "Anweisungen der Praxisinhaberin:\nNie ueber Preise am Telefon reden.");
});

test("behaviorPromptBlock caps at 2000 Zeichen", () => {
  const long = "a".repeat(2500);
  const block = behaviorPromptBlock(long);
  assert.equal(block, `Anweisungen der Praxisinhaberin:\n${"a".repeat(2000)}`);
});

test("behaviorPromptBlock strips control characters but keeps newlines", () => {
  const withControl = "Erste Zeile\nZweite" + String.fromCharCode(7) + "Zeile" + String.fromCharCode(27) + "hier";
  const block = behaviorPromptBlock(withControl);
  assert.equal(block, "Anweisungen der Praxisinhaberin:\nErste Zeile\nZweiteZeilehier");
});
