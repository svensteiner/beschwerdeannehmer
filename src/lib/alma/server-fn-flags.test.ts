import assert from "node:assert/strict";
import { test } from "node:test";
import { isStrictTrue } from "./strict-boolean.ts";

const nonBooleanFlags = ["false", "true", 0, 1, {}, [], null, undefined, false];

test("Demo- und Schulungsflags akzeptieren nur echtes Boolean true", () => {
  for (const flag of nonBooleanFlags) {
    assert.equal(isStrictTrue(flag), false, `flag=${String(flag)}`);
  }
  assert.equal(isStrictTrue(true), true);
});
