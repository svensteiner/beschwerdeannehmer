import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deskDailyHostHint,
  deskRestartHint,
  deskSourceStamp,
  DESK_RESTART_BODY,
  DESK_RESTART_TITLE,
  deskStorage,
  deskStorageCopyValue,
  deskStorageIsVolatile,
  deskBackupCanDownload,
  deskBackupCanRestore,
  deskBackupFileName,
  deskBackupEncryptedFileName,
  deskBackupContentDisposition,
  deskBackupFilenameFromDisposition,
  deskBackupStampFromFilename,
  deskBackupStampAfterRestore,
  deskBackupBlob,
  deskBackupToBase64,
  deskBackupFromBase64,
  deskBackupIsGzip,
  fetchTafelBackupDownload,
  TAFEL_BACKUP_AT_HEADER,
  TAFEL_BACKUP_HREF,
  TAFEL_HOLEN_HREF,
  deskBackupFileCheck,
  holenFormFields,
  holenChosenTafel,
  postTafelHolen,
  deskBackupRestoreCheck,
  DESK_BACKUP_CONFIRM,
  lastTafelBackupLabel,
  newerTafelBackupIso,
  parseLastTafelBackup,
  readLastTafelBackup,
  lastTafelBackupKey,
  tafelBackupIsDue,
  tafelBackupReminder,
  writeLastTafelBackup,
  applyTafelBackupDownload,
  heuteBackupCardVisible,
  heuteBackupDownloadVisible,
  heuteBackupKeepCopy,
  heuteTafelRestoreVisible,
  writeHolenReloadFlag,
  clearHolenReloadFlag,
  takeHolenReloadToast,
  holenWatchdogShouldReload,
  holenRestoreNext,
  holenRestoreAbortIsBenign,
  holenRestoreReady,
  holenFileInputOn,
  holenRestoreAbortChoice,
  HOLEN_RESTORE_NEED_BOTH,
  takeHolenLoginNotice,
  holenLoginNoticeText,
  holenLoginShouldOpenReset,
  TAFEL_HOLEN_LOGIN_RESET,
  takeHolenOutcome,
  TAFEL_HOLEN_FAIL,
  TAFEL_HOLEN_FLAG,
  TAFEL_HOLEN_LOGIN_TOAST,
  TAFEL_HOLEN_TOAST,
  TAFEL_HOLEN_WAIT,
  TAFEL_HOLEN_WAIT_HREF,
  TAFEL_HOLEN_WAIT_ID,
  appHolenShouldWait,
  registerDeskExistingOf,
  registerDeskFormOn,
  registerDeskKicker,
  registerDeskTitle,
  DESK_REGISTER_KICKER,
  DESK_REGISTER_KICKER_DESK,
  DESK_REGISTER_KICKER_ID,
  DESK_REGISTER_TITLE,
  DESK_REGISTER_TITLE_DESK,
  DESK_REGISTER_TITLE_ID,
  holenAuthWaitIfPending,
  holenAuthWaitResult,
  TAFEL_HOLEN_WATCHDOG_MS,
  TAFEL_HOLEN_POLL_MS,
  DESK_BACKUP_TOO_LARGE,
  DESK_BACKUP_MAX_BYTES,
  HOLEN_BODY_OVERHEAD_BYTES,
  holenBodyTooLarge,
  holenPeekCookieOn,
  holenWaitVisible,
  peekTafelHolen,
  waitHolenPendingIdle,
  waitHolenPendingUntilIdle,
  holenWaitShouldLeave,
  TAFEL_HOLEN_WAIT_SLOW,
  TAFEL_HOLEN_WAIT_SLOW_ID,
  TAFEL_HOLEN_WAIT_FAIL_ID,
  TAFEL_HOLEN_WAIT_NEXT_ID,
  TAFEL_HOLEN_FAIL_ID,
  TAFEL_HOLEN_HEUTE_FAIL_ID,
  TAFEL_HOLEN_SETTINGS_FAIL_ID,
  TAFEL_HOLEN_SPRECHEN_FAIL_ID,
  DESK_REGISTER_EXISTS,
  DESK_REGISTER_EXISTS_ANZEIGE,
  DESK_REGISTER_EXISTS_ANZEIGE_LINE,
  DESK_REGISTER_EXISTS_ID,
  DESK_REGISTER_EXISTS_LINE,
  DESK_REGISTER_SCHON_ID,
  deskRegisterExistsLine,
  registerDeskSchonOn,
  DESK_LOGIN_REGISTER_ID,
  DESK_HOME_REGISTER_ID,
  DESK_HOME_LOGIN_ID,
  pgliteRegisterBlocked,
  tafelBackupBlockedWhileHolen,
  tafelBackupPendingLine,
  tafelBackupNoticeOf,
  TAFEL_BACKUP_HEUTE_PENDING_ID,
  TAFEL_BACKUP_SETTINGS_PENDING_ID,
  TAFEL_BACKUP_HEUTE_FAIL_ID,
  TAFEL_BACKUP_SETTINGS_FAIL_ID,
  TAFEL_BACKUP_FAIL,
  TAFEL_BACKUP_EMPTY,
  holenPeekFailOf,
  holenPeekPollOf,
  holenIdleFailOf,
  holenWaitFirstPaint,
  holenPendingShouldStay,
  holenStayAfterFail,
  holenImmediateFailOf,
  TAFEL_HOLEN_HTTP_FAIL,
} from "./desk-storage.ts";

test("PGLite shows the data dir so the Inhaberin can copy it", () => {
  const disk = deskStorage({ dbSource: "pglite", dataDir: "/ordi/.silvia-data" });
  assert.equal(disk.kind, "pglite");
  assert.equal(disk.path, "/ordi/.silvia-data");
  assert.equal(deskStorageCopyValue(disk), "/ordi/.silvia-data");
  assert.equal(deskStorageIsVolatile(disk), false);
});

test("memory flag is called out as wipe-on-restart", () => {
  const ram = deskStorage({ dbSource: "pglite", dataDir: undefined });
  assert.equal(ram.path, "memory");
  assert.equal(deskStorageIsVolatile(ram), true);
});

