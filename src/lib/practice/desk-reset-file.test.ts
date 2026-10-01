import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  deskResetEntryFor,
  parseDeskResetEntries,
  renderDeskResetEntry,
  settleDeskResetEntries,
  upsertDeskResetEntry,
} from "./desk-reset.ts";
import {
  claimDeskResetFile,
  consumeDeskResetClaim,
  readDeskResetFileAt,
  releaseDeskResetEntries,
  withDeskResetLock,
  writeDeskResetFileAt,
} from "./desk-reset-file.ts";

/**
 * Ruecksetzcodes im Tafel-Ordner (Punkte 9-13).
 *
 * 9.  Rettungsdatei bei Schreibfehler behalten.
 * 10. Fehlende und unlesbare Datei unterscheiden.
 * 11. Abgebrochene Schreibvorgaenge aufraeumen.
 * 12. Rueckbenennen nach Lesefehler nicht blind.
 * 13. Gleichzeitige Anforderung und Einloesung gemeinsam absichern.
 *
 * Geprueft mit echten Dateien in einem temporaeren Ordner, ohne Datenbank.
 * Auf diesem Rechner liefert Node fuer ein Verzeichnis EISDIR und fuer ein
 * fehlgeschlagenes `rename` EPERM — beides wird hier bewusst ausgenutzt.
 */

const FILE = "silvia-passwort.txt";
const LATER = Date.now() + 30 * 60 * 1000;

async function withDir<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "silvia-reset-"));
  try {
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function seed(email = "anna@example.test", code = "ALTA-2345"): string {
  return renderDeskResetEntry({ email, code, exp: LATER });
}

test("Punkt 10: eine fehlende Datei ist kein Lesefehler", async () => {
  await withDir(async (dir) => {
    const result = await readDeskResetFileAt(dir, FILE);
    assert.deepEqual(result, { ok: true, raw: null }, "fehlt heisst: kein Eintrag, kein Fehler");
  });
});

test("Punkt 10: eine unlesbare Datei wird als Fehler gemeldet, nicht als leer", async () => {
  await withDir(async (dir) => {
    // Ein Verzeichnis an der Stelle der Datei: Node meldet EISDIR.
    await mkdir(join(dir, FILE));
    const result = await readDeskResetFileAt(dir, FILE);
    assert.deepEqual(result, { ok: false, reason: "unreadable" }, "EISDIR ist kein leerer Bestand");
  });
});

test("claim eignet sich die Datei an, die zweite Anfrage bekommt nichts", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, FILE), seed(), "utf8");

    const first = await claimDeskResetFile(dir, FILE);
    assert.equal(first.ok, true);
    if (!first.ok || !first.claim) throw new Error("erwartet: Aneignung");
    assert.equal(existsSync(join(dir, FILE)), false, "unter dem alten Namen liegt nichts mehr");
    assert.equal(existsSync(first.claim.claimPath), true, "der Code liegt unter dem Aneignungsnamen");

    // Genau das war vorher moeglich: zweimal derselbe Code.
    const second = await claimDeskResetFile(dir, FILE);
    assert.deepEqual(second, { ok: true, claim: null }, "kein zweites Einloesen");
  });
});

test("Punkt 10: eine unlesbare Datei ist kein 'kein Code da'", async () => {
  await withDir(async (dir) => {
    await mkdir(join(dir, FILE));
    const result = await claimDeskResetFile(dir, FILE);
    assert.deepEqual(result, { ok: false, reason: "unreadable" }, "nicht als leerer Bestand behandeln");
  });
});

test("Punkt 11: ein gescheitertes Austauschen laesst keine Nebendatei liegen", async () => {
  await withDir(async (dir) => {
    // Das Ziel ist ein Verzeichnis: `rename` scheitert mit EPERM, obwohl das
    // Schreiben in die Nebendatei zuvor gelingt.
    await mkdir(join(dir, FILE));
    await assert.rejects(() => writeDeskResetFileAt(dir, FILE, seed()));

    const rest = (await readdir(dir)).filter((name) => name.includes(".neu-"));
    assert.deepEqual(rest, [], "die halbe Nebendatei wurde entfernt");
  });
});

test("Punkt 11: ein gelungener Schreibvorgang laesst keine Nebendatei liegen", async () => {
  await withDir(async (dir) => {
    const text = seed();
    await writeDeskResetFileAt(dir, FILE, text);
    assert.equal(await readFile(join(dir, FILE), "utf8"), text, "vollstaendig geschrieben");
    const rest = (await readdir(dir)).filter((name) => name.includes(".neu-"));
    assert.deepEqual(rest, [], "keine Nebendatei");
  });
});

