import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingWithConsent } from "./consent.ts";

test("greetingWithConsent haengt die Notiz mit Punkt an", () => {
  const out = greetingWithConsent("Grüß Gott, Silvia am Apparat.", {
    consentEnabled: true,
    consentNote: "Das Gespräch wird aufgezeichnet",
  });
  assert.equal(out, "Grüß Gott, Silvia am Apparat. Das Gespräch wird aufgezeichnet.");
});

test("greetingWithConsent laesst einen vorhandenen Punkt stehen", () => {
  const out = greetingWithConsent("Grüß Gott.", {
    consentEnabled: true,
    consentNote: "Das Gespräch wird verarbeitet.",
  });
  assert.equal(out, "Grüß Gott. Das Gespräch wird verarbeitet.");
});

test("greetingWithConsent bleibt unveraendert wenn deaktiviert", () => {
  const out = greetingWithConsent("Grüß Gott.", {
    consentEnabled: false,
    consentNote: "Das Gespräch wird verarbeitet.",
  });
  assert.equal(out, "Grüß Gott.");
});

test("greetingWithConsent bleibt unveraendert bei leerer Notiz", () => {
  const out = greetingWithConsent("Grüß Gott.", { consentEnabled: true, consentNote: "   " });
  assert.equal(out, "Grüß Gott.");
});