test("Postgres has no local folder to copy", () => {
  const pg = deskStorage({ dbSource: "neon", dataDir: "/ignored" });
  assert.equal(pg.kind, "postgres");
  assert.equal(deskStorageCopyValue(pg), "");
  assert.equal(deskStorageIsVolatile(pg), false);
});

test("Tafel-Daten tells the Kassa to run npm start, not HMR", () => {
  const disk = deskStorage({ dbSource: "pglite", dataDir: "/ordi/.silvia-data" });
  assert.match(deskDailyHostHint(disk), /npm start/);
  assert.match(deskDailyHostHint(disk), /HMR kann die Tafel sperren/);
  assert.match(deskDailyHostHint(disk), /git pull/);
  assert.match(deskDailyHostHint(disk), /Prozess beenden/);
  assert.match(deskDailyHostHint(disk), /Anzeige/);
  assert.match(deskDailyHostHint(disk), /wenn die Tafel schon offen ist/);
  assert.match(deskDailyHostHint(disk), /--anzeige/);
  assert.doesNotMatch(deskDailyHostHint(disk), /8081 wird Anzeige\./);
  assert.match(deskDailyHostHint(disk), /DATABASE_URL/);
  const pg = deskStorage({ dbSource: "neon", dataDir: "/ignored" });
  assert.match(deskDailyHostHint(pg), /npm start/);
  assert.match(deskDailyHostHint(pg), /git pull/);
  assert.match(deskDailyHostHint(pg), /Prozess beenden/);
  assert.doesNotMatch(deskDailyHostHint(pg), /sperren/);
});

test("desk restart hint only when the running stamp and source differ", () => {
  assert.equal(deskRestartHint({}), null);
  assert.equal(deskRestartHint({ running: "git:old" }), null);
  assert.equal(deskRestartHint({ current: "git:new" }), null);
  assert.equal(deskRestartHint({ running: "git:same", current: "git:same" }), null);
  assert.equal(deskRestartHint({ running: "  ", current: "git:new" }), null);
  const stale = deskRestartHint({ running: "git:old", current: "git:new" });
  assert.equal(stale?.title, DESK_RESTART_TITLE);
  assert.equal(stale?.body, DESK_RESTART_BODY);
  assert.match(stale?.body ?? "", /npm start/);
  assert.match(stale?.body ?? "", /Neustart/);
  assert.doesNotMatch(stale?.body ?? "", /migrations/);
  assert.equal(deskSourceStamp("abc1234\n"), "git:abc1234");
  assert.equal(deskSourceStamp("not-a-sha"), "");
});

test("PGLite can download a Tafel dump, Postgres cannot — nur die Inhaberin", () => {
  const pglite = deskStorage({ dbSource: "pglite", dataDir: "/ordi/.silvia-data" });
  // Punkt 17: Die vollstaendige Sicherung verlangt die Inhaberin-Rolle.
  assert.equal(deskBackupCanDownload(pglite, false, true), true);
  assert.equal(deskBackupCanDownload(deskStorage({ dbSource: "pglite", dataDir: undefined }), false, true), true);
  // Ohne ausdrueckliche Inhaberin-Rolle bleibt der Knopf aus.
  assert.equal(deskBackupCanDownload(pglite, false, false), false, "Tierarzthelferin darf nicht laden");
  assert.equal(deskBackupCanDownload(pglite), false, "ohne Angabe kein Download");
  assert.equal(deskBackupCanDownload(pglite, true, true), false, "Anzeige bleibt aussen vor");

  assert.equal(deskBackupCanDownload(deskStorage({ dbSource: "neon", dataDir: "/ignored" }), false, true), false);
  assert.equal(deskBackupCanDownload(null, false, true), false);

  assert.equal(deskBackupCanRestore(pglite, false, true), true);
  assert.equal(deskBackupCanRestore(pglite, false, false), false);
  assert.equal(deskBackupCanRestore(deskStorage({ dbSource: "neon", dataDir: "/ignored" }), false, true), false);
  assert.equal(deskBackupCanRestore(pglite, true, true), false);
});

test("backup file name is the Vienna calendar day", () => {
  assert.equal(deskBackupFileName(new Date("2026-08-26T22:30:00Z")), "silvia-tafel-2026-08-27.tar.gz");
  assert.equal(deskBackupFileName(new Date("2026-08-26T10:00:00Z")), "silvia-tafel-2026-08-26.tar.gz");
});

test("Tafel sichern GET attachment keeps the Vienna filename", () => {
  assert.equal(TAFEL_BACKUP_HREF, "/api/tafel-backup");
  assert.equal(TAFEL_BACKUP_AT_HEADER, "X-Tafel-Backup-At");
  assert.equal(
    deskBackupContentDisposition("silvia-tafel-2026-08-30.tar.gz"),
    'attachment; filename="silvia-tafel-2026-08-30.tar.gz"',
  );
  assert.equal(
    deskBackupFilenameFromDisposition('attachment; filename="silvia-tafel-2026-08-30.tar.gz"'),
    "silvia-tafel-2026-08-30.tar.gz",
  );
  assert.equal(
    deskBackupFilenameFromDisposition("attachment; filename=silvia-tafel-2026-08-30.tar.gz"),
    "silvia-tafel-2026-08-30.tar.gz",
  );
  assert.equal(deskBackupFilenameFromDisposition('attachment; filename="../../passwd.tar.gz"'), "");
  assert.equal(deskBackupFilenameFromDisposition('attachment; filename="notes.txt"'), "");
});