test("Punkt 1: ein verbrauchter Code wird auch ohne Zieldatei entfernt", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, FILE), seed("anna@example.test", "ALTA-2345"), "utf8");
    const claimed = await claimDeskResetFile(dir, FILE);
    if (!claimed.ok || !claimed.claim) throw new Error("erwartet: Aneignung");
    const claim = claimed.claim;

    // Die Zieldatei fehlt (niemand hat inzwischen geschrieben). Der Code wird
    // eingeloest: sein Block muss trotzdem verschwinden.
    const result = await releaseDeskResetEntries(dir, FILE, claim, (current, claimedRaw) =>
      settleDeskResetEntries(current, claimedRaw, "anna@example.test"),
    );
    assert.deepEqual(result, { ok: true });

    // Genau das war der Fehler: die Aneignung wurde unveraendert zurueckbenannt
    // und der Code war wieder einloesbar.
    assert.equal(existsSync(join(dir, FILE)), false, "keine Zieldatei mit dem verbrauchten Code");
    assert.equal(existsSync(claim.claimPath), false, "die Aneignung ist aufgeraeumt");
  });
});

test("Punkt 1: fremde Codes bleiben beim Einloesen ohne Zieldatei erhalten", async () => {
  await withDir(async (dir) => {
    // Anna UND Maria fordern an.
    const both = [
      renderDeskResetEntry({ email: "anna@example.test", code: "ALTA-2345", exp: LATER }),
      renderDeskResetEntry({ email: "maria@example.test", code: "MARB-6789", exp: LATER }),
    ].join("\n");
    await writeFile(join(dir, FILE), both, "utf8");

    const claimed = await claimDeskResetFile(dir, FILE);
    if (!claimed.ok || !claimed.claim) throw new Error("erwartet: Aneignung");
    const claim = claimed.claim;

    const result = await releaseDeskResetEntries(dir, FILE, claim, (current, claimedRaw) =>
      settleDeskResetEntries(current, claimedRaw, "anna@example.test"),
    );
    assert.deepEqual(result, { ok: true });

    // Anna ist verbraucht, Maria bleibt einloesbar.
    const inhalt = await readFile(join(dir, FILE), "utf8");
    assert.equal(deskResetEntryFor(inhalt, "anna@example.test").ok, false);
    assert.equal(deskResetEntryFor(inhalt, "maria@example.test").ok, true);
  });
});

test("Punkt 9 und 12: bei Lesefehler bleibt die Rettungsdatei liegen", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, FILE), seed(), "utf8");
    const claimed = await claimDeskResetFile(dir, FILE);
    if (!claimed.ok || !claimed.claim) throw new Error("erwartet: Aneignung");
    const claim = claimed.claim;

    // Zwischen Aneignung und Rueckgabe wird die Zielstelle unlesbar.
    await mkdir(join(dir, FILE));

    const result = await releaseDeskResetEntries(dir, FILE, claim, (current, claimedRaw) =>
      settleDeskResetEntries(current, claimedRaw),
    );

    assert.deepEqual(result, { ok: false, reason: "read_failed", rescuePath: claim.claimPath });
    // Punkt 9: NICHT loeschen — der einzige Ort mit gueltigen Codes.
    assert.equal(existsSync(claim.claimPath), true, "die Rettungsdatei bleibt liegen");
    assert.equal(
      deskResetEntryFor(await readFile(claim.claimPath, "utf8"), "anna@example.test").ok,
      true,
      "der Code darin ist weiterhin gueltig",
    );
  });
});

test("Punkte 10/12: release mischt ein und laesst Neueres bestehen", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, FILE), seed("anna@example.test", "ALTA-2345"), "utf8");
    const claimed = await claimDeskResetFile(dir, FILE);
    if (!claimed.ok || !claimed.claim) throw new Error("erwartet: Aneignung");
    const claim = claimed.claim;

    // Inzwischen fordert Maria an — die Datei existiert wieder, mit Maria.
    await writeFile(join(dir, FILE), seed("maria@example.test", "MARB-6789"), "utf8");

    const result = await releaseDeskResetEntries(dir, FILE, claim, (current, claimedRaw) =>
      settleDeskResetEntries(current, claimedRaw),
    );
    assert.deepEqual(result, { ok: true });

    const inhalt = await readFile(join(dir, FILE), "utf8");
    assert.equal(deskResetEntryFor(inhalt, "maria@example.test").ok, true, "Maria bleibt");
    assert.equal(deskResetEntryFor(inhalt, "anna@example.test").ok, true, "Anna kommt zurueck");
    assert.equal(existsSync(claim.claimPath), false, "nach Erfolg ist die Nebendatei weg");
  });
});

test("Punkt 12: ein zurueckgegebener Code ersetzt keinen neueren", () => {
  const alt = renderDeskResetEntry({ email: "anna@example.test", code: "ALTA-2345", exp: LATER });
  const neu = renderDeskResetEntry({ email: "anna@example.test", code: "NEUB-6789", exp: LATER });

  // Anna hat inzwischen NEU angefordert; der alte Code wird zurueckgegeben.
  const merged = settleDeskResetEntries(neu, alt);
  const anna = deskResetEntryFor(merged, "anna@example.test");
  assert.equal(anna.ok ? anna.entry.code : "", "NEUB-6789", "der neuere Code gewinnt");

  // Fehlt die Person in der aktuellen Datei, wird ihr Block ergaenzt.
  const andere = renderDeskResetEntry({ email: "maria@example.test", code: "MARB-6789", exp: LATER });
  const ergaenzt = settleDeskResetEntries(andere, alt);
  assert.equal(deskResetEntryFor(ergaenzt, "anna@example.test").ok, true);
  assert.equal(deskResetEntryFor(ergaenzt, "maria@example.test").ok, true);
});

