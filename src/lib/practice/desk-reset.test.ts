import assert from "node:assert/strict";
import { test } from "node:test";
import { TAFEL_ANZEIGE_ERROR } from "./tafel-anzeige.ts";
import {
  DESK_RESET_ANZEIGE_ID,
  DESK_RESET_HINT,
  DESK_RESET_HINT_ANZEIGE,
  DESK_RESET_HINT_ID,
  deskResetAnzeigeLine,
  deskResetApplyCheck,
  deskResetCodeFromBytes,
  deskResetFormVisible,
  deskResetHint,
  deskResetRefuseAnzeige,
  deskResetRequestCheck,
  formatDeskResetCode,
  parseDeskResetFile,
  renderDeskResetFile,
} from "./desk-reset.ts";

test("Anzeige refuses the password file so the copy folder stays empty", () => {
  assert.equal(deskResetRefuseAnzeige(false), null);
  assert.equal(deskResetRefuseAnzeige(), null);
  assert.deepEqual(deskResetRefuseAnzeige(true), { ok: false, error: TAFEL_ANZEIGE_ERROR });
  assert.equal(deskResetAnzeigeLine(TAFEL_ANZEIGE_ERROR), TAFEL_ANZEIGE_ERROR);
  assert.equal(deskResetAnzeigeLine("Bitte eine gültige E-Mail angeben."), "");
  assert.equal(deskResetAnzeigeLine(""), "");
  assert.equal(DESK_RESET_ANZEIGE_ID, "desk-reset-anzeige");
  assert.equal(DESK_RESET_HINT_ID, "login-reset-hint");
  assert.match(DESK_RESET_HINT, /auf diesem Rechner/);
  assert.match(DESK_RESET_HINT_ANZEIGE, /Schreib-Rechner/);
  assert.doesNotMatch(DESK_RESET_HINT_ANZEIGE, /auf diesem Rechner/);
  assert.equal(deskResetHint(), DESK_RESET_HINT);
  assert.equal(deskResetHint(false), DESK_RESET_HINT);
  assert.equal(deskResetHint(true), DESK_RESET_HINT_ANZEIGE);
  assert.equal(deskResetFormVisible(), true);
  assert.equal(deskResetFormVisible(false), true);
  assert.equal(deskResetFormVisible(true), false);
});

test("reset codes are eight unambiguous characters", () => {
  assert.equal(formatDeskResetCode("xk7m p2q9"), "XK7M-P2Q9");
  assert.equal(formatDeskResetCode("XK7M-P2Q9"), "XK7M-P2Q9");
  assert.equal(formatDeskResetCode("short"), "");
  const code = deskResetCodeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(deskResetCodeFromBytes(Uint8Array.from([0, 1, 2])), "");
});

test("reset request needs an email, apply needs a matching new password", () => {
  assert.equal(deskResetRequestCheck("lisa").ok, false);
  assert.equal(deskResetRequestCheck("  Lisa@Ordination.AT ").ok, true);
  assert.equal(deskResetApplyCheck({ email: "lisa@x.at", code: "XK7M-P2Q9", password: "short", confirm: "short" }).ok, false);
  assert.equal(
    deskResetApplyCheck({
      email: "lisa@x.at",
      code: "xk7m-p2q9",
      password: "SilviaDesk2!",
      confirm: "other",
    }).ok,
    false,
  );
  const ok = deskResetApplyCheck({
    email: "  Lisa@X.AT ",
    code: "xk7mp2q9",
    password: "SilviaDesk2!",
    confirm: "SilviaDesk2!",
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.email, "lisa@x.at");
    assert.equal(ok.code, "XK7M-P2Q9");
  }
});

test("reset file round-trips email, code, and expiry", () => {
  const exp = new Date("2026-08-26T16:00:00.000Z");
  const body = renderDeskResetFile({ email: "Lisa@Ordination.AT", code: "xk7m-p2q9", exp });
  assert.match(body, /einmaliger Code/);
  assert.match(body, /Kein E-Mail-Versand/);
  const live = parseDeskResetFile(body, Date.parse("2026-08-26T15:00:00.000Z"));
  assert.equal(live?.ok, true);
  if (live?.ok) {
    assert.equal(live.email, "lisa@ordination.at");
    assert.equal(live.code, "XK7M-P2Q9");
  }
  const late = parseDeskResetFile(body, Date.parse("2026-08-26T16:00:01.000Z"));
  assert.equal(late?.ok, false);
});
