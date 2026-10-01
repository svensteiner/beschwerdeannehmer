import assert from "node:assert/strict";
import { test } from "node:test";
import { draftOpensInNewTab } from "./desk-draft.ts";

test("WhatsApp drafts open a tab; mailto/sms/tel stay on the Tafel", () => {
  assert.equal(draftOpensInNewTab("https://wa.me/43664556684"), true);
  assert.equal(draftOpensInNewTab("http://wa.me/43664556684"), true);
  assert.equal(draftOpensInNewTab("mailto:rezeption@ordination.at?subject=Termin"), false);
  assert.equal(draftOpensInNewTab("sms:+43664123483"), false);
  assert.equal(draftOpensInNewTab("tel:+43316735883"), false);
  assert.equal(draftOpensInNewTab(""), false);
  assert.equal(draftOpensInNewTab("  "), false);
});
