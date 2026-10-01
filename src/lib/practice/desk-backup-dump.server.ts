import {
  deskBackupContentDisposition,
  deskBackupEncryptedFileName,
  tafelBackupBlockedWhileHolen,
  TAFEL_BACKUP_AT_HEADER,
  TAFEL_BACKUP_EMPTY,
  TAFEL_BACKUP_FAIL,
} from "./desk-storage";
import { backupCipherPassphraseOk } from "./backup-cipher";
import { encryptBackup } from "./backup-cipher.server";

export const DESK_BACKUP_PASSPHRASE_FAIL =
  "Bitte ein Passwort (mind. 8 Zeichen) für die verschlüsselte Sicherung wählen.";

export type DeskBackupBuild =
  | { ok: true; filename: string; mime: "application/octet-stream"; raw: Uint8Array; at: string }
  | { ok: false; error: string; status: number };

type BackupStamp = { previous: string | null; iso: string };

/**
 * If the final timestamp write fails, attempt to restore the former stamp
 * and refuse the attachment. This does not confirm receipt of a download;
 * restoring the stamp can also fail when storage remains unavailable.
 */
export function finalizeDeskBackupStamp(
  dataDir: string | undefined,
  stamped: BackupStamp,
  deps: {
    write: (dir: string | undefined, at: Date | string) => string;
    rollback: (dir: string | undefined, previous?: string | null) => void;
    now?: () => Date;
  },
) {
  try {
    return (
      deps.write(dataDir, stamped.iso || deps.now?.() || new Date()) ||
      stamped.iso ||
      deps.now?.().toISOString() ||
      new Date().toISOString()
    );
  } catch {
    try {
      deps.rollback(dataDir, stamped.previous);
    } catch {
      // Voller Datenträger kann auch die Rücknahme verhindern; der Download
      // bleibt trotzdem gesperrt. Der gespeicherte Stempel kann unklar bleiben.
    }
    return null;
  }
}

/** Dump the live PGLite Tafel, verschlüsselt mit AES-256-GCM (Passwort). */
export async function buildDeskBackup(passphrase?: string): Promise<DeskBackupBuild> {
  try {
    const { clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`desk-backup:${clientIp()}`, 4, 60_000);
    if (limited) return { ok: false, error: limited, status: 429 };
    const { dbSource, getPglite } = await import("@/lib/db.server");
    if (dbSource !== "pglite") {
      return {
        ok: false,
        error: "Sicherung macht die Postgres-Datenbank, nicht dieser Rechner.",
        status: 400,
      };
    }
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false, error: blocked.error, status: 403 };
    const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
    const { holenPendingIsOpen } = await import("@/lib/pglite-holen-pending");
    const dataDir = resolvePgliteDataDir();
    const pending = tafelBackupBlockedWhileHolen(holenPendingIsOpen(dataDir));
    if (pending) return { ok: false, error: pending, status: 409 };
    // Punkt 17: Ein vollstaendiger Datenexport enthaelt die ganze Tafel —
    // Patienten, Halterinnen, Kontakte, Protokolle. Dafuer genuegt nicht die
    // normale Anmeldung: die Inhaberin muss es ausdruecklich duerfen. Vorher
    // konnte jede angemeldete Kraft die Datenbank herunterladen.
    const { requirePractice } = await import("./session.server");
    const { isInhaberin } = await import("./staff-role");
    const session = await requirePractice();
    if (!isInhaberin(session.role)) {
      return {
        ok: false,
        error: "Die vollständige Sicherung darf nur die Inhaberin herunterladen.",
        status: 403,
      };
    }
    // Runde 10 Punkt 18: ohne Passwort keine verschlüsselte Sicherung. Vor dem
    // teuren Dump geprüft, damit ein leeres Feld nicht erst die Tafel exportiert.
    if (!backupCipherPassphraseOk(passphrase)) {
      return { ok: false, error: DESK_BACKUP_PASSPHRASE_FAIL, status: 400 };
    }
    const pg = await getPglite();
    const { getSql } = await import("@/lib/db.server");
    const { hoerLogPath, importLegacyHoerKorrekturen } = await import("@/lib/alma/hoer-log");
    await importLegacyHoerKorrekturen(await getSql(), hoerLogPath());
    const { dumpPgliteAfterCheckpoint } = await import("@/lib/pglite-copy-gate");
    const {
      markTafelBackupBeforeDump,
      rollbackTafelBackupStamp,
      writeLastTafelBackupFile,
    } = await import("@/lib/pglite-backup-stamp");
    const stamped = markTafelBackupBeforeDump(dataDir);
    let raw: Uint8Array;
    try {
      const dump = await dumpPgliteAfterCheckpoint(pg, dataDir);
      raw = new Uint8Array(await dump.arrayBuffer());
      if (raw.byteLength < 32) {
        rollbackTafelBackupStamp(dataDir, stamped.previous);
        return { ok: false, error: TAFEL_BACKUP_EMPTY, status: 400 };
      }
    } catch {
      rollbackTafelBackupStamp(dataDir, stamped.previous);
      return { ok: false, error: TAFEL_BACKUP_FAIL, status: 500 };
    }
    const at = finalizeDeskBackupStamp(dataDir, stamped, {
      write: writeLastTafelBackupFile,
      rollback: rollbackTafelBackupStamp,
    });
    if (!at) return { ok: false, error: TAFEL_BACKUP_FAIL, status: 500 };
    // Verschluesseln erst nach erfolgreichem Stempel — ein fehlgeschlagener
    // Export darf keine verschluesselte Datei ausliefern.
    const encrypted = await encryptBackup(raw, passphrase);
    const filename = deskBackupEncryptedFileName();
    // Punkt 19: zweite, redundante Speicherkopie der verschlüsselten Sicherung
    // außerhalb des Datenordners. Best-effort — die Kopie darf den Download
    // nicht blockieren, der Stempel dokumentiert den erfolgreichen Export.
    const { writeTafelBackupCopy } = await import("@/lib/pglite-backup-copy");
    writeTafelBackupCopy(dataDir, filename, encrypted);
    return {
      ok: true,
      filename,
      mime: "application/octet-stream",
      raw: encrypted,
      at,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return { ok: false, error: "Bitte neu anmelden.", status: 401 };
    }
    return { ok: false, error: TAFEL_BACKUP_FAIL, status: 500 };
  }
}

export function deskBackupHttpResponse(built: DeskBackupBuild): Response {
  if (!built.ok) {
    return Response.json({ error: built.error }, { status: built.status });
  }
  return new Response(Buffer.from(built.raw), {
    status: 200,
    headers: {
      "Content-Type": built.mime,
      "Content-Disposition": deskBackupContentDisposition(built.filename),
      [TAFEL_BACKUP_AT_HEADER]: built.at,
      "Cache-Control": "no-store",
    },
  });
}
