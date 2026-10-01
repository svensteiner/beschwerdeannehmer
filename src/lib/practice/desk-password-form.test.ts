import assert from "node:assert/strict";
import { test } from "node:test";
import { deskPasswordFormIds } from "./desk-password-form.ts";

test("Zugang password fields sit in named forms, not loose inputs", () => {
  const ids = deskPasswordFormIds();
  assert.equal(ids.own, "settings-password");
  assert.equal(ids.username, "settings-password-username");
  assert.equal(ids.invite, "staff-invite-form");
  assert.equal(ids.reset, "staff-reset");
  assert.equal(ids.loginReset, "login-reset");
  assert.match(ids.changedToast, /Andere Sitzungen/);
});
