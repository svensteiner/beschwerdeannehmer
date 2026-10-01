import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  clearPendingHolen,
  hasPendingHolen,
  holenPendingShouldApply,
  holenPendingShouldWait,
  parseHolenPendingMeta,
  pendingHolenDir,
  pendingHolenDumpPath,
  pendingHolenMetaPath,
  readPendingHolen,
  writePendingHolen,
  holenPendingIsOpen,
  holenPeekStatus,
  takeHolenFail,
  takeHolenFailForDesk,
  peekHolenFail,
  writeHolenFail,
  holenFailPath,
  HOLEN_FAIL_LINE,
  holenLoginPath,
  holenLoginEmailFromOwners,
  writeHolenLoginEmail,
  takeHolenLoginEmail,
  takeHolenLoginEmailForDesk,
  holenSidecarTakeAllowed,
} from "./pglite-holen-pending.ts";

test("Tafel holen pending sits next to the folder, not inside it", () => {
  const dir = join(tmpdir(), `silvia-holen-pending-${process.pid}`);
  assert.equal(pendingHolenDir(dir), `${dir}.pending-holen`);
  assert.equal(pendingHolenDumpPath(dir), join(`${dir}.pending-holen`, "dump.tar.gz"));
  assert.equal(pendingHolenMetaPath(dir), join(`${dir}.pending-holen`, "meta.json"));
  assert.equal(holenPendingShouldApply({ anzeige: true, dataDir: dir }), false);
  assert.equal(holenPendingShouldApply({ anzeige: false, dataDir: "" }), false);
  assert.equal(holenPendingShouldApply({ anzeige: false, dataDir: dir }), true);
  assert.equal(holenPendingShouldWait({ anzeige: true, open: true }), false);
  assert.equal(holenPendingShouldWait({ anzeige: false, open: true }), true);
  assert.equal(holenPendingShouldWait({ anzeige: false, open: false }), false);
});

test("Tafel holen pending rejects a torn dump or a thin meta", () => {
  assert.equal(parseHolenPendingMeta(null), null);
  assert.equal(parseHolenPendingMeta({ email: "a@b.c", tokenHash: "aa", at: "2026-08-29T12:00:00.000Z" }), null);
  assert.equal(
    parseHolenPendingMeta({
      email: "not-an-email",
      tokenHash: "a".repeat(64),
      at: "2026-08-29T12:00:00.000Z",
    }),
    null,
  );
  assert.deepEqual(
    parseHolenPendingMeta({
      email: "Inhaberin@Example.com",
      tokenHash: "AB".repeat(32),
      at: "2026-08-29T12:00:00.000Z",
      filename: "silvia-tafel-2026-08-29.tar.gz",
    }),
    {
      email: "inhaberin@example.com",
      tokenHash: "ab".repeat(32),
      at: "2026-08-29T12:00:00.000Z",
      filename: "silvia-tafel-2026-08-29.tar.gz",
    },
  );
});

