import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Dateizugriff fuer die Ruecksetzcodes im Tafel-Ordner.
 *
 * Die Regeln, die hier gelten:
 *
 *   - Punkt 10: „Datei fehlt“ und „Datei nicht lesbar“ sind VERSCHIEDEN. Ein
 *     Zugriffsfehler darf nicht wie ein leerer Bestand wirken — sonst wuerde
 *     eine neue Anforderung die Codes der uebrigen Personen ueberschreiben.
 *   - Punkt 11: Auch ein fehlgeschlagenes `writeFile` wird aufgeraeumt. Vorher
 *     lag es ausserhalb der Fehlerbehandlung und eine halbe Nebendatei blieb.
 *   - Punkt 9/12: Die Nebendatei der Aneignung ist eine RETTUNGSDATEI. Sie wird
 *     nur geloescht, wenn der Stand nachweislich zurueckgeschrieben wurde. Sonst
 *     bliebe sie der einzige Ort, an dem noch gueltige Codes stehen.
 *   - Punkt 13: `withDeskResetLock` umschliesst den GESAMTEN Ablauf aus
 *     Aneignung, Pruefung und Rueckschreiben — nicht nur einzelne Schreibwege.
 */

/** Ein beanspruchter Stand: der Inhalt liegt jetzt unter einem eigenen Namen. */
export type DeskResetClaim = { claimPath: string; raw: string };

/**
 * Serialisiert die Zugriffe DIESES Prozesses.
 *
 * Der Riegel schuetzt den Lesen-Aendern-Schreiben-Ablauf, in dem zwei
 * gleichzeitige Anfragen sonst einen Block verlieren koennten. Die Tafel ist
 * ein Schreiber; ueber Prozessgrenzen hinweg wirkt weiterhin die Atomaritaet
 * von `rename`.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withDeskResetLock<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  // Fehler duerfen die Kette nicht vergiften.
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function claimName(fileName: string): string {
  return `${fileName}.used-${randomBytes(6).toString("hex")}`;
}

/** Fehlercode eines Dateisystemfehlers, ohne Meldungstext. */
function errorCode(err: unknown): string {
  return String((err as { code?: unknown })?.code ?? "");
}

/**
 * Punkt 11 — atomar schreiben: erst vollstaendig in eine Nebendatei, dann
 * austauschen. Ein Abbruch hinterlaesst keine teilweise geschriebene Datei;
 * die alte Fassung bleibt gueltig, bis die neue fertig ist.
 *
 * Scheitert schon das Schreiben, wird die Nebendatei entfernt — sonst bliebe
 * eine halbe Datei im Tafel-Ordner liegen.
 */
