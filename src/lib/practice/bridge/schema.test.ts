import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLikeNeedle, OWNER_SEARCH_LIMIT } from "./schema.ts";

/**
 * Suchtext fuer die Haltersuche (Punkte 20 und 21).
 *
 * 20. `%` und `_` sind LIKE-Platzhalter. Ohne Maskierung liefert die Suche nach
 *     "%" den ganzen Bestand, und "_" trifft beliebige Zeichen.
 * 21. Die Suche hat eine Obergrenze.
 */

test("escapeLikeNeedle macht Platzhalter woertlich", () => {
  assert.equal(escapeLikeNeedle("Anna"), "Anna");
  // "%" ist ein Platzhalter, kein Suchtext.
  assert.equal(escapeLikeNeedle("%"), "\\%");
  assert.equal(escapeLikeNeedle("%%"), "\\%\\%");
  // "_" trifft ein beliebiges Zeichen.
  assert.equal(escapeLikeNeedle("_"), "\\_");
  // Innerhalb eines Namens ebenso.
  assert.equal(escapeLikeNeedle("An_na"), "An\\_na");
  assert.equal(escapeLikeNeedle("50%"), "50\\%");
  // Der Backslash muss zuerst maskiert werden, sonst zerstoert er die eigene
  // Maskierung: aus "\" darf nicht "\%" werden.
  assert.equal(escapeLikeNeedle("\\"), "\\\\");
  assert.equal(escapeLikeNeedle("\\%"), "\\\\\\%");
});

test("escapeLikeNeedle trimmt und begrenzt", () => {
  assert.equal(escapeLikeNeedle("  Berger  "), "Berger");
  assert.equal(escapeLikeNeedle("", 10), "");
  assert.equal(escapeLikeNeedle("abcdefghij", 4), "abcd");
  // Ohne Angabe gilt die Standardlaenge 80.
  assert.equal(escapeLikeNeedle("x".repeat(120)).length, 80);
});

test("OWNER_SEARCH_LIMIT begrenzt die Haltersuche", () => {
  assert.ok(OWNER_SEARCH_LIMIT > 0 && OWNER_SEARCH_LIMIT <= 100);
});
