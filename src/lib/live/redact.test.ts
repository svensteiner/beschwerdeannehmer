import assert from "node:assert/strict";
import test from "node:test";
import { containsPii, redactForCloud } from "./redact";

test("redaktion: E-Mail ersetzen", () => {
  const { text, redactions } = redactForCloud("Kontakt: anna@example.at");
  assert.strictEqual(text, "Kontakt: [E-Mail]");
  assert.strictEqual(redactions, 1);
});

test("redaktion: Handy 06xx ersetzen", () => {
  const { text, redactions } = redactForCloud("Anruf: 0664 123 4567");
  assert.strictEqual(text.includes("[Nummer]"), true);
  assert.strictEqual(redactions, 1);
});

test("redaktion: +43 Nummer ersetzen", () => {
  const { text, redactions } = redactForCloud("Tel: +43-1-405-1234");
  assert.strictEqual(text.includes("[Nummer]"), true);
  assert.strictEqual(redactions, 1);
});

test("redaktion: 0043 Nummer ersetzen", () => {
  const { text, redactions } = redactForCloud("Fax: 0043 316 9876543");
  assert.strictEqual(text.includes("[Nummer]"), true);
  assert.strictEqual(redactions, 1);
});

test("redaktion: AT Festnetz 01 ersetzen", () => {
  const { text, redactions } = redactForCloud("Wien: 01 405 12 88");
  assert.strictEqual(text.includes("[Nummer]"), true);
  assert.strictEqual(redactions, 1);
});

test("redaktion: IBAN ersetzen", () => {
  const { text, redactions } = redactForCloud("IBAN: AT891234567890123456");
  assert.strictEqual(text.includes("[IBAN]"), true);
  assert.strictEqual(redactions, 1);
});

test("redaktion: 15-stelliger Chip ersetzen", () => {
  const { text, redactions } = redactForCloud("Chip: 123456789012345");
  assert.strictEqual(text, "Chip: [Chip]");
  assert.strictEqual(redactions, 1);
});

test("redaktion: 10-stellige SVN ersetzen", () => {
  const { text, redactions } = redactForCloud("SVN: 1234567890");
  assert.strictEqual(text, "SVN: [Nummer]");
  assert.strictEqual(redactions, 1);
});

test("redaktion: normale Sätze unverändert", () => {
  const { text, redactions } = redactForCloud("Der Patient heißt Bella und ist eine Katze.");
  assert.strictEqual(text, "Der Patient heißt Bella und ist eine Katze.");
  assert.strictEqual(redactions, 0);
});

test("redaktion: Zeit und Datum nicht redaktion", () => {
  const { text, redactions } = redactForCloud("um 14:30 Uhr am 12.10.2026");
  assert.strictEqual(text, "um 14:30 Uhr am 12.10.2026");
  assert.strictEqual(redactions, 0);
});

test("redaktion: mehrere PII in einem Text", () => {
  const { text, redactions } = redactForCloud(
    "Anna unter anna@example.at oder 0664 123 4567"
  );
  assert.strictEqual(redactions, 2);
  assert.strictEqual(text.includes("[E-Mail]"), true);
  assert.strictEqual(text.includes("[Nummer]"), true);
});

test("redaktion: Idempotenz", () => {
  const input = "Kontakt: anna@example.at, Tel: 0664 123 4567";
  const first = redactForCloud(input);
  const second = redactForCloud(first.text);
  assert.strictEqual(first.text, second.text);
  assert.strictEqual(second.redactions, 0);
});

test("redaktion: nicht-String gibt leer zurück", () => {
  const { text, redactions } = redactForCloud(null as any);
  assert.strictEqual(text, "");
  assert.strictEqual(redactions, 0);
});

test("containsPii: erkennt E-Mail", () => {
  assert.strictEqual(containsPii("anna@example.at"), true);
});

test("containsPii: erkennt Handy", () => {
  assert.strictEqual(containsPii("0664 123 4567"), true);
});

test("containsPii: normaler Text hat kein PII", () => {
  assert.strictEqual(
    containsPii("Der Termin ist am Montag um 14:30 Uhr."),
    false
  );
});