test("Tafel holen writes the dump beside the folder and clears both files", () => {
  const dir = join(tmpdir(), `silvia-holen-pending-io-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(pendingHolenDumpPath(dir), { force: true });
  rmSync(pendingHolenMetaPath(dir), { force: true });
  mkdirSync(dir, { recursive: true });
  const bytes = new Uint8Array(40);
  bytes[0] = 0x1f;
  bytes[1] = 0x8b;
  const meta = {
    email: "dr@ordination.example.com",
    tokenHash: "cd".repeat(32),
    at: "2026-08-29T21:00:00.000Z",
    filename: "silvia-tafel-2026-08-29.tar.gz",
  };
  assert.equal(writePendingHolen(dir, bytes, meta), true);
  assert.equal(existsSync(pendingHolenDir(dir)), true);
  assert.equal(holenPendingIsOpen(dir), true);
  assert.equal(holenPendingIsOpen(""), false);
  assert.deepEqual(holenPeekStatus(false, dir), { ok: true, pending: true, fail: "" });
  assert.deepEqual(holenPeekStatus(true, dir), { ok: true, pending: true, fail: "" });
  assert.deepEqual(holenPeekStatus(true, dir, true), { ok: true, pending: false, fail: "" });
  assert.deepEqual(holenPeekStatus(false, dir, true), {
    ok: false,
    error: "Bitte neu anmelden.",
    status: 401,
    fail: "",
  });
  assert.equal(hasPendingHolen(dir), true);
  const pending = readPendingHolen(dir);
  assert.ok(pending);
  assert.equal(pending.bytes.byteLength, 40);
  assert.deepEqual(pending.meta, meta);
  assert.equal(existsSync(join(dir, "pending-holen.tar.gz")), false);
  clearPendingHolen(dir);
  assert.equal(holenPendingIsOpen(dir), false);
  assert.deepEqual(holenPeekStatus(true, dir), { ok: true, pending: false, fail: "" });
  assert.deepEqual(holenPeekStatus(false, dir), {
    ok: false,
    error: "Bitte neu anmelden.",
    status: 401,
    fail: "",
  });
  assert.equal(hasPendingHolen(dir), false);
  assert.equal(readPendingHolen(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test("Tafel holen ersetzt nie eine bereits vollständige Übergabe", () => {
  const dir = join(tmpdir(), `silvia-holen-pending-race-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(pendingHolenDir(dir), { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const first = new Uint8Array(40).fill(1);
  const second = new Uint8Array(40).fill(2);
  const firstMeta = {
    email: "erste@ordination.example.com",
    tokenHash: "ab".repeat(32),
    at: "2026-08-29T21:00:00.000Z",
  };
  const secondMeta = {
    email: "zweite@ordination.example.com",
    tokenHash: "cd".repeat(32),
    at: "2026-08-30T21:00:00.000Z",
  };

  assert.equal(writePendingHolen(dir, first, firstMeta), true);
  assert.equal(writePendingHolen(dir, second, secondMeta), false);
  assert.deepEqual(readPendingHolen(dir), { bytes: first, meta: firstMeta });

  clearPendingHolen(dir);
  rmSync(dir, { recursive: true, force: true });
});

test("Tafel holen liest eine Übergabe vor der atomaren Ordner-Version weiter", () => {
  const dir = join(tmpdir(), `silvia-holen-pending-legacy-${process.pid}`);
  const legacyDump = `${dir}.pending-holen.tar.gz`;
  const legacyMeta = `${dir}.pending-holen.json`;
  rmSync(dir, { recursive: true, force: true });
  rmSync(legacyDump, { force: true });
  rmSync(legacyMeta, { force: true });
  mkdirSync(dir, { recursive: true });
  const bytes = new Uint8Array(40).fill(3);
  const meta = {
    email: "alt@ordination.example.com",
    tokenHash: "ef".repeat(32),
    at: "2026-08-29T21:00:00.000Z",
  };
  writeFileSync(legacyDump, bytes);
  writeFileSync(legacyMeta, `${JSON.stringify(meta)}\n`);

  assert.deepEqual(readPendingHolen(dir), { bytes, meta });
  clearPendingHolen(dir);
  assert.equal(existsSync(legacyDump), false);
  assert.equal(existsSync(legacyMeta), false);
  rmSync(dir, { recursive: true, force: true });
});

test("Tafel holen fail sidecar is one-shot and sits next to the folder", () => {
  const dir = join(tmpdir(), `silvia-holen-fail-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(holenFailPath(dir), { force: true });
  mkdirSync(dir, { recursive: true });
  assert.equal(holenFailPath(dir), `${dir}.holen-fail`);
  assert.equal(takeHolenFail(dir), null);
  assert.equal(peekHolenFail(dir), null);
  assert.equal(writeHolenFail(dir), HOLEN_FAIL_LINE);
  assert.equal(existsSync(join(dir, "holen-fail")), false);
  assert.equal(peekHolenFail(dir), HOLEN_FAIL_LINE);
  assert.deepEqual(holenPeekStatus(false, dir), {
    ok: false,
    error: "Bitte neu anmelden.",
    status: 401,
    fail: HOLEN_FAIL_LINE,
  });
  assert.deepEqual(holenPeekStatus(true, dir), { ok: true, pending: false, fail: HOLEN_FAIL_LINE });
  assert.deepEqual(holenPeekStatus(true, dir, true), { ok: true, pending: false, fail: "" });
  assert.equal(peekHolenFail(dir), HOLEN_FAIL_LINE);
  assert.equal(takeHolenFail(dir), HOLEN_FAIL_LINE);
  assert.equal(peekHolenFail(dir), null);
  assert.equal(takeHolenFail(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test("Anzeige does not take the holen fail sidecar", () => {
  const dir = join(tmpdir(), `silvia-holen-fail-anzeige-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(holenFailPath(dir), { force: true });
  mkdirSync(dir, { recursive: true });
  assert.equal(holenSidecarTakeAllowed(true), false);
  assert.equal(holenSidecarTakeAllowed(false), true);
  assert.equal(writeHolenFail(dir), HOLEN_FAIL_LINE);
  assert.equal(takeHolenFailForDesk(dir, true), null);
  assert.equal(peekHolenFail(dir), HOLEN_FAIL_LINE);
  assert.equal(existsSync(holenFailPath(dir)), true);
  assert.equal(takeHolenFailForDesk(dir, false), HOLEN_FAIL_LINE);
  assert.equal(existsSync(holenFailPath(dir)), false);
  rmSync(dir, { recursive: true, force: true });
});

test("Tafel holen login sidecar is the one dump Inhaberin email", () => {
  const dir = join(tmpdir(), `silvia-holen-login-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(holenLoginPath(dir), { force: true });
  mkdirSync(dir, { recursive: true });
  assert.equal(holenLoginEmailFromOwners([]), null);
  assert.equal(holenLoginEmailFromOwners(["a@b.c", "a@b.c"]), "a@b.c");
  assert.equal(holenLoginEmailFromOwners(["a@b.c", "c@d.e"]), null);
  assert.equal(writeHolenLoginEmail(dir, "Dr@Ordination.example.com"), "dr@ordination.example.com");
  assert.equal(existsSync(join(dir, "holen-login")), false);
  assert.equal(takeHolenLoginEmail(dir), "dr@ordination.example.com");
  assert.equal(takeHolenLoginEmail(dir), null);
  rmSync(dir, { recursive: true, force: true });
});

test("Anzeige does not take the holen login sidecar", () => {
  const dir = join(tmpdir(), `silvia-holen-login-anzeige-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  rmSync(holenLoginPath(dir), { force: true });
  mkdirSync(dir, { recursive: true });
  assert.equal(writeHolenLoginEmail(dir, "Dr@Ordination.example.com"), "dr@ordination.example.com");
  assert.equal(takeHolenLoginEmailForDesk(dir, true), null);
  assert.equal(existsSync(holenLoginPath(dir)), true);
  assert.equal(takeHolenLoginEmailForDesk(dir, false), "dr@ordination.example.com");
  assert.equal(existsSync(holenLoginPath(dir)), false);
  rmSync(dir, { recursive: true, force: true });
});
