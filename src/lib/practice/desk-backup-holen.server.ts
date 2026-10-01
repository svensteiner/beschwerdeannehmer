import {
  deskBackupRestoreCheck,
  DESK_BACKUP_MAX_BYTES,
  DESK_BACKUP_TOO_LARGE,
  holenFormFields,
} from "./desk-storage";
import { backupCipherPassphraseOk, isEncryptedBackup } from "./backup-cipher";
import { decryptBackup } from "./backup-cipher.server";

export const DESK_HOLEN_PASSPHRASE_MISSING = "Bitte das Passwort der Sicherung angeben.";
export const DESK_HOLEN_PASSPHRASE_WRONG = "Das Passwort passt nicht zur Sicherung.";
/** Punkt 18: eine kaputte Datei ist kein falsches Passwort. */
export const DESK_HOLEN_CORRUPT = "Die Sicherung ist beschädigt oder keine gültige Sicherungsdatei.";

export type DeskHolenBuild =
  | { ok: true; login: false; pending?: true; practiceName?: string; at: string }
  | { ok: true; login: true; at: string }
  | { ok: false; error: string; status: number };

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

/** Inhaberin posts a gzip (Klartext oder verschlüsselt) from the Stick. */
export async function applyDeskHolen(input: {
  raw: Uint8Array;
  confirm: string;
  filename?: string;
  backupAt?: string;
  passphrase?: string;
}): Promise<DeskHolenBuild> {
  try {
    const { requirePractice, clientIp } = await import("./session.server");
    const session = await requirePractice();
    const { isInhaberin } = await import("./staff-role");
    if (!isInhaberin(session.role)) {
      return { ok: false, error: "Nur die Inhaberin spielt eine Sicherung ein.", status: 403 };
    }
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`desk-restore:${clientIp()}`, 4, 15 * 60 * 1000);
    if (limited) return { ok: false, error: limited, status: 429 };
    const { dbSource } = await import("@/lib/db.server");
    if (dbSource !== "pglite") {
      return {
        ok: false,
        error: "Wiederherstellen macht die Postgres-Datenbank, nicht dieser Rechner.",
        status: 400,
      };
    }
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false, error: blocked.error, status: 403 };

    // Runde 10 Punkt 18: eine verschlüsselte Sicherung wird hier entschlüsselt,
    // bevor der gzip-Check läuft. Klartext-Sicherungen bleiben unverändert.
    let payload = input.raw;
    if (isEncryptedBackup(payload)) {
      if (!backupCipherPassphraseOk(input.passphrase)) {
        return { ok: false, error: DESK_HOLEN_PASSPHRASE_MISSING, status: 400 };
      }
      const decrypted = await decryptBackup(payload, input.passphrase);
      if (!decrypted.ok) {
        return {
          ok: false,
          error: decrypted.reason === "wrong_password" ? DESK_HOLEN_PASSPHRASE_WRONG : DESK_HOLEN_CORRUPT,
          status: 400,
        };
      }
      payload = decrypted.data;
    }

    const check = deskBackupRestoreCheck({ bytes: payload, confirm: input.confirm });
    if (!check.ok) return { ok: false, error: check.error, status: 400 };

    const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
    const { deskBackupStampAfterRestore } = await import("./desk-storage");
    const dataDir = resolvePgliteDataDir();
    const at = deskBackupStampAfterRestore({
      backupAt: input.backupAt || null,
      filename: input.filename || null,
    });

    if (!dataDir) {
      const { replacePgliteFromDump } = await import("@/lib/db.server");
      try {
        await replacePgliteFromDump(new Blob([Buffer.from(payload)], { type: "application/gzip" }));
      } catch {
        return {
          ok: false,
          error: "Die Sicherung ließ sich nicht einspielen. Die bisherige Tafel bleibt.",
          status: 400,
        };
      }
      return restoreHolenAfterReplace({ email: session.email, at });
    }

    const { getCookie } = await import("@tanstack/react-start/server");
    const { hashToken } = await import("./crypto");
    const { SESSION_COOKIE } = await import("./session.server");
    const { writePendingHolen } = await import("@/lib/pglite-holen-pending");
    const token = getCookie(SESSION_COOKIE) ?? "";
    if (
      !writePendingHolen(dataDir, payload, {
        email: session.email,
        tokenHash: hashToken(token),
        at,
        filename: input.filename || undefined,
      })
    ) {
      return {
        ok: false,
        error: "Die Sicherung ließ sich nicht ablegen. Die bisherige Tafel bleibt.",
        status: 400,
      };
    }
    const { schedulePendingHolenApply } = await import("@/lib/db.server");
    schedulePendingHolenApply();
    return {
      ok: true,
      login: false,
      pending: true,
      practiceName: session.practiceName,
      at,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return { ok: false, error: "Bitte neu anmelden.", status: 401 };
    }
    const { TAFEL_HOLEN_HTTP_FAIL } = await import("./desk-storage");
    return { ok: false, error: TAFEL_HOLEN_HTTP_FAIL, status: 500 };
  }
}

