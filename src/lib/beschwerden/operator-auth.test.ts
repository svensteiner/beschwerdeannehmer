import test from "node:test";
import assert from "node:assert/strict";
import { hasOperatorKey } from "./operator-auth.server";

test("Betreiber-Schlüssel akzeptiert nur exakte Übereinstimmung", () => {
  const key = "geheim-operator-schluessel";
  assert.equal(hasOperatorKey(key, key), true);
  assert.equal(hasOperatorKey("Geheim-operator-schluessel", key), false);
  assert.equal(hasOperatorKey(`${key}-extra`, key), false);
  assert.equal(hasOperatorKey(null, key), false);
  assert.equal(hasOperatorKey("kurz", "kurz"), false);
  assert.equal(hasOperatorKey("geheim", ""), false);
});