test("POST backup JSON error becomes a toast string", async () => {
  const res = await fetchTafelBackupDownload(
    "passwort-123",
    async () =>
      new Response(JSON.stringify({ error: "Zu viele Versuche. Bitte in etwa einer Minute noch einmal." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.equal(res.ok, false);
  if (res.ok) throw new Error("expected error");
  assert.match(res.error, /Zu viele Versuche/);
});

test("POST backup while holen pending stays a wait toast", async () => {
  const res = await fetchTafelBackupDownload(
    "passwort-123",
    async () =>
      new Response(JSON.stringify({ error: TAFEL_HOLEN_WAIT }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.equal(res.ok, false);
  if (res.ok) throw new Error("expected error");
  assert.equal(res.error, TAFEL_HOLEN_WAIT);
  assert.equal(tafelBackupPendingLine(res.error), TAFEL_HOLEN_WAIT);
  assert.deepEqual(tafelBackupNoticeOf(res.error, "settings"), {
    text: TAFEL_HOLEN_WAIT,
    id: TAFEL_BACKUP_SETTINGS_PENDING_ID,
  });
});

test("POST backup 500 stays a lasting fail line", async () => {
  const res = await fetchTafelBackupDownload(
    "passwort-123",
    async () =>
      new Response(JSON.stringify({ error: TAFEL_BACKUP_FAIL }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
  );
  assert.equal(res.ok, false);
  if (res.ok) throw new Error("expected error");
  assert.equal(res.error, TAFEL_BACKUP_FAIL);
  assert.equal(tafelBackupPendingLine(res.error), "");
  assert.deepEqual(tafelBackupNoticeOf(res.error, "heute"), {
    text: TAFEL_BACKUP_FAIL,
    id: TAFEL_BACKUP_HEUTE_FAIL_ID,
  });
  assert.deepEqual(tafelBackupNoticeOf(TAFEL_BACKUP_EMPTY, "settings"), {
    text: TAFEL_BACKUP_EMPTY,
    id: TAFEL_BACKUP_SETTINGS_FAIL_ID,
  });
});

test("Tafel holen multipart keeps confirm and the gzip file", async () => {
  assert.equal(TAFEL_HOLEN_HREF, "/api/tafel-holen");
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz", { type: "application/gzip" });
  const form = new FormData();
  form.set("file", file);
  form.set("confirm", "ERSETZEN");
  form.set("filename", file.name);
  const fields = holenFormFields(form);
  assert.equal(fields.confirm, "ERSETZEN");
  assert.equal(fields.filename, "silvia-tafel-2026-08-30.tar.gz");
  assert.equal(fields.file?.size, 40);
  assert.equal((await deskBackupFileCheck({ file, confirm: "ok" })).ok, false);
  assert.equal((await deskBackupFileCheck({ file, confirm: "ERSETZEN" })).ok, true);
  const text = new File([new TextEncoder().encode("not gzip")], "notes.txt", { type: "text/plain" });
  assert.equal((await deskBackupFileCheck({ file: text, confirm: "ERSETZEN" })).ok, false);
});

test("verschlüsselte Sicherung trägt die Endung .silvia und zählt als Tafel-Datei", () => {
  assert.equal(
    deskBackupEncryptedFileName(new Date("2026-08-26T22:30:00Z")),
    "silvia-tafel-2026-08-27.tar.gz.silvia",
  );
  assert.equal(
    deskBackupFilenameFromDisposition('attachment; filename="silvia-tafel-2026-08-30.tar.gz.silvia"'),
    "silvia-tafel-2026-08-30.tar.gz.silvia",
  );
  assert.equal(
    deskBackupStampFromFilename("silvia-tafel-2026-08-29.tar.gz.silvia"),
    new Date(2026, 7, 29, 12, 0, 0).toISOString(),
  );
});

test("deskBackupFileCheck verlangt für eine verschlüsselte Sicherung das Passwort", async () => {
  const magic = [0x53, 0x4c, 0x56, 0x42, 0x4b, 0x30, 0x31];
  const raw = new Uint8Array(40);
  raw.set(magic, 0);
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz.silvia", {
    type: "application/octet-stream",
  });
  assert.equal((await deskBackupFileCheck({ file, confirm: "ERSETZEN" })).ok, false);
  assert.equal(
    (await deskBackupFileCheck({ file, confirm: "ERSETZEN", passphrase: "kurz" })).ok,
    false,
    "zu kurzes Passwort",
  );
  assert.equal(
    (await deskBackupFileCheck({ file, confirm: "ERSETZEN", passphrase: "ausreichend-lang" })).ok,
    true,
  );
});

test("holen multipart überträgt das Passwort der Sicherung", async () => {
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz", { type: "application/gzip" });
  const form = new FormData();
  form.set("file", file);
  form.set("confirm", "ERSETZEN");
  form.set("passphrase", "geheim-passwort");
  assert.equal(holenFormFields(form).passphrase, "geheim-passwort");
  const res = await postTafelHolen(
    { file, confirm: "ERSETZEN", passphrase: "geheim-passwort" },
    async (_url, init) => {
      assert.ok(init?.body instanceof FormData);
      assert.equal((init.body as FormData).get("passphrase"), "geheim-passwort");
      return new Response(JSON.stringify({ ok: true, pending: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(res.ok, true);
});

test("POST holen JSON error becomes a toast string", async () => {
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz", { type: "application/gzip" });
  const res = await postTafelHolen({ file, confirm: "ERSETZEN" }, async (url, init) => {
    assert.equal(url, "/api/tafel-holen");
    assert.equal(init?.method, "POST");
    assert.ok(init?.body instanceof FormData);
    return new Response(JSON.stringify({ ok: false, error: "Nur die Inhaberin spielt eine Sicherung ein." }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(res.ok, false);
  if (res.ok) throw new Error("expected error");
  assert.match(res.error ?? "", /Inhaberin/);
  assert.equal(holenRestoreNext(res).action, "error");
  assert.equal(holenImmediateFailOf(res.error), "Nur die Inhaberin spielt eine Sicherung ein.");
});

test("POST holen 500 stays a lasting fail line", async () => {
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz", { type: "application/gzip" });
  const res = await postTafelHolen({ file, confirm: "ERSETZEN" }, async () => {
    return new Response(JSON.stringify({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(res.ok, false);
  if (res.ok) throw new Error("expected error");
  assert.equal(res.error, TAFEL_HOLEN_HTTP_FAIL);
  const next = holenRestoreNext(res);
  assert.equal(next.action, "error");
  if (next.action !== "error") throw new Error("expected error");
  const fileEl = { value: "silvia-tafel-2026-08-30.tar.gz" };
  const stay = holenStayAfterFail({ fail: next.error, fileEl });
  assert.equal(stay.fail, TAFEL_HOLEN_HTTP_FAIL);
  assert.equal(stay.fileOn, false);
  assert.equal(stay.confirm, "");
  assert.equal(fileEl.value, "");
});

test("client holen peeks gzip then POSTs the file", async () => {
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  const file = new File([raw], "silvia-tafel-2026-08-30.tar.gz", { type: "application/gzip" });
  const refused = await holenChosenTafel({ file, confirm: "nein" }, async () => {
    throw new Error("should not POST");
  });
  assert.equal(refused.ok, false);
  let posted = false;
  const ok = await holenChosenTafel({ file, confirm: "ERSETZEN" }, async (_url, init) => {
    posted = true;
    assert.ok(init?.body instanceof FormData);
    return new Response(JSON.stringify({ ok: true, pending: true, at: "2026-08-30T01:00:00.000Z" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(posted, true);
  assert.equal(ok.ok, true);
  if (!ok.ok) throw new Error("expected ok");
  assert.equal(ok.pending, true);
});

test("POST backup with passphrase becomes a downloadable encrypted blob", async () => {
  const raw = new Uint8Array(40);
  raw[0] = 0x1f;
  raw[1] = 0x8b;
  let method = "";
  let bodyJson: unknown = null;
  const res = await fetchTafelBackupDownload("geheim-passwort", async (_url, init) => {
    method = init?.method ?? "";
    bodyJson = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(raw, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="silvia-tafel-2026-08-30.tar.gz.silvia"',
        "x-tafel-backup-at": "2026-08-30T01:00:00.000Z",
      },
    });
  });
  assert.equal(method, "POST");
  assert.deepEqual(bodyJson, { passphrase: "geheim-passwort" });
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("expected blob");
  assert.equal(res.filename, "silvia-tafel-2026-08-30.tar.gz.silvia");
  assert.equal(res.at, "2026-08-30T01:00:00.000Z");
  assert.equal(res.blob.size, 40);
  assert.equal(res.mime, "application/octet-stream");
});

test("Tafel holen stamp prefers dump sidecar, then client ISO, then filename day", () => {
  assert.equal(deskBackupStampFromFilename("silvia-tafel-2026-08-29.tar.gz"), new Date(2026, 7, 29, 12, 0, 0).toISOString());
  assert.equal(
    deskBackupStampFromFilename("/stick/silvia-tafel-2026-08-27.tar.gz"),
    new Date(2026, 7, 27, 12, 0, 0).toISOString(),
  );
  assert.equal(deskBackupStampFromFilename("backup.tar.gz"), null);
  assert.equal(deskBackupStampFromFilename("silvia-tafel-2026-08-29.gz"), null);
  const now = new Date("2026-08-29T20:00:00.000Z");
  assert.equal(
    deskBackupStampAfterRestore({
      fromDump: "2026-08-28T10:00:00.000Z",
      backupAt: "2026-08-29T12:00:00.000Z",
      filename: "silvia-tafel-2026-08-27.tar.gz",
      now,
    }),
    "2026-08-28T10:00:00.000Z",
  );
  assert.equal(
    deskBackupStampAfterRestore({
      fromDump: "nope",
      backupAt: "2026-08-29T12:00:00.000Z",
      filename: "silvia-tafel-2026-08-27.tar.gz",
      now,
    }),
    "2026-08-29T12:00:00.000Z",
  );
  assert.equal(
    deskBackupStampAfterRestore({
      fromDump: null,
      backupAt: "",
      filename: "silvia-tafel-2026-08-27.tar.gz",
      now,
    }),
    new Date(2026, 7, 27, 12, 0, 0).toISOString(),
  );
  assert.equal(
    deskBackupStampAfterRestore({ fromDump: null, backupAt: null, filename: "notes.txt", now }),
    now.toISOString(),
  );
});

test("base64 dump becomes a gzip blob for the browser", async () => {
  const raw = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]);
  const b64 = deskBackupToBase64(raw);
  assert.deepEqual(deskBackupFromBase64(b64), raw);
  const blob = deskBackupBlob(b64, "application/gzip");
  assert.equal(blob.type, "application/gzip");
  assert.equal(blob.size, 4);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), raw);
});

test("restore requires ERSETZEN and a gzip dump", () => {
  const gzip = new Uint8Array(40);
  gzip[0] = 0x1f;
  gzip[1] = 0x8b;
  assert.equal(deskBackupRestoreCheck({ bytes: gzip, confirm: "ersetzen" }).ok, true);
  assert.equal(deskBackupRestoreCheck({ bytes: gzip, confirm: DESK_BACKUP_CONFIRM }).ok, true);
  assert.equal(deskBackupRestoreCheck({ bytes: gzip, confirm: "ok" }).ok, false);
  assert.equal(deskBackupRestoreCheck({ bytes: gzip }).ok, false);
  assert.equal(deskBackupRestoreCheck({ bytes: new Uint8Array([1, 2, 3]), confirm: "ERSETZEN" }).ok, false);
  const notGzip = new Uint8Array(40);
  assert.equal(deskBackupIsGzip(notGzip), false);
  assert.equal(deskBackupRestoreCheck({ bytes: notGzip, confirm: "ERSETZEN" }).ok, false);
});

test("Tafel backup reminder is due when never or older than a week, never on Postgres", () => {
  assert.equal(parseLastTafelBackup(""), null);
  assert.equal(parseLastTafelBackup("nope"), null);
  assert.equal(newerTafelBackupIso(null, "2026-08-29T10:00:00.000Z"), "2026-08-29T10:00:00.000Z");
  assert.equal(newerTafelBackupIso("2026-08-29T12:00:00.000Z", "2026-08-29T10:00:00.000Z"), "2026-08-29T12:00:00.000Z");
  assert.equal(newerTafelBackupIso("nope", ""), null);
  const iso = "2026-08-19T10:00:00.000Z";
  assert.equal(parseLastTafelBackup(iso), iso);
  const now = new Date("2026-08-26T12:00:00.000Z");
  assert.equal(tafelBackupIsDue(null, now), true);
  assert.equal(tafelBackupIsDue(iso, now), true);
  assert.equal(tafelBackupIsDue("2026-08-26T08:00:00.000Z", now), false);
  assert.equal(tafelBackupReminder({ kind: "postgres", lastIso: null, now }), null);
  const never = tafelBackupReminder({ kind: "pglite", lastIso: null, now });
  assert.equal(never?.title, "Tafel noch nicht gesichert.");
  assert.match(never?.body ?? "", /Desktop oder Stick/);
  assert.match(never?.body ?? "", /Tafel holen/);
  assert.equal(heuteTafelRestoreVisible({ pglite: true, inhaberin: true }), true);
  assert.equal(heuteTafelRestoreVisible({ pglite: true, inhaberin: false }), false);
  assert.equal(heuteTafelRestoreVisible({ pglite: false, inhaberin: true }), false);
  assert.equal(heuteTafelRestoreVisible({ pglite: true, inhaberin: true, anzeige: true }), false);
  assert.equal(heuteBackupCardVisible({ reminder: false, pglite: true, inhaberin: true }), true);
  assert.equal(heuteBackupCardVisible({ reminder: false, pglite: true, inhaberin: false }), true);
  assert.equal(heuteBackupCardVisible({ reminder: true, pglite: true, inhaberin: false }), true);
  assert.equal(heuteBackupCardVisible({ reminder: false, pglite: false, inhaberin: true }), false);
  assert.equal(heuteBackupDownloadVisible({ pglite: true, inhaberin: true }), true);
  assert.equal(heuteBackupDownloadVisible({ pglite: false, inhaberin: true }), false);
  assert.equal(heuteBackupDownloadVisible({ pglite: true, anzeige: true, inhaberin: true }), false);
  // Punkt 17: ohne Inhaberin-Rolle kein Download.
  assert.equal(heuteBackupDownloadVisible({ pglite: true, inhaberin: false }), false);
  assert.equal(heuteBackupDownloadVisible({ pglite: true }), false, "ohne Angabe kein Download");
  const keep = heuteBackupKeepCopy({ lastIso: "2026-08-26T10:00:00.000Z", inhaberin: false });
  assert.match(keep.title, /Zuletzt gesichert/);
  assert.match(keep.body, /Desktop oder Stick/);
  assert.doesNotMatch(keep.body, /ERSETZEN/);
  assert.match(heuteBackupKeepCopy({ lastIso: null, inhaberin: true }).body, /ERSETZEN/);
  const week = tafelBackupReminder({ kind: "pglite", lastIso: iso, now });
  assert.match(week?.title ?? "", /älter als eine Woche/);
  assert.equal(tafelBackupReminder({ kind: "pglite", lastIso: "2026-08-26T08:00:00.000Z", now }), null);
  assert.equal(lastTafelBackupLabel(null), "Noch nie gesichert.");
  assert.match(lastTafelBackupLabel("2026-08-26T10:00:00.000Z"), /Zuletzt gesichert/);
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
  };
  const written = writeLastTafelBackup(memory, new Date("2026-08-26T10:00:00.000Z"), "tafel-a");
  assert.equal(lastTafelBackupKey("tafel-a"), "silvia.last-tafel-backup.tafel-a");
  assert.equal(readLastTafelBackup(memory, "tafel-a"), written);
  assert.equal(readLastTafelBackup(memory, "tafel-b"), null);
  assert.equal(readLastTafelBackup(memory), null);
  assert.equal(writeLastTafelBackup(null), "");
  const appliedA = applyTafelBackupDownload(memory, new Date("2026-08-27T07:00:00.000Z"), "tafel-a");
  assert.equal(appliedA.reminder, null);
  assert.equal(readLastTafelBackup(memory, "tafel-a"), appliedA.iso);
  const dueB = applyTafelBackupDownload(null, new Date("2026-08-27T07:00:00.000Z"), "tafel-b");
  assert.deepEqual(dueB.reminder, {
    title: "Tafel noch nicht gesichert.",
    body: "Termine und Akten liegen nur auf diesem Rechner. Tafel sichern legt eine Datei auf den Desktop oder Stick. Tafel holen spielt die gzip-Datei vom anderen Rechner ein.",
  });
  assert.equal(tafelBackupReminder({ kind: "pglite", lastIso: readLastTafelBackup(memory, "tafel-b"), now: new Date("2026-08-27T07:00:00.000Z") })?.title, "Tafel noch nicht gesichert.");
});

test("Tafel holen watchdog reloads once and toasts after the reload", () => {
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  assert.equal(TAFEL_HOLEN_WATCHDOG_MS, 120_000);
  assert.equal(holenWatchdogShouldReload(0, TAFEL_HOLEN_WATCHDOG_MS - 1), false);
  assert.equal(holenWatchdogShouldReload(0, TAFEL_HOLEN_WATCHDOG_MS), true);
  const iso = writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.equal(store[TAFEL_HOLEN_FLAG], iso);
  assert.equal(takeHolenReloadToast(memory), TAFEL_HOLEN_TOAST);
  assert.equal(store[TAFEL_HOLEN_FLAG], undefined);
  assert.equal(takeHolenReloadToast(memory), null);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  clearHolenReloadFlag(memory);
  assert.equal(takeHolenReloadToast(memory), null);
  assert.equal(writeHolenReloadFlag(null), "");
});

test("Tafel holen rejects an oversized Content-Length before formData", () => {
  assert.equal(DESK_BACKUP_TOO_LARGE, "Die Datei ist zu groß.");
  assert.equal(holenBodyTooLarge(""), false);
  assert.equal(holenBodyTooLarge(undefined), false);
  assert.equal(holenBodyTooLarge(-1), false);
  assert.equal(holenBodyTooLarge(DESK_BACKUP_MAX_BYTES), false);
  assert.equal(holenBodyTooLarge(DESK_BACKUP_MAX_BYTES + HOLEN_BODY_OVERHEAD_BYTES), false);
  assert.equal(holenBodyTooLarge(DESK_BACKUP_MAX_BYTES + HOLEN_BODY_OVERHEAD_BYTES + 1), true);
  assert.equal(holenPeekCookieOn(null), false);
  assert.equal(holenPeekCookieOn(""), false);
  assert.equal(holenPeekCookieOn("other=1"), false);
  assert.equal(holenPeekCookieOn("silvia.session=abc"), true);
  assert.equal(holenPeekCookieOn("theme=dark; silvia.session=abc; x=1"), true);
  assert.equal(holenWaitVisible({ busy: false }), false);
  assert.equal(holenWaitVisible({ busy: true }), true);
  assert.equal(TAFEL_HOLEN_WAIT.includes("geholt"), true);
  assert.equal(TAFEL_HOLEN_WAIT_HREF, "/holen-warten");
  assert.equal(TAFEL_HOLEN_WAIT_ID, "desk-holen-wait");
  assert.equal(TAFEL_HOLEN_WAIT_SLOW.includes("länger"), true);
  assert.equal(TAFEL_HOLEN_WAIT_SLOW_ID, "desk-holen-wait-slow");
  assert.equal(TAFEL_HOLEN_WAIT_FAIL_ID, "desk-holen-wait-fail");
  assert.equal(TAFEL_HOLEN_WAIT_NEXT_ID, "desk-holen-wait-next");
  assert.equal(TAFEL_HOLEN_FAIL_ID, "desk-holen-fail");
  assert.equal(TAFEL_HOLEN_HEUTE_FAIL_ID, "heute-holen-fail");
  assert.equal(TAFEL_HOLEN_SETTINGS_FAIL_ID, "settings-holen-fail");
  assert.equal(TAFEL_HOLEN_SPRECHEN_FAIL_ID, "sprechen-holen-fail");
  assert.equal(TAFEL_HOLEN_HTTP_FAIL, "Wiederherstellen nicht möglich.");
  assert.equal(holenImmediateFailOf(""), TAFEL_HOLEN_HTTP_FAIL);
  assert.equal(holenImmediateFailOf(null), TAFEL_HOLEN_HTTP_FAIL);
  assert.equal(holenImmediateFailOf("Das ist keine Tafel-Sicherung (gzip)."), "Das ist keine Tafel-Sicherung (gzip).");
  assert.equal(holenImmediateFailOf(TAFEL_HOLEN_FAIL), TAFEL_HOLEN_FAIL);
  assert.equal(DESK_REGISTER_EXISTS_ID, "desk-register-tafel");
  assert.equal(DESK_LOGIN_REGISTER_ID, "desk-login-register");
  assert.equal(DESK_HOME_REGISTER_ID, "desk-home-register");
  assert.equal(DESK_HOME_LOGIN_ID, "desk-home-login");
  assert.equal(DESK_REGISTER_EXISTS.includes("schon eine Tafel"), true);
  assert.equal(DESK_REGISTER_EXISTS_ANZEIGE, "Die Tafel liegt auf dem Schreib-Rechner. Bitte anmelden.");
  assert.doesNotMatch(DESK_REGISTER_EXISTS_ANZEIGE, /diesem Rechner/);
  assert.equal(deskRegisterExistsLine(), DESK_REGISTER_EXISTS_LINE);
  assert.equal(deskRegisterExistsLine(false), DESK_REGISTER_EXISTS_LINE);
  assert.equal(deskRegisterExistsLine(true), DESK_REGISTER_EXISTS_ANZEIGE_LINE);
  assert.doesNotMatch(deskRegisterExistsLine(), /Bitte anmelden/);
  assert.doesNotMatch(deskRegisterExistsLine(true), /Bitte anmelden/);
  assert.equal(DESK_REGISTER_SCHON_ID, "desk-register-schon");
  assert.equal(registerDeskSchonOn({}), true);
  assert.equal(registerDeskSchonOn({ existing: false }), true);
  assert.equal(registerDeskSchonOn({ existing: true }), false);
  assert.equal(pgliteRegisterBlocked({ dbSource: "neon", practiceCount: 3 }), "");
  assert.equal(pgliteRegisterBlocked({ dbSource: "pglite", practiceCount: 0 }), "");
  assert.equal(pgliteRegisterBlocked({ dbSource: "pglite", practiceCount: 1 }), DESK_REGISTER_EXISTS);
  assert.equal(TAFEL_BACKUP_HEUTE_PENDING_ID, "heute-backup-pending");
  assert.equal(TAFEL_BACKUP_SETTINGS_PENDING_ID, "settings-backup-pending");
  assert.equal(TAFEL_BACKUP_HEUTE_FAIL_ID, "heute-backup-fail");
  assert.equal(TAFEL_BACKUP_SETTINGS_FAIL_ID, "settings-backup-fail");
  assert.equal(TAFEL_BACKUP_FAIL, "Sicherung nicht möglich.");
  assert.equal(TAFEL_BACKUP_EMPTY.includes("leer"), true);
  assert.equal(tafelBackupBlockedWhileHolen(false), "");
  assert.equal(tafelBackupBlockedWhileHolen(undefined), "");
  assert.equal(tafelBackupBlockedWhileHolen(true), TAFEL_HOLEN_WAIT);
  assert.equal(tafelBackupPendingLine(""), "");
  assert.equal(tafelBackupPendingLine(TAFEL_BACKUP_FAIL), "");
  assert.equal(tafelBackupPendingLine(TAFEL_HOLEN_WAIT), TAFEL_HOLEN_WAIT);
  assert.equal(tafelBackupNoticeOf(""), null);
  assert.equal(tafelBackupNoticeOf(null), null);
  assert.deepEqual(tafelBackupNoticeOf(TAFEL_HOLEN_WAIT, "heute"), {
    text: TAFEL_HOLEN_WAIT,
    id: TAFEL_BACKUP_HEUTE_PENDING_ID,
  });
  assert.deepEqual(tafelBackupNoticeOf(TAFEL_BACKUP_FAIL, "heute"), {
    text: TAFEL_BACKUP_FAIL,
    id: TAFEL_BACKUP_HEUTE_FAIL_ID,
  });
  assert.deepEqual(tafelBackupNoticeOf(TAFEL_BACKUP_EMPTY, "settings"), {
    text: TAFEL_BACKUP_EMPTY,
    id: TAFEL_BACKUP_SETTINGS_FAIL_ID,
  });
  assert.equal(holenIdleFailOf(null), "");
  assert.equal(holenIdleFailOf({ fail: TAFEL_HOLEN_FAIL }), TAFEL_HOLEN_FAIL);
  assert.deepEqual(holenWaitFirstPaint({ pending: true }), { kind: "wait", fail: "" });
  assert.deepEqual(holenWaitFirstPaint({ pending: true, fail: TAFEL_HOLEN_FAIL }), { kind: "wait", fail: "" });
  assert.deepEqual(holenWaitFirstPaint({ pending: false, fail: TAFEL_HOLEN_FAIL }), {
    kind: "fail",
    fail: TAFEL_HOLEN_FAIL,
  });
  assert.deepEqual(holenWaitFirstPaint({ pending: false, fail: "" }), { kind: "leave", fail: "" });
  assert.deepEqual(holenWaitFirstPaint(null), { kind: "leave", fail: "" });
  assert.equal(holenPendingShouldStay({ fail: "" }), false);
  assert.equal(holenPendingShouldStay({ fail: TAFEL_HOLEN_FAIL }), true);
  assert.equal(holenPeekFailOf(null), "");
  assert.equal(holenPeekFailOf({ pending: false }), "");
  assert.equal(holenPeekFailOf({ pending: false, fail: TAFEL_HOLEN_FAIL }), TAFEL_HOLEN_FAIL);
  assert.deepEqual(holenPeekPollOf({ ok: true, pending: true }, true), { pending: true, fail: "" });
  assert.deepEqual(holenPeekPollOf({ ok: true, pending: true, fail: TAFEL_HOLEN_FAIL }, true), {
    pending: true,
    fail: "",
  });
  assert.deepEqual(holenPeekPollOf({ ok: true, pending: false, fail: TAFEL_HOLEN_FAIL }, true), {
    pending: false,
    fail: TAFEL_HOLEN_FAIL,
  });
  assert.deepEqual(holenPeekPollOf({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }, false), {
    pending: false,
    fail: TAFEL_HOLEN_HTTP_FAIL,
  });
  assert.deepEqual(holenPeekPollOf(null, false), { pending: false, fail: TAFEL_HOLEN_HTTP_FAIL });
  assert.deepEqual(holenPeekPollOf({ ok: true, pending: false }, true), { pending: false, fail: "" });
  assert.deepEqual(holenWaitFirstPaint(holenPeekPollOf({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }, false)), {
    kind: "fail",
    fail: TAFEL_HOLEN_HTTP_FAIL,
  });
  assert.equal(holenWaitShouldLeave("idle"), true);
  assert.equal(holenWaitShouldLeave("timeout"), false);
  assert.equal(appHolenShouldWait(false), false);
  assert.equal(appHolenShouldWait(true), true);
  assert.equal(appHolenShouldWait(true, true), false);
  assert.equal(appHolenShouldWait(true, false), true);
  assert.equal(registerDeskExistingOf({ anzeige: true, pending: true, pglite: true, practiceCount: 1 }), true);
  assert.equal(registerDeskExistingOf({ anzeige: false, pending: true, pglite: true, practiceCount: 1 }), false);
  assert.equal(registerDeskExistingOf({ anzeige: false, pending: false, pglite: true, practiceCount: 1 }), true);
  assert.equal(registerDeskExistingOf({ anzeige: true, pending: true, pglite: false, practiceCount: 3 }), false);
  assert.equal(registerDeskFormOn({}), true);
  assert.equal(registerDeskFormOn({ existing: false, anzeige: false }), true);
  assert.equal(registerDeskFormOn({ existing: true }), false);
  assert.equal(registerDeskFormOn({ anzeige: true }), false);
  assert.equal(registerDeskFormOn({ existing: true, anzeige: true }), false);
  assert.equal(DESK_REGISTER_KICKER_ID, "desk-register-kicker");
  assert.equal(DESK_REGISTER_TITLE_ID, "desk-register-title");
  assert.equal(registerDeskKicker({}), DESK_REGISTER_KICKER);
  assert.equal(registerDeskKicker({ existing: true }), DESK_REGISTER_KICKER_DESK);
  assert.equal(registerDeskKicker({ anzeige: true }), DESK_REGISTER_KICKER_DESK);
  assert.equal(registerDeskTitle({}), DESK_REGISTER_TITLE);
  assert.equal(registerDeskTitle({ existing: true }), DESK_REGISTER_TITLE_DESK);
  assert.equal(registerDeskTitle({ anzeige: true }), DESK_REGISTER_TITLE_DESK);
  assert.equal(holenAuthWaitIfPending(false), null);
  assert.equal(holenAuthWaitIfPending(undefined), null);
  assert.deepEqual(holenAuthWaitIfPending(true), holenAuthWaitResult());
  assert.equal(holenAuthWaitResult().error, TAFEL_HOLEN_WAIT);
  assert.equal(holenAuthWaitResult().holen, true);
  assert.equal(holenAuthWaitResult().wait, true);
  assert.equal(TAFEL_HOLEN_POLL_MS, 1000);
});

test("Tafel holen GET peek waits until the sidecar is gone", async () => {
  let pending = true;
  let gets = 0;
  const peeked = await peekTafelHolen(async (url, init) => {
    assert.equal(url, TAFEL_HOLEN_HREF);
    assert.equal(init?.method, "GET");
    return new Response(JSON.stringify({ ok: true, pending: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(peeked.pending, true);
  assert.equal(peeked.fail, "");
  const failed = await peekTafelHolen(async () => {
    return new Response(
      JSON.stringify({ ok: false, pending: false, error: "Bitte neu anmelden.", fail: TAFEL_HOLEN_FAIL }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  });
  assert.equal(failed.pending, false);
  assert.equal(failed.fail, TAFEL_HOLEN_FAIL);
  const httpFail = await peekTafelHolen(async () => {
    return new Response(JSON.stringify({ ok: false, error: TAFEL_HOLEN_HTTP_FAIL }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  });
  assert.equal(httpFail.pending, false);
  assert.equal(httpFail.fail, TAFEL_HOLEN_HTTP_FAIL);
  const thrown = await peekTafelHolen(async () => {
    throw new Error("network down");
  });
  assert.equal(thrown.pending, false);
  assert.equal(thrown.fail, TAFEL_HOLEN_HTTP_FAIL);
  const idle = await waitHolenPendingIdle({
    peek: async () => {
      gets += 1;
      const on = pending;
      pending = false;
      return { pending: on };
    },
    sleep: async () => undefined,
    now: () => 0,
    startedAt: 0,
    maxMs: 5_000,
  });
  assert.equal(idle, "idle");
  assert.equal(gets, 2);
  const timed = await waitHolenPendingIdle({
    peek: async () => ({ pending: true }),
    sleep: async () => undefined,
    now: (() => {
      let t = 0;
      return () => {
        t += 60_000;
        return t;
      };
    })(),
    startedAt: 0,
    intervalMs: 1,
    maxMs: 120_000,
  });
  assert.equal(timed, "timeout");
  let rounds = 0;
  let slowNotes = 0;
  const until = await waitHolenPendingUntilIdle({
    peek: async () => {
      rounds += 1;
      return { pending: rounds < 3 };
    },
    sleep: async () => undefined,
    now: (() => {
      let t = 0;
      return () => {
        t += 60_000;
        return t;
      };
    })(),
    intervalMs: 1,
    maxMs: 120_000,
    onSlow: () => {
      slowNotes += 1;
    },
  });
  assert.equal(until.status, "idle");
  assert.equal(until.fail, "");
  assert.equal(rounds >= 3, true);
  assert.equal(slowNotes, 1);
  const failedUntil = await waitHolenPendingUntilIdle({
    peek: async () => ({ pending: false, fail: TAFEL_HOLEN_FAIL }),
    sleep: async () => undefined,
    now: () => 0,
  });
  assert.equal(failedUntil.status, "idle");
  assert.equal(failedUntil.fail, TAFEL_HOLEN_FAIL);
});

test("Tafel holen reload is not an error after HTTP already accepted", () => {
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  assert.deepEqual(holenRestoreNext(null), { action: "cancel" });
  assert.deepEqual(holenRestoreNext({ ok: false, error: "Nur die Inhaberin spielt eine Sicherung ein." }), {
    action: "error",
    error: "Nur die Inhaberin spielt eine Sicherung ein.",
  });
  assert.deepEqual(holenRestoreNext({ ok: true, login: true, at: "2026-08-29T21:00:00.000Z" }), {
    action: "login",
    at: "2026-08-29T21:00:00.000Z",
  });
  assert.deepEqual(holenRestoreNext({ ok: true, pending: true, at: "2026-08-29T21:00:00.000Z" }), {
    action: "reload",
    at: "2026-08-29T21:00:00.000Z",
    deferToast: true,
  });
  assert.deepEqual(holenRestoreNext({ ok: true, at: "2026-08-29T21:00:00.000Z" }), {
    action: "reload",
    at: "2026-08-29T21:00:00.000Z",
    deferToast: false,
  });
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  const fileEl = { value: "silvia-tafel-2026-08-29.tar.gz" };
  assert.deepEqual(holenStayAfterFail({ fail: TAFEL_HOLEN_FAIL, storage: memory, fileEl }), {
    fileOn: false,
    confirm: "",
    fail: TAFEL_HOLEN_FAIL,
  });
  assert.equal(fileEl.value, "");
  assert.equal(store[TAFEL_HOLEN_FLAG], undefined);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.deepEqual(takeHolenOutcome({ storage: memory, holenError: TAFEL_HOLEN_FAIL }), {
    kind: "error",
    text: TAFEL_HOLEN_FAIL,
  });
  assert.equal(store[TAFEL_HOLEN_FLAG], undefined);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.deepEqual(takeHolenOutcome({ storage: memory, holenError: null }), {
    kind: "ok",
    text: TAFEL_HOLEN_TOAST,
  });
  assert.equal(takeHolenOutcome({ storage: memory, holenError: null }), null);
  assert.equal(holenRestoreAbortIsBenign(new Error("The user aborted a request.")), true);
  assert.equal(holenRestoreAbortIsBenign(new Error("navigation")), true);
  assert.equal(holenRestoreAbortIsBenign(new Error("network down")), false);
  assert.equal(holenRestoreReady({ file: false, confirm: "ERSETZEN" }), false);
  assert.equal(holenRestoreReady({ file: true, confirm: "" }), false);
  assert.equal(holenRestoreReady({ file: true, confirm: "ersetzen" }), true);
  assert.equal(holenRestoreReady({ file: true, confirm: "ERSETZEN" }), true);
  assert.equal(holenFileInputOn({ files: { length: 1, 0: {} } as unknown as FileList }), true);
  assert.equal(holenFileInputOn({ files: { length: 0 } as unknown as FileList }), false);
  assert.equal(holenFileInputOn(null), false);
  assert.equal(HOLEN_RESTORE_NEED_BOTH.includes("ERSETZEN"), true);
});

test("Tafel holen of another practice lands on Anmelden with a notice", () => {
  const store: Record<string, string> = {};
  const memory = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };
  assert.equal(takeHolenLoginNotice(null), null);
  assert.equal(takeHolenLoginNotice({ storage: memory }), null);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.equal(takeHolenLoginNotice({ storage: memory }), TAFEL_HOLEN_LOGIN_TOAST);
  assert.equal(store[TAFEL_HOLEN_FLAG], undefined);
  assert.equal(takeHolenLoginNotice({ storage: memory }), null);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.equal(
    takeHolenLoginNotice({ storage: memory, email: "Dr@Ordination.example.com" }),
    "Tafel geholt. Bitte neu anmelden als dr@ordination.example.com.",
  );
  assert.equal(holenLoginNoticeText("a@b.c"), "Tafel geholt. Bitte neu anmelden als a@b.c.");
  assert.equal(holenLoginNoticeText(""), TAFEL_HOLEN_LOGIN_TOAST);
  assert.equal(holenLoginShouldOpenReset("a@b.c"), true);
  assert.equal(holenLoginShouldOpenReset(""), false);
  assert.equal(TAFEL_HOLEN_LOGIN_RESET.includes("Passwort vergessen"), true);
  writeHolenReloadFlag(memory, new Date("2026-08-29T21:00:00.000Z"));
  assert.deepEqual(takeHolenOutcome({ storage: memory, holenError: null }), {
    kind: "ok",
    text: TAFEL_HOLEN_TOAST,
  });
  assert.equal(TAFEL_HOLEN_LOGIN_TOAST.includes("neu anmelden"), true);
});

test("failed Tafel holen drops the gzip so ERSETZEN cannot replay it", () => {
  const fileEl = { value: "C:\\Stick\\silvia-tafel-2026-08-29.tar.gz" };
  assert.deepEqual(holenRestoreAbortChoice(fileEl), { fileOn: false, confirm: "" });
  assert.equal(fileEl.value, "");
  assert.deepEqual(holenRestoreAbortChoice(null), { fileOn: false, confirm: "" });
  assert.equal(holenRestoreReady({ file: false, confirm: "ERSETZEN" }), false);
});
