import { backupCipherPassphraseOk, isEncryptedBackup } from "./backup-cipher";

export type DeskStorage =
  | { kind: "pglite"; path: string }
  | { kind: "postgres"; path: "" };

export function deskStorage(input: { dbSource: "neon" | "pglite"; dataDir?: string }): DeskStorage {
  if (input.dbSource === "neon") return { kind: "postgres", path: "" };
  const path = String(input.dataDir ?? "").trim() || "memory";
  return { kind: "pglite", path };
}

export function deskStorageIsVolatile(storage: DeskStorage) {
  return storage.kind === "pglite" && storage.path === "memory";
}

export function deskStorageCopyValue(storage: DeskStorage) {
  return storage.kind === "pglite" ? storage.path : "";
}

export function deskBackupCanDownload(
  storage: DeskStorage | null | undefined,
  anzeige?: boolean,
  /**
   * Punkt 17: Die vollstaendige Sicherung darf nur die Inhaberin laden. Ohne
   * ausdrueckliche Angabe bleibt der Knopf aus — dann stimmt die Oberflaeche
   * mit der Pruefung am Server ueberein.
   */
  inhaberin?: boolean,
) {
  return storage?.kind === "pglite" && Boolean(inhaberin) && !anzeige;
}

export function deskBackupCanRestore(
  storage: DeskStorage | null | undefined,
  anzeige?: boolean,
  inhaberin?: boolean,
) {
  return deskBackupCanDownload(storage, anzeige, inhaberin);
}

export function deskBackupFileName(now = new Date()) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(now);
  return `silvia-tafel-${day}.tar.gz`;
}

/** Verschlüsselte Sicherung trägt die Endung `.tar.gz.silvia`. */
export function deskBackupEncryptedFileName(now = new Date()) {
  return `${deskBackupFileName(now)}.silvia`;
}

export const TAFEL_BACKUP_HREF = "/api/tafel-backup";
export const TAFEL_BACKUP_AT_HEADER = "X-Tafel-Backup-At";

const TAFEL_BACKUP_FILE_RE = /^silvia-tafel-\d{4}-\d{2}-\d{2}\.tar\.gz(?:\.silvia)?$/i;

export function deskBackupContentDisposition(filename: string) {
  const safe = String(filename ?? "").replace(/["\\]/g, "") || deskBackupFileName();
  return `attachment; filename="${safe}"`;
}

export function deskBackupFilenameFromDisposition(header: string) {
  const quoted = /filename="([^"]+)"/i.exec(header);
  const plain = /filename=([^;]+)/i.exec(header);
  const name = String(quoted?.[1] ?? plain?.[1] ?? "")
    .trim()
    .replace(/[/\\]/g, "");
  return TAFEL_BACKUP_FILE_RE.test(name) ? name : "";
}

/** Vienna calendar day in `silvia-tafel-YYYY-MM-DD.tar.gz` → noon local ISO. */
export function deskBackupStampFromFilename(name: string): string | null {
  const base = String(name ?? "")
    .trim()
    .split(/[/\\]/)
    .pop();
  const m = (base ?? "").match(/^silvia-tafel-(\d{4}-\d{2}-\d{2})\.tar\.gz(?:\.silvia)?$/i);
  if (!m) return null;
  const y = Number(m[1].slice(0, 4));
  const mo = Number(m[1].slice(5, 7));
  const d = Number(m[1].slice(8, 10));
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, 12, 0, 0).toISOString();
}

/** After Tafel holen: dump sidecar, then client ISO, then filename day, then now. */
export function deskBackupStampAfterRestore(input: {
  fromDump?: string | null;
  backupAt?: string | null;
  filename?: string | null;
  now?: Date;
}): string {
  const dump = parseLastTafelBackup(input.fromDump);
  if (dump) return dump;
  const at = parseLastTafelBackup(input.backupAt);
  if (at) return at;
  const fromName = input.filename ? deskBackupStampFromFilename(input.filename) : null;
  if (fromName) return fromName;
  return (input.now ?? new Date()).toISOString();
}

export const DESK_BACKUP_CONFIRM = "ERSETZEN";
export const DESK_BACKUP_MIN_BYTES = 32;
export const DESK_BACKUP_MAX_BYTES = 80 * 1024 * 1024;
export const DESK_BACKUP_TOO_LARGE = "Die Datei ist zu groß.";
/** Multipart fields sit on top of the gzip — reject the request before buffering. */
export const HOLEN_BODY_OVERHEAD_BYTES = 1024 * 1024;