export async function applyDeskHolenForm(form: FormData): Promise<DeskHolenBuild> {
  const fields = holenFormFields(form);
  if (fields.file && fields.file.size > DESK_BACKUP_MAX_BYTES) {
    return { ok: false, error: DESK_BACKUP_TOO_LARGE, status: 400 };
  }
  const raw = fields.file ? new Uint8Array(await fields.file.arrayBuffer()) : new Uint8Array();
  return applyDeskHolen({
    raw,
    confirm: fields.confirm,
    filename: fields.filename,
    backupAt: fields.backupAt,
    passphrase: fields.passphrase,
  });
}

export function deskHolenHttpResponse(built: DeskHolenBuild): Response {
  if (!built.ok) {
    return Response.json({ ok: false, error: built.error }, { status: built.status });
  }
  return Response.json(built);
}

export type DeskHolenPeek =
  | { ok: true; pending: boolean; fail?: string }
  | { ok: false; error: string; status: number; fail?: string };

/**
 * Cookie + sidecar only. Do not import `@/lib/db` or `session.server` —
 * `getSql()` would wait on `applyPendingHolenIfAny` and hang the wait line.
 */
export async function peekDeskHolenStatus(
  cookieOn: boolean,
  dataDir?: string | null,
): Promise<DeskHolenPeek> {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPeekStatus } = await import("@/lib/pglite-holen-pending");
  const dir = dataDir === undefined ? resolvePgliteDataDir() : dataDir;
  return holenPeekStatus(cookieOn, dir, isTafelAnzeige());
}

/** Sidecar only — `/app` and `/sprechen` must not call `getSql()` while apply runs. */
export async function peekDeskHolenPending(dataDir?: string | null): Promise<boolean> {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPendingIsOpen, holenPendingShouldWait } = await import("@/lib/pglite-holen-pending");
  const dir = dataDir === undefined ? resolvePgliteDataDir() : dataDir;
  return holenPendingShouldWait({ anzeige: isTafelAnzeige(), open: holenPendingIsOpen(dir) });
}

export function deskHolenPeekResponse(peek: DeskHolenPeek): Response {
  const fail = String(peek.fail ?? "").trim();
  if (!peek.ok) {
    return Response.json(
      { ok: false, error: peek.error, pending: false, fail },
      { status: peek.status },
    );
  }
  return Response.json({ ok: true, pending: peek.pending, fail });
}

async function restoreHolenAfterReplace(input: { email: string; at: string }) {
  const { getSql } = await import("@/lib/db.server");
  const { writeSessionCookie, clearSessionCookie } = await import("./session.server");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    practice_name: string;
  }>`
    select u.id, p.name as practice_name
    from practice_users u
    join practices p on p.id = u.practice_id
    where u.email = ${input.email}
    limit 1
  `;
  const user = rows[0];
  if (!user) {
    clearSessionCookie();
    return { ok: true as const, login: true as const, at: input.at };
  }
  const { newId, newSessionToken, hashToken } = await import("./crypto");
  const token = newSessionToken();
  await sql`
    insert into practice_sessions (id, user_id, token_hash, expires_at)
    values (
      ${newId()},
      ${user.id},
      ${hashToken(token)},
      ${new Date(Date.now() + SESSION_MS).toISOString()}
    )
  `;
  writeSessionCookie(token);
  return { ok: true as const, login: false as const, practiceName: user.practice_name, at: input.at };
}
