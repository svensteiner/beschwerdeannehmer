import assert from "node:assert/strict";
import { test } from "node:test";
import { inviteStaffCheck, resetStaffPasswordCheck } from "./staff-check.ts";
import { INHABERIN_SETTINGS_ERROR, isInhaberin, sanitizeStaffRole, staffRoleLabel } from "./staff-role.ts";

test("Kollegin needs name, email, matching password, and a role", () => {
  assert.equal(sanitizeStaffRole("Kassa"), "kassa");
  assert.equal(sanitizeStaffRole("inhaberin"), "inhaberin");
  assert.equal(sanitizeStaffRole("admin"), null);
  assert.equal(staffRoleLabel("kassa"), "Tierarzthelferin");
  assert.equal(sanitizeStaffRole("Tierarzthelferin"), "kassa");
  assert.equal(inviteStaffCheck({ name: "", email: "a@b.at", password: "SilviaDesk1!", confirm: "SilviaDesk1!", role: "kassa" }).ok, false);
  assert.equal(inviteStaffCheck({ name: "Lisa", email: "lisa", password: "SilviaDesk1!", confirm: "SilviaDesk1!", role: "kassa" }).ok, false);
  assert.equal(inviteStaffCheck({ name: "Lisa", email: "lisa@ordination.at", password: "SilviaDesk1!", confirm: "other", role: "kassa" }).ok, false);
  assert.equal(inviteStaffCheck({ name: "Lisa", email: "lisa@ordination.at", password: "short", confirm: "short", role: "kassa" }).ok, false);
  const ok = inviteStaffCheck({
    name: " Lisa Kassa ",
    email: "  Lisa@Ordination.AT ",
    password: "SilviaKassa1!",
    confirm: "SilviaKassa1!",
    role: "kassa",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.email, "lisa@ordination.at");
    assert.equal(ok.name, "Lisa Kassa");
    assert.equal(ok.role, "kassa");
  }
});

test("Inhaberin may set a colleague password without the previous one", () => {
  assert.equal(resetStaffPasswordCheck({ id: "", password: "SilviaKassa2!", confirm: "SilviaKassa2!" }).ok, false);
  assert.equal(resetStaffPasswordCheck({ id: "u1", password: "short", confirm: "short" }).ok, false);
  assert.equal(resetStaffPasswordCheck({ id: "u1", password: "SilviaKassa2!", confirm: "other" }).ok, false);
  const ok = resetStaffPasswordCheck({ id: "u1", password: "SilviaKassa2!", confirm: "SilviaKassa2!" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.id, "u1");
    assert.equal(ok.password, "SilviaKassa2!");
  }
});

test("only the Inhaberin may change address, hours, and Nachtdienst", () => {
  assert.equal(isInhaberin("inhaberin"), true);
  assert.equal(isInhaberin("Inhaberin"), true);
  assert.equal(isInhaberin("kassa"), false);
  assert.equal(isInhaberin(""), false);
  assert.equal(isInhaberin(undefined), false);
  assert.match(INHABERIN_SETTINGS_ERROR, /Inhaberin/);
});