export function holenBodyTooLarge(
  contentLength: unknown,
  max = DESK_BACKUP_MAX_BYTES + HOLEN_BODY_OVERHEAD_BYTES,
) {
  const n = Number.parseInt(String(contentLength ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return false;
  return n > max;
}

/** Cookie present is enough — GET peek must not call `getSql()` (holen apply). */
export function holenPeekCookieOn(cookieHeader: string | null | undefined) {
  return /(?:^|;\s*)silvia\.session=/i.test(String(cookieHeader ?? ""));
}

export function deskBackupIsGzip(bytes: Uint8Array | null | undefined) {
  return Boolean(bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

export function deskBackupToBase64(bytes: Uint8Array) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function deskBackupFromBase64(bytes: string) {
  const bin = atob(String(bytes ?? ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function deskBackupBlob(bytes: string, mime: string) {
  return new Blob([deskBackupFromBase64(bytes)], { type: mime || "application/gzip" });
}

export function deskBackupRestoreCheck(input: { bytes?: Uint8Array | null; confirm?: unknown }) {
  if (String(input.confirm ?? "").trim().toUpperCase() !== DESK_BACKUP_CONFIRM) {
    return { ok: false as const, error: "Zum Bestätigen ERSETZEN eintippen." };
  }
  const bytes = input.bytes;
  if (!bytes || bytes.byteLength < DESK_BACKUP_MIN_BYTES) {
    return { ok: false as const, error: "Bitte eine Sicherung wählen." };
  }
  if (bytes.byteLength > DESK_BACKUP_MAX_BYTES) {
    return { ok: false as const, error: DESK_BACKUP_TOO_LARGE };
  }
  if (!deskBackupIsGzip(bytes)) {
    return { ok: false as const, error: "Das ist keine Tafel-Sicherung (gzip)." };
  }
  return { ok: true as const };
}

export const TAFEL_HOLEN_HREF = "/api/tafel-holen";

export function holenFormFields(form: FormData) {
  const file = form.get("file");
  const blob = file instanceof Blob ? file : null;
  const fromFile = blob && "name" in blob ? String((blob as File).name ?? "") : "";
  return {
    file: blob,
    confirm: String(form.get("confirm") ?? ""),
    filename: String(form.get("filename") ?? fromFile)
      .trim()
      .slice(0, 240),
    backupAt: String(form.get("backupAt") ?? "").trim().slice(0, 40),
    passphrase: String(form.get("passphrase") ?? "").slice(0, 200),
  };
}

/**
 * Peek size and magic — do not read the whole dump in the browser. Eine
 * verschlüsselte Sicherung (`isEncryptedBackup`) verlangt das Passwort.
 */
export async function deskBackupFileCheck(input: {
  file?: Blob | null;
  confirm?: unknown;
  passphrase?: unknown;
}) {
  if (String(input.confirm ?? "").trim().toUpperCase() !== DESK_BACKUP_CONFIRM) {
    return { ok: false as const, error: "Zum Bestätigen ERSETZEN eintippen." };
  }
  const file = input.file;
  if (!file || file.size < DESK_BACKUP_MIN_BYTES) {
    return { ok: false as const, error: "Bitte eine Sicherung wählen." };
  }
  if (file.size > DESK_BACKUP_MAX_BYTES) {
    return { ok: false as const, error: DESK_BACKUP_TOO_LARGE };
  }
  const head = new Uint8Array(await file.slice(0, 7).arrayBuffer());
  if (deskBackupIsGzip(head)) {
    return { ok: true as const };
  }
  if (isEncryptedBackup(head)) {
    if (!backupCipherPassphraseOk(input.passphrase)) {
      return { ok: false as const, error: "Bitte das Passwort der Sicherung angeben." };
    }
    return { ok: true as const };
  }
  return { ok: false as const, error: "Das ist keine Tafel-Sicherung (gzip)." };
}

export async function postTafelHolen(
  input: { file: Blob; confirm: string; filename?: string; backupAt?: string; passphrase?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<HolenRestoreResult> {
  const body = new FormData();
  const filename =
    input.filename ||
    ("name" in input.file ? String((input.file as File).name ?? "") : "") ||
    deskBackupFileName();
  body.set("file", input.file, filename);
  body.set("confirm", input.confirm);
  body.set("filename", filename.slice(0, 240));
  if (input.passphrase) body.set("passphrase", input.passphrase);
  if (input.backupAt) body.set("backupAt", input.backupAt);
  const res = await fetchImpl(TAFEL_HOLEN_HREF, { method: "POST", credentials: "include", body });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return { ok: false, error: TAFEL_HOLEN_HTTP_FAIL };
  }
  if (parsed && typeof parsed === "object" && "ok" in parsed) {
    return parsed as HolenRestoreResult;
  }
  const error =
    parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error?: string }).error || "")
      : "";
  return { ok: false, error: error || TAFEL_HOLEN_HTTP_FAIL };
}

/** Client gzip peek, then multipart POST — no base64 JSON. */
export async function holenChosenTafel(
  input: { file: Blob; confirm: string; filename?: string; backupAt?: string; passphrase?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<HolenRestoreResult> {
  const check = await deskBackupFileCheck(input);
  if (!check.ok) return check;
  return postTafelHolen(input, fetchImpl);
}

/** Einstellungen Tafel-Daten: daily host is `npm start`, not HMR `npm run dev`. */
export function deskDailyHostHint(storage: DeskStorage) {
  if (storage.kind === "postgres") {
    return "Am Rechner den Tag über npm start — nicht npm run dev. Nach git pull den laufenden Prozess beenden, dann npm start — der Build kommt von selbst.";
  }
  return "Am Rechner den Tag über npm start — nicht npm run dev. HMR kann die Tafel sperren. Nach git pull den laufenden Prozess beenden, dann npm start — der Build kommt von selbst. Ein zweiter Start: npm start -- --port 8081 wird Anzeige, wenn die Tafel schon offen ist. Sonst --anzeige. Zwei Schreibplätze brauchen DATABASE_URL (Postgres).";
}

export const DESK_RESTART_TITLE = "Silvia-Stand ist veraltet.";
export const DESK_RESTART_BODY =
  "Nach git pull den Prozess beenden und npm start neu. Neue Felder und Code gelten erst nach dem Neustart — nicht nur im Browser.";

/** Banner when the running npm start process is older than the source on disk. */
export function deskRestartHint(input: { running?: string; current?: string }) {
  const running = String(input.running ?? "").trim();
  const current = String(input.current ?? "").trim();
  if (!running || !current || running === current) return null;
  return { title: DESK_RESTART_TITLE, body: DESK_RESTART_BODY };
}

export function deskSourceStamp(stdout: string) {
  const out = String(stdout ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(out) ? `git:${out}` : "";
}

export const TAFEL_HOLEN_FLAG = "silvia.tafel-geholt";
/** Persist restore can exceed 20s; Anzeige copy-busy waits the same two minutes. */
export const TAFEL_HOLEN_WATCHDOG_MS = 120_000;
export const TAFEL_HOLEN_POLL_MS = 1000;
export const TAFEL_HOLEN_TOAST = "Tafel geholt.";
export const TAFEL_HOLEN_WAIT = "Tafel wird geholt. Bitte warten…";
export const TAFEL_HOLEN_WAIT_HREF = "/holen-warten";
export const TAFEL_HOLEN_WAIT_ID = "desk-holen-wait";
export const TAFEL_HOLEN_WAIT_SLOW = "Tafel holen dauert länger als üblich. Bitte warten…";
export const TAFEL_HOLEN_WAIT_SLOW_ID = "desk-holen-wait-slow";
export const TAFEL_HOLEN_WAIT_FAIL_ID = "desk-holen-wait-fail";
export const TAFEL_HOLEN_WAIT_NEXT_ID = "desk-holen-wait-next";
export const TAFEL_HOLEN_FAIL_ID = "desk-holen-fail";
export const TAFEL_HOLEN_HEUTE_FAIL_ID = "heute-holen-fail";
export const TAFEL_HOLEN_SETTINGS_FAIL_ID = "settings-holen-fail";
export const TAFEL_HOLEN_SPRECHEN_FAIL_ID = "sprechen-holen-fail";
export const TAFEL_HOLEN_HTTP_FAIL = "Wiederherstellen nicht möglich.";
export const TAFEL_BACKUP_HEUTE_PENDING_ID = "heute-backup-pending";
export const TAFEL_BACKUP_SETTINGS_PENDING_ID = "settings-backup-pending";
export const TAFEL_BACKUP_HEUTE_FAIL_ID = "heute-backup-fail";
export const TAFEL_BACKUP_SETTINGS_FAIL_ID = "settings-backup-fail";
export const TAFEL_BACKUP_FAIL = "Sicherung nicht möglich.";
export const TAFEL_BACKUP_EMPTY = "Die Tafel ist leer — Sicherung nicht möglich.";
export const DESK_REGISTER_EXISTS_ID = "desk-register-tafel";
export const DESK_REGISTER_EXISTS =
  "Auf diesem Rechner liegt schon eine Tafel. Bitte anmelden.";
export const DESK_REGISTER_EXISTS_ANZEIGE =
  "Die Tafel liegt auf dem Schreib-Rechner. Bitte anmelden.";
export const DESK_REGISTER_EXISTS_LINE = "Auf diesem Rechner liegt schon eine Tafel.";
export const DESK_REGISTER_EXISTS_ANZEIGE_LINE = "Die Tafel liegt auf dem Schreib-Rechner.";
export const DESK_REGISTER_SCHON_ID = "desk-register-schon";

/** UI line next to the Anmelden link — toast keeps „Bitte anmelden.“ */
export function deskRegisterExistsLine(anzeige?: boolean) {
  return anzeige ? DESK_REGISTER_EXISTS_ANZEIGE_LINE : DESK_REGISTER_EXISTS_LINE;
}

/** Footer „Schon dabei?“ only while signup is still possible — existing already links Anmelden. */
export function registerDeskSchonOn(input: { existing?: boolean }) {
  return !input.existing;
}
export const DESK_LOGIN_REGISTER_ID = "desk-login-register";
export const DESK_HOME_REGISTER_ID = "desk-home-register";
export const DESK_HOME_LOGIN_ID = "desk-home-login";

/** Local PGLite is one Tafel per folder — a second signup would mix two Ordinationen. */
export function pgliteRegisterBlocked(input: { dbSource?: string; practiceCount?: number }) {
  if (input.dbSource !== "pglite") return "";
  return Number(input.practiceCount ?? 0) >= 1 ? DESK_REGISTER_EXISTS : "";
}

/** Dump only when holen is idle — never wait on apply and gzip the new Tafel. */
export function tafelBackupBlockedWhileHolen(pending?: boolean) {
  return pending ? TAFEL_HOLEN_WAIT : "";
}

export function tafelBackupPendingLine(error?: string | null) {
  return String(error ?? "").trim() === TAFEL_HOLEN_WAIT ? TAFEL_HOLEN_WAIT : "";
}

/** Heute / Einstellungen: pending wait line or a lasting dump error. */
export function tafelBackupNoticeOf(
  error?: string | null,
  where: "heute" | "settings" = "heute",
) {
  const text = String(error ?? "").trim();
  if (!text) return null;
  const pending = text === TAFEL_HOLEN_WAIT;
  return {
    text,
    id: pending
      ? where === "heute"
        ? TAFEL_BACKUP_HEUTE_PENDING_ID
        : TAFEL_BACKUP_SETTINGS_PENDING_ID
      : where === "heute"
        ? TAFEL_BACKUP_HEUTE_FAIL_ID
        : TAFEL_BACKUP_SETTINGS_FAIL_ID,
  };
}
export const TAFEL_HOLEN_LOGIN_TOAST = "Tafel geholt. Bitte neu anmelden.";

export function holenWaitVisible(input: { busy?: boolean }) {
  return Boolean(input.busy);
}

/** Sign-in / register / reset must not call `getSql()` while holen apply runs. */
export function holenAuthWaitResult() {
  return { ok: false as const, error: TAFEL_HOLEN_WAIT, wait: true as const, holen: true as const };
}

export function holenAuthWaitIfPending(open?: boolean) {
  return open ? holenAuthWaitResult() : null;
}

/** Reload during apply must not call `getSql()` — send them to the wait page. */
export function appHolenShouldWait(pending?: boolean, anzeige?: boolean) {
  return !anzeige && Boolean(pending);
}

/** Anzeige still has its copy — do not hide `#desk-register-tafel` while the writer holt. */
export function registerDeskExistingOf(input: {
  anzeige?: boolean;
  pending?: boolean;
  pglite?: boolean;
  practiceCount?: number;
}) {
  if (appHolenShouldWait(input.pending, input.anzeige)) return false;
  if (input.pglite === false) return false;
  return Number(input.practiceCount ?? 0) >= 1;
}

/** Full signup form only for a first PGLite Tafel on the writer. Existing or Anzeige: Anmelden. */
export function registerDeskFormOn(input: { existing?: boolean; anzeige?: boolean }) {
  return !input.existing && !input.anzeige;
}

export const DESK_REGISTER_KICKER_ID = "desk-register-kicker";
export const DESK_REGISTER_TITLE_ID = "desk-register-title";
export const DESK_REGISTER_KICKER = "Demo und Abnahme";
export const DESK_REGISTER_KICKER_DESK = "Ordination";
export const DESK_REGISTER_TITLE = "Ordination eröffnen";
export const DESK_REGISTER_TITLE_DESK = "Anmelden";

export function registerDeskKicker(input: { existing?: boolean; anzeige?: boolean }) {
  return registerDeskFormOn(input) ? DESK_REGISTER_KICKER : DESK_REGISTER_KICKER_DESK;
}

export function registerDeskTitle(input: { existing?: boolean; anzeige?: boolean }) {
  return registerDeskFormOn(input) ? DESK_REGISTER_TITLE : DESK_REGISTER_TITLE_DESK;
}

/** Sidecar only — must not import `@/lib/db` (getSql applies the dump). */
export function holenPeekFailOf(parsed: unknown) {
  if (!parsed || typeof parsed !== "object" || !("fail" in parsed)) return "";
  return String((parsed as { fail?: unknown }).fail ?? "").trim();
}

/** Poll / first paint: HTTP 500 must not look like idle success. Pending wins. */
export function holenPeekPollOf(parsed: unknown, resOk = true) {
  const pending = Boolean(
    parsed && typeof parsed === "object" && "pending" in parsed
      ? (parsed as { pending?: unknown }).pending
      : false,
  );
  if (pending) return { pending: true, fail: "" };
  const fromFail = holenPeekFailOf(parsed);
  if (fromFail) return { pending: false, fail: fromFail };
  const fromError =
    parsed && typeof parsed === "object" && "error" in parsed
      ? String((parsed as { error?: unknown }).error ?? "").trim()
      : "";
  if (fromError) return { pending: false, fail: fromError };
  if (!resOk) return { pending: false, fail: TAFEL_HOLEN_HTTP_FAIL };
  return { pending: false, fail: "" };
}

export async function peekTafelHolen(
  fetchImpl: typeof fetch = fetch,
): Promise<{ pending: boolean; fail: string }> {
  try {
    const res = await fetchImpl(TAFEL_HOLEN_HREF, { method: "GET", credentials: "include" });
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { pending: false, fail: res.ok ? "" : TAFEL_HOLEN_HTTP_FAIL };
    }
    return holenPeekPollOf(parsed, res.ok);
  } catch {
    return { pending: false, fail: TAFEL_HOLEN_HTTP_FAIL };
  }
}

/** After pending POST: stay on the page until the sidecar is gone, then reload. */
export async function waitHolenPendingIdle(input?: {
  peek?: () => Promise<{ pending: boolean; fail?: string }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  startedAt?: number;
  intervalMs?: number;
  maxMs?: number;
}): Promise<"idle" | "timeout"> {
  const peek = input?.peek ?? (() => peekTafelHolen());
  const sleep = input?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input?.now ?? Date.now;
  const started = input?.startedAt ?? now();
  const interval = input?.intervalMs ?? TAFEL_HOLEN_POLL_MS;
  const max = input?.maxMs ?? TAFEL_HOLEN_WATCHDOG_MS;
  for (;;) {
    const status = await peek();
    if (!status.pending) return "idle";
    if (now() - started >= max) return "timeout";
    await sleep(interval);
  }
}

export function holenWaitShouldLeave(status: "idle" | "timeout") {
  return status === "idle";
}

export function holenIdleFailOf(result?: { fail?: string | null } | null) {
  return String(result?.fail ?? "").trim();
}

/** First paint of /holen-warten — fail sidecar must not flash the wait line. */
export function holenWaitFirstPaint(input?: { pending?: boolean; fail?: string | null } | null) {
  const fail = holenIdleFailOf(input);
  if (input?.pending) return { kind: "wait" as const, fail: "" };
  if (fail) return { kind: "fail" as const, fail };
  return { kind: "leave" as const, fail: "" };
}

/** Pending POST finished with a fail sidecar — stay, do not reload as success. */
export function holenPendingShouldStay(result?: { fail?: string } | null) {
  return Boolean(holenIdleFailOf(result));
}

/** Keep peeking after the watchdog — leaving /holen-warten while pending loops or hangs. */
export async function waitHolenPendingUntilIdle(input?: {
  peek?: () => Promise<{ pending: boolean; fail?: string }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  maxMs?: number;
  onSlow?: () => void;
}): Promise<{ status: "idle"; fail: string }> {
  let noted = false;
  const peek = input?.peek ?? (() => peekTafelHolen());
  for (;;) {
    const status = await waitHolenPendingIdle({
      peek,
      sleep: input?.sleep,
      now: input?.now,
      intervalMs: input?.intervalMs,
      maxMs: input?.maxMs,
    });
    if (holenWaitShouldLeave(status)) {
      const last = await peek();
      return { status: "idle", fail: holenIdleFailOf(last) };
    }
    if (!noted) {
      noted = true;
      input?.onSlow?.();
    }
  }
}

export function holenLoginNoticeText(email?: string | null) {
  const hint = String(email ?? "")
    .trim()
    .toLowerCase();
  if (hint.includes("@")) return `Tafel geholt. Bitte neu anmelden als ${hint}.`;
  return TAFEL_HOLEN_LOGIN_TOAST;
}

export const TAFEL_HOLEN_LOGIN_RESET =
  "Kein Passwort der Sicherung? Passwort vergessen legt einen Code auf diesen Rechner.";

export function holenLoginShouldOpenReset(email?: string | null) {
  return String(email ?? "")
    .trim()
    .includes("@");
}
export const TAFEL_HOLEN_FAIL = "Die Sicherung ließ sich nicht einspielen. Die bisherige Tafel bleibt.";

export function writeHolenReloadFlag(
  storage: Pick<Storage, "setItem"> | null,
  at = new Date(),
) {
  if (!storage) return "";
  const iso = at.toISOString();
  storage.setItem(TAFEL_HOLEN_FLAG, iso);
  return iso;
}

export function clearHolenReloadFlag(storage?: Pick<Storage, "removeItem"> | null) {
  if (!storage) return;
  try {
    storage.removeItem(TAFEL_HOLEN_FLAG);
  } catch {
    /* private mode */
  }
}

/** After a watchdog reload: one toast, then drop the flag. */
export function takeHolenReloadToast(storage?: (Pick<Storage, "getItem"> & Pick<Storage, "removeItem">) | null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(TAFEL_HOLEN_FLAG);
    storage.removeItem(TAFEL_HOLEN_FLAG);
    return parseLastTafelBackup(raw) ? TAFEL_HOLEN_TOAST : null;
  } catch {
    return null;
  }
}

/** Holen of another practice's dump lands on /login — consume the flag there. */
export function takeHolenLoginNotice(input?: {
  storage?: (Pick<Storage, "getItem"> & Pick<Storage, "removeItem">) | null;
  email?: string | null;
} | null) {
  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  const hint = email.includes("@") ? email : "";
  if (!input?.storage) return hint ? holenLoginNoticeText(hint) : null;
  try {
    const raw = input.storage.getItem(TAFEL_HOLEN_FLAG);
    input.storage.removeItem(TAFEL_HOLEN_FLAG);
    if (parseLastTafelBackup(raw) || hint) return holenLoginNoticeText(hint || null);
    return null;
  } catch {
    return hint ? holenLoginNoticeText(hint) : null;
  }
}

/** After apply: fail sidecar wins over the browser flag. */
export function takeHolenOutcome(input: {
  storage?: (Pick<Storage, "getItem"> & Pick<Storage, "removeItem">) | null;
  holenError?: string | null;
}) {
  const error = String(input.holenError ?? "").trim();
  const flagged = takeHolenReloadToast(input.storage);
  if (error) return { kind: "error" as const, text: error };
  if (flagged) return { kind: "ok" as const, text: flagged };
  return null;
}

export function holenWatchdogShouldReload(
  startedAt: number,
  now = Date.now(),
  maxMs = TAFEL_HOLEN_WATCHDOG_MS,
) {
  return now - startedAt >= maxMs;
}

export type HolenRestoreResult =
  | { ok: false; error?: string }
  | { ok: true; pending?: boolean; login?: boolean; at?: string };

/** After Tafel holen HTTP: stay, login, or reload — never treat reload-abort as failure. */
export function holenRestoreNext(res: HolenRestoreResult | null | undefined) {
  if (!res) return { action: "cancel" as const };
  if (!res.ok) return { action: "error" as const, error: holenImmediateFailOf(res.error) };
  if (res.login) return { action: "login" as const, at: res.at };
  return { action: "reload" as const, at: res.at, deferToast: Boolean(res.pending) };
}

export function holenRestoreAbortIsBenign(err: unknown) {
  const msg = String(err instanceof Error ? err.message : err ?? "");
  return /abort|navigat|reload/i.test(msg);
}

/** Tafel holen stays off until a gzip is chosen and ERSETZEN is typed. */
export function holenRestoreReady(input: { file?: boolean; confirm?: string }) {
  return Boolean(input.file) && String(input.confirm ?? "").trim().toUpperCase() === DESK_BACKUP_CONFIRM;
}

/** The file input is source of truth — Playwright and OS pickers can skip React onChange. */
export function holenFileInputOn(el?: { files?: FileList | null } | null) {
  return Boolean(el?.files?.[0]);
}

/** After a refused holen: drop the gzip so ERSETZEN cannot replay it. */
export function holenRestoreAbortChoice(fileEl?: { value: string } | null) {
  if (fileEl) fileEl.value = "";
  return { fileOn: false, confirm: "" };
}

/** Immediate POST/peek error stays on Heute / Einstellungen — not only a toast. */
export function holenImmediateFailOf(error?: string | null) {
  const text = String(error ?? "").trim();
  return text || TAFEL_HOLEN_HTTP_FAIL;
}

/** After pending apply fail: drop the flag and the gzip, keep the fail line. */
export function holenStayAfterFail(input: {
  fail?: string | null;
  storage?: Pick<Storage, "removeItem"> | null;
  fileEl?: { value: string } | null;
}) {
  clearHolenReloadFlag(input.storage);
  return {
    ...holenRestoreAbortChoice(input.fileEl),
    fail: holenImmediateFailOf(input.fail),
  };
}

export const HOLEN_RESTORE_NEED_BOTH = "Bitte eine Sicherung wählen und ERSETZEN eintippen.";

export const LAST_TAFEL_BACKUP_KEY = "silvia.last-tafel-backup";
export const LAST_TAFEL_BACKUP_FILE = "silvia.last-tafel-backup";
export const TAFEL_BACKUP_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** One reminder per Tafel on this Rechner — not shared across logins. */
export function lastTafelBackupKey(practiceId?: string | null) {
  const id = String(practiceId ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
  return id ? `${LAST_TAFEL_BACKUP_KEY}.${id}` : LAST_TAFEL_BACKUP_KEY;
}

export function parseLastTafelBackup(raw: unknown): string | null {
  const iso = String(raw ?? "").trim();
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}

/** Prefer the later of browser and Tafel-file stamps. */
export function newerTafelBackupIso(a: string | null | undefined, b: string | null | undefined) {
  const left = parseLastTafelBackup(a);
  const right = parseLastTafelBackup(b);
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function readLastTafelBackup(
  storage?: Pick<Storage, "getItem"> | null,
  practiceId?: string | null,
): string | null {
  if (!storage) return null;
  try {
    return parseLastTafelBackup(storage.getItem(lastTafelBackupKey(practiceId)));
  } catch {
    return null;
  }
}

export function writeLastTafelBackup(
  storage: Pick<Storage, "setItem"> | null,
  at = new Date(),
  practiceId?: string | null,
) {
  if (!storage) return "";
  const iso = at.toISOString();
  storage.setItem(lastTafelBackupKey(practiceId), iso);
  return iso;
}

/** After a dump download: remember the time so Heute can drop the reminder. */
export function applyTafelBackupDownload(
  store: (Pick<Storage, "getItem"> & Pick<Storage, "setItem">) | null,
  at = new Date(),
  practiceId?: string | null,
) {
  const iso = writeLastTafelBackup(store, at, practiceId);
  return {
    iso,
    reminder: tafelBackupReminder({ kind: "pglite", lastIso: iso || null, now: at }),
  };
}

/** Browser: turn the server dump into a file on Desktop/Stick. */
export function downloadTafelBackupBlob(res: { bytes: string; mime: string; filename: string }) {
  const url = URL.createObjectURL(deskBackupBlob(res.bytes, res.mime));
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTafelBackupFile(res: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(res.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchTafelBackupDownload(
  passphrase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { ok: true; filename: string; mime: string; blob: Blob; at: string } | { ok: false; error: string }
> {
  const res = await fetchImpl(TAFEL_BACKUP_HREF, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.includes("application/json")) {
    let error = TAFEL_BACKUP_FAIL;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) error = String(body.error);
    } catch {
      /* keep default */
    }
    return { ok: false, error };
  }
  const blob = await res.blob();
  if (blob.size < DESK_BACKUP_MIN_BYTES) {
    return { ok: false, error: TAFEL_BACKUP_EMPTY };
  }
  const filename =
    deskBackupFilenameFromDisposition(res.headers.get("content-disposition") ?? "") ||
    deskBackupEncryptedFileName();
  const at = res.headers.get(TAFEL_BACKUP_AT_HEADER) ?? res.headers.get("x-tafel-backup-at") ?? "";
  return {
    ok: true,
    filename,
    mime: type.split(";")[0]?.trim() || "application/octet-stream",
    blob,
    at,
  };
}

/** POST passphrase to /api/tafel-backup, save the encrypted file, stamp this browser. */
export async function saveTafelBackupDownload(
  store: (Pick<Storage, "getItem"> & Pick<Storage, "setItem">) | null,
  practiceId: string | null | undefined,
  passphrase: string,
  fetchImpl: typeof fetch = fetch,
) {
  const res = await fetchTafelBackupDownload(passphrase, fetchImpl);
  if (!res.ok) return res;
  downloadTafelBackupFile(res);
  const next = applyTafelBackupDownload(store, res.at ? new Date(res.at) : new Date(), practiceId);
  return { ok: true as const, iso: next.iso, reminder: next.reminder };
}

export function lastTafelBackupLabel(iso: string | null) {
  if (!iso) return "Noch nie gesichert.";
  const at = new Date(iso);
  const day = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    weekday: "long",
    day: "numeric",
    month: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  return `Zuletzt gesichert: ${day} um ${time}.`;
}

export function tafelBackupIsDue(
  iso: string | null,
  now = new Date(),
  maxAgeMs = TAFEL_BACKUP_REMIND_AFTER_MS,
) {
  if (!iso) return true;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at >= maxAgeMs;
}

export function tafelBackupReminder(input: {
  kind?: "pglite" | "postgres" | null;
  lastIso: string | null;
  now?: Date;
}) {
  if (input.kind !== "pglite") return null;
  if (!tafelBackupIsDue(input.lastIso, input.now)) return null;
  if (!input.lastIso) {
    return {
      title: "Tafel noch nicht gesichert.",
      body: "Termine und Akten liegen nur auf diesem Rechner. Tafel sichern legt eine Datei auf den Desktop oder Stick. Tafel holen spielt die gzip-Datei vom anderen Rechner ein.",
    };
  }
  return {
    title: "Tafel-Sicherung ist älter als eine Woche.",
    body: `${lastTafelBackupLabel(input.lastIso)} Bitte erneut Tafel sichern.`,
  };
}

/** Inhaberin can holen a dump on Heute even after this browser already downloaded one. Not on Anzeige. */
export function heuteTafelRestoreVisible(input: {
  pglite?: boolean;
  inhaberin?: boolean;
  anzeige?: boolean;
}) {
  return Boolean(input.pglite) && Boolean(input.inhaberin) && !input.anzeige;
}

/** Kassa and Inhaberin can Tafel sichern on Heute every day — not only when the week reminder is due. Not on Anzeige. */
/**
 * Punkt 17: Die vollstaendige Sicherung enthaelt die ganze Tafel — Patienten,
 * Halterinnen, Kontakte, Protokolle. Der Knopf erscheint deshalb nur fuer die
 * Inhaberin, passend zur Pruefung am Server.
 */
export function heuteBackupDownloadVisible(input: {
  pglite?: boolean;
  anzeige?: boolean;
  inhaberin?: boolean;
}) {
  return Boolean(input.pglite) && Boolean(input.inhaberin) && !input.anzeige;
}

export function heuteBackupKeepCopy(input: { lastIso?: string | null; inhaberin?: boolean }) {
  return {
    title: lastTafelBackupLabel(input.lastIso ?? null),
    body: input.inhaberin
      ? "Tafel sichern legt eine Datei auf den Desktop oder Stick. gzip und ERSETZEN holt die Tafel vom anderen Rechner."
      : "Tafel sichern legt eine Datei auf den Desktop oder Stick.",
  };
}

export function heuteBackupCardVisible(input: {
  reminder: boolean;
  pglite?: boolean;
  inhaberin?: boolean;
}) {
  return Boolean(input.pglite) || input.reminder || heuteTafelRestoreVisible(input);
}