test("Punkt 13: der Riegel serialisiert zusammengehoerige Zugriffe", async () => {
  const order: string[] = [];
  const first = withDeskResetLock(async () => {
    order.push("a-start");
    await new Promise((resolve) => setTimeout(resolve, 30));
    order.push("a-end");
  });
  const second = withDeskResetLock(async () => {
    order.push("b-start");
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push("b-end");
  });
  await Promise.all([first, second]);

  // Ohne Riegel wuerde b zwischen a-start und a-end laufen.
  assert.deepEqual(order, ["a-start", "a-end", "b-start", "b-end"]);
});

test("Punkt 13: ein Fehler im Riegel blockiert die Kette nicht", async () => {
  const order: string[] = [];
  await assert.rejects(() =>
    withDeskResetLock(async () => {
      order.push("fehler");
      throw new Error("absichtlich");
    }),
  );
  await withDeskResetLock(async () => {
    order.push("danach");
  });
  assert.deepEqual(order, ["fehler", "danach"], "die Kette laeuft weiter");
});

test("Punkt 10: zwei Personen haben gleichzeitig einen eigenen Code", () => {
  const first = seed("anna@example.test", "ALTA-2345");
  // Zweite Anforderung ersetzt NICHT die ganze Datei.
  const both = upsertDeskResetEntry(first, {
    email: "maria@example.test",
    code: "MARB-6789",
    exp: LATER,
  });

  const entries = parseDeskResetEntries(both);
  assert.equal(entries.length, 2, "beide Personen behalten ihren Code");
  const maria = deskResetEntryFor(both, "maria@example.test");
  assert.equal(maria.ok ? maria.entry.code : "", "MARB-6789");

  // Eine erneute Anforderung derselben Person ersetzt nur IHREN Block.
  const refreshed = upsertDeskResetEntry(both, {
    email: "anna@example.test",
    code: "ANNC-2345",
    exp: LATER,
  });
  assert.equal(parseDeskResetEntries(refreshed).length, 2);
  const anna = deskResetEntryFor(refreshed, "anna@example.test");
  assert.equal(anna.ok ? anna.entry.code : "", "ANNC-2345");
  assert.equal(deskResetEntryFor(refreshed, "maria@example.test").ok, true, "Maria bleibt");
});

test("Punkt 10: eine abgelaufene Nachfrage laesst fremde Codes bestehen", () => {
  const both = [
    renderDeskResetEntry({ email: "anna@example.test", code: "ALTA-2345", exp: Date.now() - 1000 }),
    renderDeskResetEntry({ email: "maria@example.test", code: "MARB-6789", exp: LATER }),
  ].join("\n");

  const anna = deskResetEntryFor(both, "anna@example.test");
  assert.equal(anna.ok, false);
  assert.equal(anna.ok === false ? anna.error : "", "expired");

  // Anna verbraucht: ihr Block faellt, Marias bleibt.
  const after = settleDeskResetEntries(null, both, "anna@example.test");
  assert.equal(deskResetEntryFor(after, "anna@example.test").ok, false);
  assert.equal(deskResetEntryFor(after, "maria@example.test").ok, true);
});

test("consume entfernt den Stand endgueltig und meldet einen Fehlschlag", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, FILE), seed(), "utf8");
    const claimed = await claimDeskResetFile(dir, FILE);
    if (!claimed.ok || !claimed.claim) throw new Error("erwartet: Aneignung");

    assert.equal(await consumeDeskResetClaim(claimed.claim.claimPath), true, "erster Versuch raeumt auf");
    assert.equal(existsSync(claimed.claim.claimPath), false, "der Code ist weg");
    // Ein bereits entfernter Stand gilt als erledigt, nicht als Fehler.
    assert.equal(await consumeDeskResetClaim(claimed.claim.claimPath), true);
  });
});

test("eine Datei im alten Format bleibt lesbar", () => {
  // Kompatibilitaet: Eine vorhandene Datei mit genau einem Block wird weiter
  // gelesen, auch wenn Kennung und Zeilenenden abweichen.
  const alt = [
    "Silvia - einmaliger Code",
    "",
    "# silvia-reset 1",
    "# email=Alt@Example.test",
    "# code=ALTA2345",
    `# exp=${new Date(LATER).toISOString()}`,
    "",
  ].join("\r\n");
  const entries = parseDeskResetEntries(alt);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.email, "alt@example.test", "Adresse normalisiert");
  assert.equal(entries[0]!.code, "ALTA-2345");
});
