import { createServerFn } from "@tanstack/react-start";
import {
  DESK_RESET_FILE,
  DESK_RESET_MS,
  deskResetApplyCheck,
  deskResetCodeFromBytes,
  deskResetRefuseAnzeige,
  deskResetRequestCheck,
} from "./desk-reset";
import { holenAuthWaitIfPending } from "./desk-storage";

async function refuseIfHolenPending() {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPendingIsOpen, holenPendingShouldWait } = await import("@/lib/pglite-holen-pending");
  return holenAuthWaitIfPending(
    holenPendingShouldWait({
      anzeige: isTafelAnzeige(),
      open: holenPendingIsOpen(resolvePgliteDataDir()),
    }),
  );
}

export const requestDeskPasswordReset = createServerFn({ method: "POST" })
  .validator((input: { email?: string }) => ({ email: String(input?.email ?? "") }))
  .handler(async ({ data }) => {
    const check = deskResetRequestCheck(data.email);
    if (!check.ok) return check;
    const { clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`desk-reset-request:${clientIp()}`, 6, 60 * 60 * 1000);
    if (limited) return { ok: false as const, error: limited };
    const holenWait = await refuseIfHolenPending();
    if (holenWait) return holenWait;
    const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
    const anzeige = deskResetRefuseAnzeige(isTafelAnzeige());
    if (anzeige) return anzeige;
    const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
    const { join } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");
    const { randomBytes } = await import("node:crypto");
    const dir = resolvePgliteDataDir() ?? process.cwd();
    const path = join(dir, DESK_RESET_FILE);
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from practice_users where email = ${check.email} limit 1
    `;
    if (!rows[0]) {
      return { ok: true as const, path };
    }
    const code = deskResetCodeFromBytes(randomBytes(8));
    const { exp } = { exp: new Date(Date.now() + DESK_RESET_MS) };
    const { upsertDeskResetEntry } = await import("./desk-reset");
    const {
      readDeskResetFileAt,
      withDeskResetLock,
      writeDeskResetFileAt,
    } = await import("./desk-reset-file");
    await mkdir(dir, { recursive: true });
    // Punkt 10: Der eigene Block wird gesetzt oder ersetzt — die Bloecke
    // anderer Personen bleiben erhalten. Vorher ueberschrieb eine Anforderung
    // die ganze Datei und damit den Code einer anderen Person.
    // Punkt 11: Geschrieben wird atomar (Nebendatei + Umbenennen).
    try {
      await withDeskResetLock(async () => {
        const current = await readDeskResetFileAt(dir, DESK_RESET_FILE);
        // Punkt 10: Ein Zugriffsfehler ist kein leerer Bestand. Wuerde hier mit
        // "" weitergeschrieben, waeren die Codes der uebrigen Personen weg.
        if (!current.ok) throw new Error("unreadable");
        const next = upsertDeskResetEntry(current.raw ?? "", {
          email: check.email,
          code,
          exp: exp.getTime(),
        });
        await writeDeskResetFileAt(dir, DESK_RESET_FILE, next);
      });
    } catch {
      // Kein stiller Erfolg: der Code liegt NICHT auf dem Rechner.
      return { ok: false as const, error: "Der Code konnte nicht abgelegt werden. Bitte den Tafel-Ordner pruefen." };
    }
    return { ok: true as const, path };
  });

export const applyDeskPasswordReset = createServerFn({ method: "POST" })
  .validator((input: { email?: string; code?: string; password?: string; confirm?: string }) => ({
    email: String(input?.email ?? ""),
    code: String(input?.code ?? ""),
    password: String(input?.password ?? ""),
    confirm: String(input?.confirm ?? ""),
  }))
  .handler(async ({ data }) => {
    const check = deskResetApplyCheck(data);
    if (!check.ok) return check;
    const { clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`desk-reset-apply:${clientIp()}`, 8, 15 * 60 * 1000);
    if (limited) return { ok: false as const, error: limited };
    const holenWait = await refuseIfHolenPending();
    if (holenWait) return holenWait;
    const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
    const anzeige = deskResetRefuseAnzeige(isTafelAnzeige());
    if (anzeige) return anzeige;
    const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
    const {
      claimDeskResetFile,
      releaseDeskResetEntries,
      withDeskResetLock,
    } = await import("./desk-reset-file");
    const { deskResetEntryFor, settleDeskResetEntries } = await import("./desk-reset");
    const dir = resolvePgliteDataDir() ?? process.cwd();

    // Punkt 13: Der Riegel umschliesst den GESAMTEN Ablauf — Aneignung,
    // Pruefung, Datenbankschritt und Rueckschreiben. Umschliesst er nur einen
    // einzelnen Schreibweg, kann eine gleichzeitige Anforderung dazwischen
    // geraten und einen Block verlieren.
    return await withDeskResetLock(async () => {
    // Den Code durch Umbenennen ANEIGNEN (siehe desk-reset-file.ts). Zwei
    // gleichzeitige Anfragen konnten vorher beide dieselbe Datei lesen und
    // denselben Code einloesen; jetzt gewinnt genau eine.
    const claimed = await claimDeskResetFile(dir, DESK_RESET_FILE);
    if (!claimed.ok) {
      // Punkt 10: ein Zugriffsfehler ist kein leerer Bestand.
      return { ok: false as const, error: "Der Code liegt auf diesem Rechner, liess sich aber nicht lesen. Bitte den Tafel-Ordner pruefen." };
    }
    const claim = claimed.claim;
    if (!claim) {
      return { ok: false as const, error: "Kein Code auf diesem Rechner. Zuerst Code auf diesen Rechner legen." };
    }

    /**
     * Punkte 9/12 — Stand zurueckschreiben, ohne Daten zu verlieren.
     *
     * `removeEmail` laesst den Block DIESER Person weg (Code eingeloest); die
     * uebrigen Personen behalten ihren Code. Ein inzwischen neu angeforderter
     * Eintrag gewinnt: `settleDeskResetEntries` mischt nur Fehlendes ein und
     * ueberschreibt nichts Vorhandenes.
     *
     * Scheitert das Zurueckschreiben, BLEIBT die Rettungsdatei liegen. Sie ist
     * dann der einzige Ort mit noch gueltigen Codes.
     */
    const settle = async (removeEmail?: string) => {
      const result = await releaseDeskResetEntries(dir, DESK_RESET_FILE, claim, (current, claimedRaw) =>
        settleDeskResetEntries(current, claimedRaw, removeEmail),
      );
      if (!result.ok) {
        console.error(`[desk-reset] Stand nicht zurueckgeschrieben (${result.reason})`);
      }
    };
    /** Gleichbedeutend mit `settle()` ohne Entfernen: nichts einloesen. */
    const release = () => settle(undefined);

    // Punkt 10: Ab hier kann JEDER Schritt werfen — die Datenbankabfrage, die
    // Passwortberechnung, der Datenbankschreibvorgang. Vorher gab es dafuer
    // keinen geregelten Rueckweg: der Fehler schlug durch, und die erreichte
    // Aneignung blieb liegen.
    try {
    const found = deskResetEntryFor(claim.raw, check.email);
    if (found.ok === false && found.error === "missing") {
      await release();
      return { ok: false as const, error: "Die Datei ist unlesbar. Bitte den Code neu anfordern." };
    }
    if (found.ok === false) {
      // Abgelaufen: nur der eigene Block wird verbraucht, fremde bleiben.
      await settle(check.email);
      return { ok: false as const, error: "Der Code ist abgelaufen. Bitte neu anfordern." };
    }
    if (found.entry.code !== check.code) {
      // Falsche Eingabe verbraucht den Code nicht: die Person darf es erneut
      // versuchen, solange der Code läuft.
      await release();
      return { ok: false as const, error: "Code oder E-Mail stimmt nicht." };
    }
    const { getSql } = await import("@/lib/db.server");
    const { hashPasswordAsync } = await import("./crypto");
    const sql = await getSql();
    const user = await sql<{ id: string }>`
      select id from practice_users where email = ${check.email} limit 1
    `;
    if (!user[0]) {
      await release();
      return { ok: false as const, error: "Code oder E-Mail stimmt nicht." };
    }
    // Passwort und Sitzungswiderruf in EINEM Schritt (Migration 0028).
    const applied = await sql<{ ok: boolean }>`
      select set_practice_password(
        ${user[0].id},
        ${null}::text,
        ${await hashPasswordAsync(check.password)},
        ${null}::text
      ) as ok
    `;
    if (applied[0]?.ok !== true) {
      // Punkt 13: Das Passwort wurde NICHT gesetzt. Der Code wird zurueckgegeben,
      // damit die Person es erneut versuchen kann — statt ihn zu verbrauchen
      // und die Anmeldung ohne neuen Code zu lassen.
      await release();
      return { ok: false as const, error: "Das Passwort konnte nicht geändert werden." };
    }
    // Eingeloest: nur der eigene Block wird verbraucht, fremde bleiben gueltig.
    await settle(check.email);
    return { ok: true as const };
    } catch (err) {
      // Punkt 10: geregelter Rueckweg. Der Code wird zurueckgegeben, damit ein
      // erneuter Versuch moeglich ist, und der Nutzer bekommt eine
      // verstaendliche Meldung statt einer unbehandelten Ausnahme.
      const name = err instanceof Error && err.name ? err.name : "Error";
      console.error(`[desk-reset] Ablauf fehlgeschlagen (${name})`);
      await release();
      return {
        ok: false as const,
        error: "Das Passwort konnte nicht gesetzt werden. Bitte noch einmal versuchen.",
      };
    }
    });
  });
