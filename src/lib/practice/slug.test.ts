import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeLineSlug, slugifyPractice } from "./slug.ts";

test("slugify Austrian practice names", () => {
  assert.equal(slugifyPractice("Tierordination Murtal"), "tierordination-murtal");
  assert.equal(slugifyPractice("Dr. Böck  & Söhne"), "dr-boeck-soehne");
  assert.equal(slugifyPractice("   "), "praxis");
  assert.equal(slugifyPractice("Login"), "praxis-login");
});

test("sanitize inbound line slugs", () => {
  assert.equal(sanitizeLineSlug("Tierordination-Murtal"), "tierordination-murtal");
  assert.equal(sanitizeLineSlug("../app"), "app");
  assert.equal(sanitizeLineSlug(""), "");
});