export async function writeDeskResetFileAt(
  dir: string,
  fileName: string,
  text: string,
): Promise<void> {
  const target = join(dir, fileName);
  const temp = `${target}.neu-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temp, text, { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    await unlink(temp).catch(() => undefined);
    throw err;
  }
  try {
    await rename(temp, target);
  } catch (err) {
    await unlink(temp).catch(() => undefined);
    throw err;
  }
}

/** Ergebnis eines Leseversuchs: fehlend und unlesbar sind verschieden. */
export type DeskResetReadResult =
  | { ok: true; raw: string | null }
  | { ok: false; reason: "unreadable" };

/**
 * Punkt 10 — Datei lesen und „fehlt“ von „nicht lesbar“ trennen.
 *
 * `raw: null` heisst ausschliesslich: die Datei ist nicht da. Ein
 * Zugriffsfehler ergibt `unreadable`, damit der Aufrufer NICHT so tut, als gaebe
 * es keine Codes.
 */
export async function readDeskResetFileAt(
  dir: string,
  fileName: string,
): Promise<DeskResetReadResult> {
  try {
    return { ok: true, raw: await readFile(join(dir, fileName), "utf8") };
  } catch (err) {
    if (errorCode(err) === "ENOENT") return { ok: true, raw: null };
    return { ok: false, reason: "unreadable" };
  }
}

/** Ergebnis einer Aneignung. */
export type DeskResetClaimResult =
  | { ok: true; claim: DeskResetClaim | null }
  | { ok: false; reason: "unreadable" };

/**
 * Code durch Umbenennen ANEIGNEN.
 *
 * `rename` ist atomar: lesen zwei Anfragen gleichzeitig, gewinnt genau eine,
 * die andere findet nichts mehr.
 *
 * `claim: null` heisst: es liegt kein Code bereit. `unreadable` heisst: der
 * Stand konnte nicht gelesen werden — die Nebendatei bleibt dann als
 * Rettungsdatei liegen (Punkt 12), statt blind zurueckbenannt zu werden und
 * einen inzwischen neu angeforderten Code zu ueberschreiben.
 */
export async function claimDeskResetFile(
  dir: string,
  fileName: string,
): Promise<DeskResetClaimResult> {
  const claimPath = join(dir, claimName(fileName));
  try {
    await rename(join(dir, fileName), claimPath);
  } catch (err) {
    if (errorCode(err) === "ENOENT") return { ok: true, claim: null };
    return { ok: false, reason: "unreadable" };
  }
  try {
    const raw = await readFile(claimPath, "utf8");
    return { ok: true, claim: { claimPath, raw } };
  } catch {
    // Nicht lesbar: NICHT blind zurueckbenennen. Die Rettungsdatei bleibt.
    return { ok: false, reason: "unreadable" };
  }
}

/** Ergebnis des Rueckschreibens. */
export type DeskResetSettleResult =
  | { ok: true }
  /** Der Stand wurde NICHT zurueckgeschrieben; die Rettungsdatei bleibt. */
  | { ok: false; reason: "read_failed" | "write_failed"; rescuePath: string };

/**
 * Punkt 9/12 — Aneignung zurueckgeben, ohne Neueres zu ersetzen und ohne Daten
 * zu verlieren.
 *
 * Die Zusammenfuehrung wird in JEDEM Fall angewendet. `merge` entscheidet, was
 * mit dem zurueckgegebenen Stand geschieht — beim Einloesen faellt der
 * verbrauchte Eintrag weg, beim Zurueckgeben wird nur Fehlendes ergaenzt.
 *
 * Faellt beim Zusammenfuehren nichts mehr uebrig, entsteht KEINE Datei; eine
 * vorhandene wird entfernt.
 *
 * Bleibt die Zieldatei unlesbar oder schlaegt das Schreiben fehl, BLEIBT die
 * Rettungsdatei liegen. Sie ist dann der einzige Ort mit noch gueltigen Codes;
 * sie zu loeschen waere der Verlust genau dieser Codes.
 */
export async function releaseDeskResetEntries(
  dir: string,
  fileName: string,
  claim: DeskResetClaim,
  merge: (currentRaw: string | null, claimedRaw: string) => string,
): Promise<DeskResetSettleResult> {
  const current = await readDeskResetFileAt(dir, fileName);
  if (!current.ok) {
    console.error("[desk-reset] Stand nicht lesbar, Rettungsdatei bleibt liegen");
    return { ok: false, reason: "read_failed", rescuePath: claim.claimPath };
  }

  try {
    // Punkt 1: Die Zusammenfuehrung wird IMMER angewendet, auch wenn die
    // Zieldatei fehlt. Vorher benannte dieser Zweig die Aneignung unveraendert
    // zurueck — ein verbrauchter Code wurde damit wieder einloesbar, weil der
    // Schritt zum Entfernen uebersprungen wurde.
    const merged = merge(current.raw, claim.raw);
    if (merged.trim() === "") {
      // Kein Eintrag mehr uebrig: keine leere Datei anlegen. Eine vorhandene
      // Zieldatei wird entfernt.
      await unlink(join(dir, fileName)).catch(() => undefined);
    } else if (current.raw === null && merged === claim.raw) {
      // Unveraendert: das Umbenennen ist atomar und spart das Neuschreiben.
      await rename(claim.claimPath, join(dir, fileName));
    } else {
      await writeDeskResetFileAt(dir, fileName, merged);
    }
  } catch {
    console.error("[desk-reset] Stand nicht schreibbar, Rettungsdatei bleibt liegen");
    return { ok: false, reason: "write_failed", rescuePath: claim.claimPath };
  }

  // Nur nach nachweislichem Erfolg aufraeumen.
  const removed = await consumeDeskResetClaim(claim.claimPath);
  if (!removed) {
    console.error("[desk-reset] Rettungsdatei konnte nicht entfernt werden");
  }
  return { ok: true };
}

/**
 * Verbrauchten Stand entfernen.
 *
 * `false` heisst: das Loeschen schlug fehl. Der Aufrufer meldet das, statt den
 * Fehler still zu schlucken — ein bereits verwendeter Code darf nicht
 * unbemerkt liegen bleiben.
 */
export async function consumeDeskResetClaim(claimPath: string): Promise<boolean> {
  try {
    await unlink(claimPath);
    return true;
  } catch (err) {
    if (errorCode(err) === "ENOENT") return true;
    return false;
  }
}
