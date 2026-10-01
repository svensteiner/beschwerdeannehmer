import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE_LINE_UNKNOWN, formatBridgeLine } from "./status.ts";

test("formatBridgeLine: never synced", () => {
  assert.equal(
    formatBridgeLine({ owners: 0, patients: 0, pendingOutbox: 0, lastMasterSyncAt: null }),
    "Bridge: noch nicht synchronisiert",
  );
});

test("formatBridgeLine: minutes since last sync, outbox count", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const syncedAt = new Date("2026-09-08T11:56:00Z");
  const line = formatBridgeLine({ owners: 12, patients: 31, pendingOutbox: 0, lastMasterSyncAt: syncedAt }, now);
  assert.equal(line, "Bridge: 12 Halter, 31 Patienten, zuletzt synchronisiert vor 4 min, Outbox 0 offen");
});

test("formatBridgeLine: pending outbox shows up in the line", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const syncedAt = new Date("2026-09-08T12:00:00Z");
  const line = formatBridgeLine({ owners: 1, patients: 2, pendingOutbox: 3, lastMasterSyncAt: syncedAt }, now);
  assert.equal(line, "Bridge: 1 Halter, 2 Patienten, zuletzt synchronisiert gerade eben, Outbox 3 offen");
});

test("formatBridgeLine warnt bei endgültig gescheiterten Buchungen", () => {
  const now = new Date("2026-09-08T10:10:00Z");
  const line = formatBridgeLine({ owners: 1, patients: 1, pendingOutbox: 0, failedOutbox: 2, lastMasterSyncAt: new Date("2026-09-08T10:00:00Z") }, now);
  assert.match(line, /Achtung: 2 Termine wurden nicht eingetragen/);
});

test("formatBridgeLine zeigt laufende Übertragungen", () => {
  const now = new Date("2026-09-08T10:10:00Z");
  // Laufende Einträge (processing) fehlten früher in der Zeile.
  const line = formatBridgeLine(
    { owners: 2, patients: 5, pendingOutbox: 1, processingOutbox: 3, failedOutbox: 0, lastMasterSyncAt: new Date("2026-09-08T10:00:00Z") },
    now,
  );
  assert.match(line, /Outbox 1 offen, 3 laufend/);
});

test("formatBridgeLine unterscheidet 'nie synchronisiert' von 'nicht abrufbar'", () => {
  const never = formatBridgeLine({ owners: 0, patients: 0, pendingOutbox: 0, lastMasterSyncAt: null });
  assert.equal(never, "Bridge: noch nicht synchronisiert");
  // Ein Datenbankfehler darf nicht wie ein leerer, aber eingerichteter Stand aussehen.
  assert.equal(BRIDGE_LINE_UNKNOWN, "Bridge: Status derzeit nicht abrufbar");
  assert.notEqual(BRIDGE_LINE_UNKNOWN, never);
});

test("formatBridgeLine warnt auch ohne ersten Stammdatenabgleich", () => {
  // Buchungen koennen fehlgeschlagen sein, bevor ein Stammdatenabgleich lief.
  // Frueher kehrte die Zeile sofort zurueck und verdeckte die Warnung.
  const failed = formatBridgeLine({
    owners: 0,
    patients: 0,
    pendingOutbox: 0,
    failedOutbox: 2,
    lastMasterSyncAt: null,
  });
  assert.match(failed, /noch nicht synchronisiert/);
  assert.match(failed, /Achtung: 2 Termine wurden nicht eingetragen/);

  const single = formatBridgeLine({
    owners: 0,
    patients: 0,
    pendingOutbox: 0,
    failedOutbox: 1,
    lastMasterSyncAt: null,
  });
  assert.match(single, /Achtung: 1 Termin wurde nicht eingetragen/);

  // Ohne Fehler bleibt es bei der kurzen Zeile.
  assert.equal(
    formatBridgeLine({ owners: 0, patients: 0, pendingOutbox: 0, failedOutbox: 0, lastMasterSyncAt: null }),
    "Bridge: noch nicht synchronisiert",
  );
});

test("status.ts fängt einen werfenden Adapter ab", async () => {
  // Der Vertrag lautet „wirft nie“. Früher standen health()/capabilities()
  // außerhalb der Fehlerbehandlung, obwohl der Kommentar das Gegenteil sagte.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./status.ts", import.meta.url), "utf8");
  const tryIndex = source.indexOf("try {");
  const healthIndex = source.indexOf("adapter.health()");
  const catchIndex = source.indexOf("} catch {");
  assert.ok(tryIndex >= 0 && healthIndex > tryIndex, "adapter.health() muss im try stehen");
  assert.ok(catchIndex > healthIndex, "auf den Adapteraufruf muss ein catch folgen");
});

test("bookingLine nennt den Anbieter aus dem Adapter, nicht fest Vquadrat", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("./status.ts", import.meta.url), "utf8");
  // „Vquadrat“ darf im Buchungstext nicht fest verdrahtet sein; der Name kommt
  // aus adapter.label, damit weitere Praxisprogramme dieselbe Bridge nutzen.
  assert.doesNotMatch(source, /Termine: werden in Vquadrat eingetragen/);
  assert.match(source, /Termine: werden in \$\{adapter\.label\} eingetragen/);
});
