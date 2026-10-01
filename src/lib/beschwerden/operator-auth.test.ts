import test from "node:test";
import assert from "node:assert/strict";
import { hasOperatorKey } from "./operator-auth.server";

test("Betreiber-Schlüssel akzeptiert nur exakte Übereinstimmung", () => {
  assert.equal(hasOperatorKey("geheim", "geheim"), true);
  assert.equal(hasOperatorKey("Geheim", "geheim"), false);
  assert.equal(hasOperatorKey("geheim-extra", "geheim"), false);
  assert.equal(hasOperatorKey(null, "geheim"), false);
  assert.equal(hasOperatorKey("geheim", ""), false);
});
