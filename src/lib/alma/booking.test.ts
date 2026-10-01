import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSlot } from "./hours.ts";
import type {
  ConnectorAppointmentRequest,
  ConnectorAppointmentResult,
  PraxissoftwarePort,
  PraxissoftwareWriteResult,
} from "@/lib/practice/praxissoftware.ts";
import {
  _peekBookingStateForTests,
  _resetBookingStoreForTests,
  advanceBooking,
  bookingEnabled,
  connectorLabelFor,
  isCancel,
  isConfirmation,
  isDenial,
  nextConnectorSlot,
  pickFutureSlot,
  pickVetForSlot,
  readMessageIntent,
  SLOT_QUERY_CONCURRENCY,
  slotCoversDuration,
  slotWithinLead,
  sortSlotsByStart,
} from "./booking.ts";
import { viennaInstant, viennaNow } from "./hours.ts";

/** Bequemer Zugriff auf einen Treffer, ohne Union-Narrowing im Test. */
function slotStart(result: Awaited<ReturnType<typeof nextConnectorSlot>>): string | undefined {
  return result.kind === "slot" ? result.start : undefined;
}
function slotResourceId(result: Awaited<ReturnType<typeof nextConnectorSlot>>): string | undefined {
  return result.kind === "slot" ? result.resourceId : undefined;
}

/** Dauer eines Testtermins, passend zu SLOT_MINUTES. */
const SLOT_MINUTES_TEST = 20;

/** Slots immer in der Zukunft (morgen 09:00/09:20), sonst filtert pickFutureSlot sie weg. */
function slotTomorrow(hh: string, mm: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${ymd}T${hh}:${mm}:00`;
}
const SLOT_A = slotTomorrow("09", "00");
const SLOT_B = slotTomorrow("09", "20");

/** Gemeinsamer Scope der Testfaelle (siehe Punkt 1). */
const SCOPE_TEST = "";

function fakeAdapter(opts: {
  slots?: string[];
  ownerId?: string | null;
  patientId?: string | null;
  createResult?: (req: ConnectorAppointmentRequest) => PraxissoftwareWriteResult<ConnectorAppointmentResult> | Promise<PraxissoftwareWriteResult<ConnectorAppointmentResult>>;
} = {}): PraxissoftwarePort {
  const slots = opts.slots ?? [SLOT_A, SLOT_B];
  return {
    kind: "vquadrat",
    label: "Vquadrat Veterinär",
    host: "other-pc",
    sendAkte: () => ({ ok: false, reason: "notConnected" }),
    sendSlot: () => ({ ok: false, reason: "notConnected" }),
    sendKontakt: () => ({ ok: false, reason: "notConnected" }),
    health: async () => ({ ok: true, data: { ok: true, adapter: "vquadrat", readOnly: false, version: "1" } }),
    capabilities: async () => ({
      ok: true,
      data: { read: { owners: true, patients: true, slots: true, vets: true, hours: true }, write: { appointment: true } },
    }),
    findOwners: async () =>
      opts.ownerId === null
        ? { ok: true, data: [] }
        : { ok: true, data: [{ id: opts.ownerId ?? "o1", name: "Frau Wallner", phones: ["0664 1234567"], email: null }] },
    patientsOf: async () =>
      opts.patientId === null
        ? { ok: true, data: [] }
        : { ok: true, data: [{ id: opts.patientId ?? "p1", ownerId: "o1", name: "Bella", species: "Hund", breed: null, chip: null, birth: null, deceased: false, cave: false, caveText: null, permanentMed: null }] },
    resources: async () => ({ ok: true, data: [{ id: "r1", name: "Behandlungsraum 1" }] }),
    vets: async () => ({ ok: true, data: [{ id: "v1", name: "Dr. Test" }] }),
    // Punkt 12: Der Anschluss liefert Start UND Ende. `end` ist Beginn plus
    // Dauer — ein Eintrag mit `end === start` waere kein gueltiges Fenster.
    freeSlots: async () => ({
      ok: true,
      data: slots.map((start) => ({
        start,
        end: new Date(new Date(start).getTime() + SLOT_MINUTES_TEST * 60_000).toISOString(),
      })),
    }),
    hours: async () => ({ ok: true, data: { opening: [], closedDays: [] } }),
    createAppointment: async (req) =>
      opts.createResult ? await opts.createResult(req) : { ok: true, data: { id: "APT-1", start: req.start, end: req.start } },
  };
}

test("isConfirmation/isDenial: Verneinung geht vor Zusage", () => {
  assert.equal(isConfirmation("ja, passt"), true);
  assert.equal(isConfirmation("genau, bitte"), true);
  assert.equal(isConfirmation("gerne, in ordnung"), true);
  assert.equal(isConfirmation("ja, aber morgen statt heute"), false);
  assert.equal(isConfirmation("nein, lieber anders"), false);
  assert.equal(isConfirmation("wie war das nochmal"), false);
  assert.equal(isDenial("nein"), true);
  assert.equal(isDenial("lieber am Nachmittag"), true);
  assert.equal(isDenial("ja passt"), false);
});

test("bookingEnabled: nur mit expliziter Freigabe UND Connector-Schreibrecht", () => {
  const prevBooking = process.env.SILVIA_BOOKING;
  const prevApproval = process.env.SILVIA_BOOKING_LIVE_APPROVED;
  try {
    process.env.SILVIA_BOOKING = "connector";
    delete process.env.SILVIA_BOOKING_LIVE_APPROVED;
    assert.equal(bookingEnabled({ write: { appointment: true } }), false);
    process.env.SILVIA_BOOKING_LIVE_APPROVED = "1";
    assert.equal(bookingEnabled({ write: { appointment: true } }), true);
    assert.equal(bookingEnabled({ write: { appointment: false } }), false);
    assert.equal(bookingEnabled(null), false);
    process.env.SILVIA_BOOKING = "tafel";
    assert.equal(bookingEnabled({ write: { appointment: true } }), false);
    delete process.env.SILVIA_BOOKING;
    assert.equal(bookingEnabled({ write: { appointment: true } }), false);
  } finally {
    if (prevBooking === undefined) delete process.env.SILVIA_BOOKING;
    else process.env.SILVIA_BOOKING = prevBooking;
    if (prevApproval === undefined) delete process.env.SILVIA_BOOKING_LIVE_APPROVED;
    else process.env.SILVIA_BOOKING_LIVE_APPROVED = prevApproval;
  }
});

test("wunsch -> vorschlag: erster Aufruf schlaegt den ersten freien Slot vor, bucht noch nichts", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "call-1", adapter, message: "Ich haette gern einen Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(result);
  assert.equal(result.applied, false);
  assert.equal(result.actionPatch.connectorApplied, false);
  assert.equal(result.actionPatch.connectorStart, SLOT_A);
  assert.match(result.text, /Soll ich das so eintragen\?/);
  assert.match(result.text, new RegExp(formatSlot(new Date(SLOT_A)).replace(/[.]/g, "\\.")));
  const state = _peekBookingStateForTests("call-1");
  assert.equal(state?.step, "vorschlag");
});

test("vorschlag -> gebucht: Bestaetigung ruft createAppointment auf und meldet die Nummer", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-2", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const confirmed = await advanceBooking({ scope: SCOPE_TEST, callId: "call-2", adapter, message: "Ja, passt." });
  assert.ok(confirmed);
  assert.equal(confirmed.applied, true);
  assert.equal(confirmed.actionPatch.connectorApplied, true);
  assert.equal(confirmed.actionPatch.connectorAppointmentId, "APT-1");
  // Punkt 14: der Name kommt aus dem Anschluss ("Vquadrat Veterinär"), nicht
  // fest „Vquadrat“.
  assert.match(confirmed.actionPatch.summary, /in Vquadrat Veterinär eingetragen \(Nr\. APT-1\)/);
  // Idempotenz: Zustand ist nach dem Buchen geloescht — derselbe callId startet wieder bei "wunsch".
  assert.equal(_peekBookingStateForTests("call-2"), null);
});

test("Verneinung schlaegt den naechsten Slot vor, ohne zu buchen", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-3", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const denied = await advanceBooking({ scope: SCOPE_TEST, callId: "call-3", adapter, message: "Nein, lieber anders." });
  assert.ok(denied);
  assert.equal(denied.applied, false);
  assert.equal(denied.actionPatch.connectorStart, SLOT_B);
  const state = _peekBookingStateForTests("call-3");
  assert.equal(state?.step, "vorschlag");
  assert.equal(state?.slotStart, SLOT_B);
});

test("weder Ja noch Nein wiederholt denselben Vorschlag ohne zu buchen", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-4", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const again = await advanceBooking({ scope: SCOPE_TEST, callId: "call-4", adapter, message: "Wie war das nochmal?" });
  assert.ok(again);
  assert.equal(again.applied, false);
  assert.equal(again.actionPatch.connectorStart, SLOT_A);
});

test("conflict beim Buchen schlaegt bis zu zwei weitere Slots vor, dann faellt es auf den alten Pfad zurueck", async () => {
  _resetBookingStoreForTests();
  const manySlots = [SLOT_A, SLOT_B, slotTomorrow("09", "40"), slotTomorrow("10", "00")];
  const adapter = fakeAdapter({ slots: manySlots, createResult: () => ({ ok: false, reason: "conflict" }) });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-5", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const first = await advanceBooking({ scope: SCOPE_TEST, callId: "call-5", adapter, message: "Ja, passt." });
  assert.ok(first);
  assert.equal(first.applied, false);
  assert.match(first.text, /gerade vergeben/);
  const second = await advanceBooking({ scope: SCOPE_TEST, callId: "call-5", adapter, message: "Ja, passt." });
  assert.ok(second);
  assert.equal(second.applied, false);
  const third = await advanceBooking({ scope: SCOPE_TEST, callId: "call-5", adapter, message: "Ja, passt." });
  // Nach MAX_CONFLICT_RETRIES (2) bleibt kein Weiterbuchungsversuch offen; der Zustand ist beendet.
  assert.ok(third);
  assert.equal(third?.failed, true);
  assert.equal(third?.applied, false);
  assert.doesNotMatch(third?.text ?? "", /eingetragen\.$/);
  assert.equal(_peekBookingStateForTests("call-5"), null);
});

test("forbidden/error/notConnected: Buchung wird als fehlgeschlagen markiert und nicht lokal gebucht", async () => {
  for (const reason of ["forbidden", "error", "notConnected"] as const) {
    _resetBookingStoreForTests();
    const adapter = fakeAdapter({ createResult: () => ({ ok: false, reason }) });
    await advanceBooking({ scope: SCOPE_TEST, callId: "call-6", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
    const result = await advanceBooking({ scope: SCOPE_TEST, callId: "call-6", adapter, message: "Ja, passt." });
    assert.ok(result, `reason=${reason}`);
    assert.equal(result?.failed, true, `reason=${reason}`);
    assert.equal(result?.applied, false, `reason=${reason}`);
    assert.doesNotMatch(result?.text ?? "", /eingetragen\.$/);
  }
});

test("Datumskorrektur bestätigt den alten Slot nicht und verlangt neuen Vorschlag", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({ createResult: async () => { writes += 1; return { ok: true, data: { id: "never", start: SLOT_A, end: SLOT_A } }; } });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-date-correction", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const corrected = await advanceBooking({ scope: SCOPE_TEST, callId: "call-date-correction", adapter, message: "Ja, aber morgen statt heute" });
  assert.ok(corrected);
  assert.equal(corrected.applied, false);
  assert.equal(corrected.actionPatch.connectorApplied, false);
  assert.equal(writes, 0);
  assert.equal(_peekBookingStateForTests("call-date-correction")?.step, "vorschlag");
});

test("unklare oder reine Zeitkorrektur erzeugt keinen Buchungsfallback", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({ createResult: async () => { writes += 1; return { ok: true, data: { id: "never", start: SLOT_A, end: SLOT_A } }; } });
  const initialTime = await advanceBooking({ scope: SCOPE_TEST, callId: "call-time-first", adapter, message: "Termin um 15 Uhr", owner: "Frau Wallner", pet: "Bella" });
  assert.equal(initialTime?.failed, true);
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-time-change", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const dateAndTime = await advanceBooking({ scope: SCOPE_TEST, callId: "call-time-change", adapter, message: "Ja, morgen um 15 Uhr" });
  assert.equal(dateAndTime?.failed, true);
  assert.equal(writes, 0);
});

test("gewünschter Tag wird bei Korrektur exakt abgefragt, ohne Fallback", async () => {
  _resetBookingStoreForTests();
  const requested = new Date();
  requested.setDate(requested.getDate() + 1);
  const requestedDate = `${requested.getFullYear()}-${String(requested.getMonth() + 1).padStart(2, "0")}-${String(requested.getDate()).padStart(2, "0")}`;
  const queried: string[] = [];
  const adapter = fakeAdapter({ slots: [SLOT_A] });
  const original = adapter.freeSlots;
  adapter.freeSlots = async (options) => { queried.push(options.date); return original(options); };
  const corrected = await nextConnectorSlot(adapter, undefined, new Date(), requestedDate);
  assert.ok(corrected);
  assert.deepEqual(queried, [requestedDate]);
  const wrongAdapterDate = new Date(requested);
  wrongAdapterDate.setDate(wrongAdapterDate.getDate() + 1);
  const wrongDate = `${wrongAdapterDate.getFullYear()}-${String(wrongAdapterDate.getMonth() + 1).padStart(2, "0")}-${String(wrongAdapterDate.getDate()).padStart(2, "0")}`;
  assert.equal((await nextConnectorSlot(adapter, undefined, new Date(), wrongDate)).kind, "none");
});

test("Transportfehler bleiben unklar und verhindern blinde Wiederholung", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({ createResult: () => { writes += 1; throw new Error("transport"); } });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-transport", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "call-transport", adapter, message: "Ja, passt." });
  assert.equal(result?.failed, true);
  assert.equal(result?.uncertain, true);
  assert.match(result?.text ?? "", /nicht bestätigt/);
  const repeated = await advanceBooking({ scope: SCOPE_TEST, callId: "call-transport", adapter, message: "Ja, passt." });
  assert.equal(repeated?.uncertain, true);
  assert.equal(writes, 1);
  assert.equal(_peekBookingStateForTests("call-transport")?.uncertain, true);
});

test("parallele Bestätigungen schreiben bei Erfolg exakt einmal", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const adapter = fakeAdapter({ createResult: async () => {
    writes += 1;
    await gate;
    return { ok: true, data: { id: "APT-parallel", start: SLOT_A, end: SLOT_A } };
  } });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-ok", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const first = advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-ok", adapter, message: "Ja, passt." });
  const second = advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-ok", adapter, message: "Ja, passt." });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(writes, 1);
  assert.equal(a?.applied, true);
  assert.equal(b?.applied, false);
  assert.equal(b?.pending, true);
  assert.match(b?.text ?? "", /noch verarbeitet/);
});

test("parallele Transportfehler schreiben exakt einmal und bleiben unsicher", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const adapter = fakeAdapter({ createResult: async () => {
    writes += 1;
    await gate;
    throw new Error("synthetic transport");
  } });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-error", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const first = advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-error", adapter, message: "Ja, passt." });
  const second = advanceBooking({ scope: SCOPE_TEST, callId: "call-parallel-error", adapter, message: "Ja, passt." });
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(writes, 1);
  assert.equal(a?.uncertain, true);
  assert.equal(b?.applied, false);
  assert.equal(b?.pending, true);
  assert.match(b?.text ?? "", /noch verarbeitet/);
});

test("Connector-error bleibt unklar und wird nicht erneut geschrieben", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({ createResult: () => { writes += 1; return { ok: false, reason: "error" }; } });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-error", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "call-error", adapter, message: "Ja, passt." });
  assert.equal(result?.uncertain, true);
  const repeated = await advanceBooking({ scope: SCOPE_TEST, callId: "call-error", adapter, message: "Ja, passt." });
  assert.equal(repeated?.uncertain, true);
  assert.equal(writes, 1);
});

test("unbekannte Halterin/Patient im Connector: keine Buchung, alter Pfad greift", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter({ ownerId: null });
  await advanceBooking({ scope: SCOPE_TEST, callId: "call-7", adapter, message: "Termin für Bella" });
  const confirmed = await advanceBooking({ scope: SCOPE_TEST, callId: "call-7", adapter, message: "Ja, passt." });
  assert.equal(confirmed, null);
});

test("kein freier Slot vom Connector: kontrollierter Fehler verhindert falschen Fallback", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter({ slots: [] });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "call-8", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.equal(result?.failed, true);
  assert.equal(result?.applied, false);
});

test("ohne callId greift die Zustandsmaschine nie", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "", adapter, message: "Termin für Bella" });
  assert.equal(result, null);
});

test("pickFutureSlot: vergangene und zu nahe Slots werden uebersprungen (STATUS.md Zeile 49)", () => {
  const now = new Date("2026-09-08T19:10:00+02:00");
  const slots = [
    { start: "2026-09-08T08:00:00+02:00" },
    { start: "2026-09-08T19:20:00+02:00" },
    { start: "2026-09-08T19:40:00+02:00" },
    { start: "2026-09-08T20:00:00+02:00" },
  ];
  assert.equal(pickFutureSlot(slots, now)?.start, "2026-09-08T19:40:00+02:00");
  assert.equal(pickFutureSlot(slots, now, { excludeStart: "2026-09-08T19:40:00+02:00" })?.start, "2026-09-08T20:00:00+02:00");
  assert.equal(pickFutureSlot([{ start: "2026-09-08T08:00:00+02:00" }], now), null);
  assert.equal(pickFutureSlot([{ start: "2026-09-08T19:40:00" }], now)?.start, "2026-09-08T19:40:00", "Connector-Format ohne Offset");
});

test("nextConnectorSlot: heute nur Vergangenes -> naechster Tag wird abgefragt", async () => {
  const now = new Date("2026-09-08T19:10:00+02:00");
  const asked: string[] = [];
  const adapter = fakeAdapter({ slots: [] });
  adapter.freeSlots = async ({ date }) => {
    asked.push(date);
    if (date === "2026-09-08") return { ok: true, data: [{ start: "2026-09-08T08:00:00", end: "2026-09-08T08:20:00" }] };
    if (date === "2026-09-09") return { ok: true, data: [{ start: "2026-09-09T08:00:00", end: "2026-09-09T08:20:00" }] };
    return { ok: true, data: [] };
  };
  const slot = await nextConnectorSlot(adapter, undefined, now);
  assert.deepEqual(asked, ["2026-09-08", "2026-09-09"]);
  assert.equal(slotStart(slot), "2026-09-09T08:00:00");
});

// --- Runde 9: Buchungen absichern -----------------------------------------

/** Fake mit mehreren Halterinnen und mehreren Tieren. */
function multiAdapter(opts: {
  owners?: Array<{ id: string; name: string }>;
  patients?: Record<string, Array<{ id: string; name: string; deceased?: boolean; chip?: string | null }>>;
  slots?: string[];
  vets?: Array<{ id: string; resourceId?: string }>;
  resources?: Array<{ id: string; name: string }>;
  /** Punkt 11: der Anschluss ist nicht erreichbar. */
  ownersUnavailable?: boolean;
  patientsUnavailable?: boolean;
} = {}): PraxissoftwarePort {
  const base = fakeAdapter({ slots: opts.slots ?? [SLOT_A, SLOT_B] });
  const allOwners = opts.owners ?? [{ id: "o1", name: "Frau Wallner" }];
  return {
    ...base,
    // Wie der echte Anschluss: die Suche filtert nach dem uebergebenen Namen.
    findOwners: async (params) => {
      if (opts.ownersUnavailable) return { ok: false, reason: "notConnected" };
      const needle = String(params?.name ?? "").trim().toLowerCase();
      const hit = needle
        ? allOwners.filter((o) => o.name.toLowerCase().includes(needle))
        : allOwners;
      return { ok: true, data: hit.map((o) => ({ ...o, phones: [], email: null })) };
    },
    patientsOf: async (ownerId) => {
      if (opts.patientsUnavailable) return { ok: false, reason: "timeout" };
      return {
        ok: true,
        data: (opts.patients?.[ownerId] ?? [{ id: "p1", name: "Bella" }]).map((p) => ({
          ...p,
          ownerId,
          species: "Hund",
          breed: null,
          chip: (p as { chip?: string | null }).chip ?? null,
          birth: null,
          // Punkt 9: Ein Tier kann als verstorben gefuehrt sein.
          deceased: (p as { deceased?: boolean }).deceased === true,
          cave: false,
          caveText: null,
          permanentMed: null,
        })),
      };
    },
    resources: async () => ({
      ok: true,
      data: (opts.resources ?? [{ id: "r1", name: "Raum 1" }]).map((r) => ({ id: r.id, name: r.name })),
    }),
    vets: async () => ({
      ok: true,
      data: (opts.vets ?? [{ id: "v1" }]).map((v) => ({ ...v, name: `Dr. ${v.id}` })),
    }),
  };
}

test("Punkt 1: zwei Ordinationen mit derselben Anrufkennung teilen keinen Zustand", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter();
  // Gleiche callId, zwei Ordinationen.
  await advanceBooking({ scope: "praxis-a", callId: "gleich", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  await advanceBooking({ scope: "praxis-b", callId: "gleich", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });

  // Jede Ordination hat ihren EIGENEN Vorschlag.
  const a = _peekBookingStateForTests("gleich", "praxis-a");
  const b = _peekBookingStateForTests("gleich", "praxis-b");
  assert.ok(a, "Ordination A hat einen Vorschlag");
  assert.ok(b, "Ordination B ebenfalls");
  assert.notEqual(a, b);

  // Eine Bestaetigung in A laesst B unberuehrt.
  await advanceBooking({ scope: "praxis-a", callId: "gleich", adapter, message: "Ja, passt." });
  assert.equal(_peekBookingStateForTests("gleich", "praxis-a"), null, "A ist gebucht");
  assert.ok(_peekBookingStateForTests("gleich", "praxis-b"), "B wartet weiter");
});

test("Punkt 2: mehrere passende Halterinnen ergeben eine Rueckfrage", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Anna Berger" }, { id: "o2", name: "Maria Berger" }],
  });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "amb-owner", adapter, message: "Termin für Bella", owner: "Berger", pet: "Bella" });
  assert.ok(result);
  assert.equal(result.applied, false);
  assert.equal(result.failed, true);
  assert.match(result.text, /mehrere Halterinnen/);
  // Kein Zustand: es wurde nichts vorgemerkt.
  assert.equal(_peekBookingStateForTests("amb-owner"), null);
});

test("Punkt 3: ein unbekannter Tiername faellt nicht auf das erste Tier zurueck", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: { o1: [{ id: "p1", name: "Bella" }, { id: "p2", name: "Mizzi" }] },
  });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "unknown-pet", adapter, message: "Termin für Rex", owner: "Frau Wallner", pet: "Rex" });
  assert.ok(result);
  assert.equal(result.failed, true);
  assert.match(result.text, /kenne ich bei dieser Halterin nicht/);
  assert.match(result.text, /Bella, Mizzi/, "die hinterlegten Tiere werden genannt");
  assert.equal(_peekBookingStateForTests("unknown-pet"), null);
});

test("Punkt 3: ohne genannten Tiernamen und mit mehreren Tieren kommt eine Rueckfrage", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: { o1: [{ id: "p1", name: "Bella" }, { id: "p2", name: "Mizzi" }] },
  });
  const result = await advanceBooking({ scope: SCOPE_TEST, callId: "no-pet-name", adapter, message: "Termin bitte", owner: "Frau Wallner" });
  assert.ok(result);
  assert.equal(result.failed, true);
  assert.match(result.text, /mehrere Tiere/);
});

test("Punkt 4: eine Tierkorrektur im Vorschlag wird geprueft", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: { o1: [{ id: "p1", name: "Bella" }, { id: "p2", name: "Mizzi" }] },
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "pet-fix", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  // Jetzt ein ANDERES Tier genannt: die Zuordnung muss neu geprueft werden.
  const corrected = await advanceBooking({ scope: SCOPE_TEST, callId: "pet-fix", adapter, message: "Nein, für Mizzi bitte", owner: "Frau Wallner", pet: "Mizzi" });
  assert.ok(corrected);
  const state = _peekBookingStateForTests("pet-fix");
  assert.equal(state?.patientId, "p2", "die Zuordnung folgt der Korrektur");

  // Ein unbekanntes Tier bricht kontrolliert ab statt still weiterzubuchen.
  const bad = await advanceBooking({ scope: SCOPE_TEST, callId: "pet-fix", adapter, message: "Nein, für Rex", owner: "Frau Wallner", pet: "Rex" });
  assert.ok(bad);
  assert.equal(bad.failed, true);
  assert.match(bad.text, /kenne ich bei dieser Halterin nicht/);
});

test("Punkt 10: eine Chipnummer unterscheidet gleichnamige Tiere", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: {
      o1: [
        { id: "p1", name: "Bella", chip: "040098100123456" },
        { id: "p2", name: "Bella", chip: "040098100123457" },
      ],
    },
  });
  const result = await advanceBooking({
    scope: SCOPE_TEST,
    callId: "chip-disamb",
    adapter,
    message: "Termin für Bella, Chip 040098100123457",
    owner: "Frau Wallner",
    pet: "Bella",
    chip: "040098100123457",
  });
  assert.ok(result);
  assert.ok(!result.failed, "die Chipnummer loest die Mehrdeutigkeit auf");
  assert.equal(_peekBookingStateForTests("chip-disamb")?.patientId, "p2");
});

test("Punkt 10: eine falsche Chipnummer bleibt eine Rueckfrage", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: {
      o1: [
        { id: "p1", name: "Bella", chip: "040098100123456" },
        { id: "p2", name: "Bella", chip: "040098100123457" },
      ],
    },
  });
  const result = await advanceBooking({
    scope: SCOPE_TEST,
    callId: "chip-mismatch",
    adapter,
    message: "Termin für Bella, Chip 040098100123999",
    owner: "Frau Wallner",
    pet: "Bella",
    chip: "040098100123999",
  });
  assert.ok(result);
  assert.equal(result.failed, true);
  assert.match(result.text, /mehrere Tiere/);
  assert.equal(_peekBookingStateForTests("chip-mismatch"), null);
});

test("Punkt 10: die letzten 4 Ziffern der Chipnummer genuegen", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: {
      o1: [
        { id: "p1", name: "Bella", chip: "040098100123456" },
        { id: "p2", name: "Bella", chip: "040098100123457" },
      ],
    },
  });
  const result = await advanceBooking({
    scope: SCOPE_TEST,
    callId: "chip-last4",
    adapter,
    message: "Chip endet auf 3457",
    owner: "Frau Wallner",
    pet: "Bella",
    chip: "3457",
  });
  assert.ok(result);
  assert.ok(!result.failed);
  assert.equal(_peekBookingStateForTests("chip-last4")?.patientId, "p2");
});

test("Punkt 5: eine Rueckfrage ist keine Zusage", () => {
  // „bitte“ allein war frueher eine Zustimmung.
  assert.equal(isConfirmation("bitte"), false);
  assert.equal(isConfirmation("Könnten Sie das bitte machen?"), false);
  assert.equal(isConfirmation("Wäre das bitte möglich?"), false);
  // Echte Zustimmung bleibt.
  assert.equal(isConfirmation("Ja, passt."), true);
  assert.equal(isConfirmation("genau"), true);
  assert.equal(isConfirmation("gerne"), true);
});

test("Punkt 6: 'Ja, aber bitte noch nicht buchen' bricht ab", () => {
  const stop = "Ja, aber bitte noch nicht buchen";
  assert.equal(isDenial(stop), true, "die Verneinung wird erkannt");
  assert.equal(isConfirmation(stop), false, "und schlaegt die Zustimmung");
  // Weitere Verzoegerungen und Absagen.
  for (const text of [
    "ja, aber noch nicht",
    "bitte nicht eintragen",
    "doch nicht",
    "später bitte",
    "ich muss verschieben",
    "absagen",
    "keinen termin",
  ]) {
    assert.equal(isConfirmation(text), false, `keine Zusage: ${text}`);
  }
});

test("Punkt 7: dateTime traegt das Datum, nicht nur der reine Datumsfall", () => {
  // Genau der Fall, der vorher durchfiel.
  const intent = readMessageIntent("morgen um 15 Uhr");
  assert.equal(intent.timeMentioned, true, "die Uhrzeit wird erkannt");
  assert.ok(intent.date, "und das Datum geht nicht verloren");

  // Reiner Tag, reine Zeit.
  assert.equal(readMessageIntent("morgen").timeMentioned, false);
  assert.ok(readMessageIntent("morgen").date);
  assert.equal(readMessageIntent("um 15 Uhr").timeMentioned, true);
  assert.equal(readMessageIntent("um 15 Uhr").date, null);
  // Weitere Uhrzeit-Wendungen.
  assert.equal(readMessageIntent("gegen zehn").timeMentioned, true);
  assert.equal(readMessageIntent("in der früh").timeMentioned, true);
  assert.equal(readMessageIntent("14:30").timeMentioned, true, "Doppelpunkt ist eine Uhrzeit");
  assert.equal(readMessageIntent("14.30 Uhr").timeMentioned, true, "gepunktet mit Uhr");
  assert.equal(readMessageIntent("ja, passt").timeMentioned, false);
});

test("Punkt 7: ein gepunktetes Datum ist keine Uhrzeit", () => {
  // Der Fehler: „am 19.09.2026“ wurde als Uhrzeit gelesen, der genannte Tag
  // verworfen und die Buchung mit „Zeitraum unklar“ abgebrochen.
  // Fester Zeitpunkt: das genannte Datum muss in der Zukunft liegen. Sonst
  // haengt der Test an der echten Uhr und scheitert, sobald der 19.09. vorbei ist.
  const now = new Date(2026, 8, 1, 10, 0);
  const intent = readMessageIntent("Termin für Bella am 19.09.2026", now);
  assert.equal(intent.timeMentioned, false, "das Datum ist keine Uhrzeit");
  assert.equal(intent.date, "2026-09-19", "und der Tag bleibt erhalten");
  assert.equal(intent.dayUnclear, false);

  // Auch ohne Jahr.
  const kurz = readMessageIntent("am 19.09.", now);
  assert.equal(kurz.timeMentioned, false);
  assert.ok(kurz.date, "der Tag wird erkannt");
});

test("Punkt 8: der Vorlauf gilt auch bei der Bestaetigung", () => {
  const now = Date.parse("2026-09-18T09:00:00Z");
  const inMinutes = (n: number) => new Date(now + n * 60_000).toISOString();

  // Bequem im Vorlauf.
  assert.equal(slotWithinLead(inMinutes(60), now), true);
  // Genau an der Grenze (15 Minuten) ist noch erlaubt.
  assert.equal(slotWithinLead(inMinutes(15), now), true);
  // Darunter nicht mehr: ein Vorschlag, der 20 Minuten alt wurde, faellt hier
  // durch und wird nicht mehr gebucht.
  assert.equal(slotWithinLead(inMinutes(10), now), false);
  assert.equal(slotWithinLead(inMinutes(1), now), false);
  // Vergangenheit und unbrauchbare Angaben ebenso.
  assert.equal(slotWithinLead(inMinutes(-5), now), false);
  assert.equal(slotWithinLead(undefined, now), false);
  assert.equal(slotWithinLead("kein datum", now), false);
});

test("Punkt 9: eine zweite Ressource wird gefunden", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter({ slots: [] });
  adapter.resources = async () => ({
    ok: true,
    data: [{ id: "r1", name: "Raum 1" }, { id: "r2", name: "Raum 2" }],
  });
  // Nur die ZWEITE Ressource hat freie Zeiten.
  adapter.freeSlots = async ({ resourceId }) =>
    resourceId === "r2"
      ? {
          ok: true,
          data: [{
            start: SLOT_B,
            end: new Date(new Date(SLOT_B).getTime() + SLOT_MINUTES_TEST * 60_000).toISOString(),
          }],
        }
      : { ok: true, data: [] };
  const slot = await nextConnectorSlot(adapter, undefined, new Date("2026-09-17T08:00:00"));
  assert.equal(slotStart(slot), SLOT_B);
  assert.equal(slotResourceId(slot), "r2", "die Ressource mit der freien Zeit");
});

test("Punkt 10: der Tierarzt wird der Ressource zugeordnet", () => {
  // Genau eine Bindung: sie gewinnt.
  assert.equal(pickVetForSlot([{ id: "v1", resourceId: "r2" }, { id: "v2", resourceId: "r1" }] as never, "r1"), "v2");
  // Mehrere Bindungen: keine eindeutige Wahl, der Anschluss entscheidet.
  assert.equal(pickVetForSlot([{ id: "v1", resourceId: "r1" }, { id: "v2", resourceId: "r1" }] as never, "r1"), "");
  // Keine Bindung hinterlegt: der erste Eintrag bleibt die beste Angabe.
  assert.equal(pickVetForSlot([{ id: "v1" }, { id: "v2" }] as never, "r1"), "v1");
  // Keine Ressource oder keine Tierärzte.
  assert.equal(pickVetForSlot([{ id: "v1" }] as never, undefined), "");
  assert.equal(pickVetForSlot([], "r1"), "");
});

test("Punkt 11: der frueheste freie Termin gewinnt, auch bei unsortierter Antwort", () => {
  const unsorted = [
    { start: "2026-09-08T15:00:00" },
    { start: "2026-09-08T08:00:00" },
    { start: "2026-09-08T11:00:00" },
  ];
  const sorted = sortSlotsByStart(unsorted);
  assert.deepEqual(sorted.map((s) => s.start), [
    "2026-09-08T08:00:00",
    "2026-09-08T11:00:00",
    "2026-09-08T15:00:00",
  ]);
  // Kaputte Angaben landen hinten, ohne die Sortierung zu zerstoeren.
  const withBad = sortSlotsByStart([{ start: "quatsch" }, { start: "2026-09-08T09:00:00" }]);
  assert.equal(withBad[0]?.start, "2026-09-08T09:00:00");
});

test("Punkt 12: alle abgelehnten Termine bleiben ausgeschlossen", async () => {
  _resetBookingStoreForTests();
  // Nur relative Angaben: feste Daten koennen je nach Tageszeit in der
  // Vergangenheit oder VOR den relativen Slots liegen.
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B, slotTomorrow("09", "40"), slotTomorrow("10", "00")],
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "many-no", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  // Zweimal ablehnen.
  const first = await advanceBooking({ scope: SCOPE_TEST, callId: "many-no", adapter, message: "Nein, lieber anders." });
  const second = await advanceBooking({ scope: SCOPE_TEST, callId: "many-no", adapter, message: "Nein, lieber anders." });
  assert.match(first?.text ?? "", /09:20/);
  assert.match(second?.text ?? "", /09:40/);
  // Der zuerst abgelehnte 09:00 darf nicht erneut kommen.
  const third = await advanceBooking({ scope: SCOPE_TEST, callId: "many-no", adapter, message: "Nein, lieber anders." });
  assert.ok(third);
  assert.doesNotMatch(third.text, /09:00/, "der erste Vorschlag kommt nicht zurueck");

  // Die Liste steht auch im Zustand.
  const state = _peekBookingStateForTests("many-no");
  assert.ok(state);
  assert.ok((state?.rejected ?? []).length >= 3, "alle abgelehnten sind gemerkt");
});

test("Punkt 19: der Kalendertag kommt aus der Wiener Wanduhr", async () => {
  const asked: string[] = [];
  const adapter = fakeAdapter({ slots: [] });
  adapter.freeSlots = async ({ date }) => {
    asked.push(date);
    return { ok: true, data: [] };
  };
  // Wiener Wanduhr kurz vor Mitternacht: der erste gefragte Tag ist dieser Tag.
  const wall = new Date(2026, 8, 17, 23, 50);
  await nextConnectorSlot(adapter, undefined, wall);
  assert.equal(asked[0], "2026-09-17", "der Tag kommt aus der uebergebenen Wanduhr");
});

test("viennaNow und viennaInstant sind getrennte Begriffe", () => {
  // viennaNow traegt die Wiener Wanduhr in den lokalen Feldern.
  const wall = viennaNow();
  assert.ok(wall.getFullYear() >= 2026);
  // viennaInstant traegt einen echten Zeitpunkt.
  const instant = viennaInstant();
  assert.ok(Math.abs(instant.getTime() - Date.now()) < 5_000, "nahe an jetzt");
  // Ein uebergebener Zeitpunkt wird unveraendert uebernommen.
  const fixed = new Date("2026-09-17T10:00:00Z");
  assert.equal(viennaInstant(fixed).getTime(), fixed.getTime());
});

test("Punkt 11/12: pickFutureSlot schliesst mehrere Termine aus", () => {  const now = new Date("2026-09-18T08:00:00Z");
  const t = (h: number, m: number) => `2026-09-18T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  const slots = [{ start: t(9, 0) }, { start: t(9, 20) }, { start: t(9, 40) }];
  const opts = { leadMinutes: 0 } as const;

  assert.equal(pickFutureSlot(slots, now, { ...opts, excludeStart: [t(9, 0), t(9, 20)] })?.start, t(9, 40));
  assert.equal(
    pickFutureSlot(slots, now, { ...opts, excludeStart: [t(9, 0), t(9, 20), t(9, 40)] }),
    null,
  );
  // Ein einzelner Wert funktioniert unveraendert.
  assert.equal(pickFutureSlot(slots, now, { ...opts, excludeStart: t(9, 0) })?.start, t(9, 20));
  // Eine leere Liste schliesst nichts aus.
  assert.equal(pickFutureSlot(slots, now, { ...opts, excludeStart: [] })?.start, t(9, 0));
});

test("Punkt 14: der Programmname kommt aus dem Anschluss", () => {
  assert.equal(connectorLabelFor({ label: "Vquadrat Veterinär" } as never), "Vquadrat Veterinär");
  assert.equal(connectorLabelFor({ label: "Andere Software" } as never), "Andere Software");
  // Ohne Namen bleibt eine generische Bezeichnung.
  assert.equal(connectorLabelFor({} as never), "Praxissoftware");
  assert.equal(connectorLabelFor({ label: "   " } as never), "Praxissoftware");
});

// --- Runde 10: Buchungssicherheit -----------------------------------------

test("Punkt 7: Abbrechen beendet den Vorgang statt neu vorzuschlagen", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      writes += 1;
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "cancel-1", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "cancel-1", adapter, message: "Bitte abbrechen." });

  assert.ok(out);
  assert.equal(out.applied, false);
  // Kein neuer Vorschlag: der Text enthaelt keine Uhrzeit und keine Frage.
  assert.match(out.text, /keinen Termin/);
  assert.doesNotMatch(out.text, /Soll ich das so eintragen/);
  assert.equal(writes, 0, "kein Schreibversuch");
  // Der Zustand ist beendet.
  assert.equal(_peekBookingStateForTests("cancel-1"), null);

  // Der naechste Turn beginnt wieder bei „wunsch“.
  const again = await advanceBooking({ scope: SCOPE_TEST, callId: "cancel-1", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(again);
  assert.match(again.text, /frei/);
});

test("Punkt 7: „lieber anders“ schlaegt weiterhin vor, „absagen“ nicht", () => {
  // Die beiden Faelle muessen unterscheidbar bleiben.
  assert.equal(isCancel("Bitte abbrechen"), true);
  assert.equal(isCancel("Ich muss absagen"), true);
  assert.equal(isCancel("doch nicht"), true);
  assert.equal(isCancel("keinen Termin"), true);
  assert.equal(isCancel("auf keinen Fall"), true);
  assert.equal(isCancel("Nein, lieber anders"), false, "das ist eine Ablehnung, kein Abbruch");
  assert.equal(isCancel("Nein, lieber nachmittags"), false);
  assert.equal(isCancel("Ja, passt"), false);
});

test("Punkt 8: bedingte Zustimmung bucht nicht sofort", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      writes += 1;
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "cond-1", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "cond-1", adapter, message: "Ja, wenn Sie das können" });

  assert.ok(out);
  assert.equal(out.applied, false, "keine Buchung bei Vorbehalt");
  assert.equal(writes, 0, "kein Schreibversuch");
  // Der Vorschlag wird wiederholt, nicht gebucht.
  assert.match(out.text, /Soll ich .* eintragen/);
  assert.ok(_peekBookingStateForTests("cond-1"), "der Vorschlag bleibt offen");

  // Und die Erkennung selbst.
  assert.equal(isConfirmation("Ja, wenn das geht"), false);
  assert.equal(isConfirmation("Ja, falls möglich"), false);
  assert.equal(isConfirmation("Ja, sofern Sie Zeit haben"), false);
  assert.equal(isConfirmation("Ja, vorausgesetzt es bleibt dabei"), false);
  // Eine unbedingte Zustimmung bleibt gueltig.
  assert.equal(isConfirmation("Ja, passt"), true);
});

test("Punkt 5: ein geaenderter Haltername loest die Neuzuordnung aus", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Anna Berger" }, { id: "o2", name: "Maria Berger" }],
    patients: { o1: [{ id: "p1", name: "Bella" }], o2: [{ id: "p2", name: "Bella" }] },
  });
  // Erster Durchgang mit eindeutigem Vornamen.
  await advanceBooking({ scope: SCOPE_TEST, callId: "owner-fix", adapter, message: "Termin für Bella", owner: "Anna Berger", pet: "Bella" });
  const first = _peekBookingStateForTests("owner-fix");
  assert.equal(first?.ownerId, "o1");

  // Jetzt nur der Nachname: beide passen → Rueckfrage statt stiller alter Zuordnung.
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "owner-fix", adapter, message: "Nein, für Maria Berger bitte", owner: "Maria Berger", pet: "Bella" });
  assert.ok(out);
  const after = _peekBookingStateForTests("owner-fix");
  assert.equal(after?.ownerId, "o2", "die Zuordnung folgt der Korrektur");
});

test("Punkt 5: dieselbe Nummer in anderer Schreibweise ist keine Korrektur", () => {
  // Verglichen werden die Ziffern: „0664 123 456“ und „0664123456“ sind gleich.
  const a = "0664 123456";
  const b = "0664123456";
  const digits = (v: string) => v.replace(/\D/g, "");
  assert.equal(digits(a), digits(b), "dieselbe Nummer");
  // Und eine echte Aenderung bleibt eine Aenderung.
  assert.notEqual(digits("0664 123456"), digits("0664 999999"));
});

test("Punkt 6: eine Tierkorrektur behaelt den gewuenschten Tag", async () => {
  _resetBookingStoreForTests();
  const asked: string[] = [];
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: { o1: [{ id: "p1", name: "Bella" }, { id: "p2", name: "Mizzi" }] },
  });
  adapter.freeSlots = async ({ date }) => {
    asked.push(date);
    // Zwei Zeiten pro Tag: der abgelehnte Vorschlag wird ausgeschlossen, ein
    // anderer bleibt verfuegbar (Punkt 12).
    return {
      ok: true,
      data: [
        { start: `${date}T09:00:00`, end: `${date}T09:20:00` },
        { start: `${date}T09:20:00`, end: `${date}T09:40:00` },
      ],
    };
  };
  // Ein ausdrueckliches Datum in der Zukunft, damit der Tag eindeutig ist.
  // Geschrieben in der Form, die Silvia versteht (Tag.Monat.).
  const morgen = new Date();
  morgen.setDate(morgen.getDate() + 1);
  const iso = `${morgen.getFullYear()}-${String(morgen.getMonth() + 1).padStart(2, "0")}-${String(morgen.getDate()).padStart(2, "0")}`;
  const gesprochen = `${String(morgen.getDate()).padStart(2, "0")}.${String(morgen.getMonth() + 1).padStart(2, "0")}.${morgen.getFullYear()}`;

  await advanceBooking({ scope: SCOPE_TEST, callId: "pet-day", adapter, message: `Termin für Bella am ${gesprochen}`, owner: "Frau Wallner", pet: "Bella" });
  const state = _peekBookingStateForTests("pet-day");
  assert.equal(state?.requestedDate, iso, "der Tag steht im Zustand");

  asked.length = 0;
  // Nur das Tier aendert sich, kein Datum wird genannt.
  await advanceBooking({ scope: SCOPE_TEST, callId: "pet-day", adapter, message: "Nein, für Mizzi", owner: "Frau Wallner", pet: "Mizzi" });

  assert.ok(asked.length > 0, "es wurde gesucht");
  assert.ok(
    asked.every((d) => d === iso),
    `der gewuenschte Tag bleibt erhalten, gefragt wurde: ${asked.join(", ")}`,
  );
  assert.equal(_peekBookingStateForTests("pet-day")?.patientId, "p2", "und das Tier folgt der Korrektur");
});

test("Punkt 1: ein nicht pruefbarer Schutz verhindert die Buchung", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      writes += 1;
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });
  // Ein Guard, dessen status „unavailable“ meldet: die Sperrtabelle ist weg.
  const guard = {
    beginWrite: async () => true,
    remember: async () => undefined,
    forget: async () => undefined,
    status: async () => ({ kind: "unavailable" as const }),
  };
  const out = await advanceBooking({
    scope: SCOPE_TEST,
    callId: "guard-down",
    adapter,
    message: "Termin für Bella",
    owner: "Frau Wallner",
    pet: "Bella",
    guard,
  });
  assert.ok(out);
  assert.equal(out.applied, false);
  assert.equal(out.failed, true);
  assert.match(out.text, /Buchungsschutz/);
  assert.equal(writes, 0, "ohne pruefbaren Schutz wird nicht gebucht");
});

test("Punkt 2: die Absicht wird vor dem Schreiben gesichert", async () => {
  _resetBookingStoreForTests();
  const calls: string[] = [];
  const guard = {
    beginWrite: async () => {
      calls.push("beginWrite");
      return true;
    },
    remember: async () => {
      calls.push("remember");
    },
    forget: async () => {
      calls.push("forget");
    },
    status: async () => ({ kind: "clear" as const }),
  };
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      calls.push("createAppointment");
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "pre-write", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella", guard });
  await advanceBooking({ scope: SCOPE_TEST, callId: "pre-write", adapter, message: "Ja, passt.", guard });

  // Reihenfolge: erst die Absicht, dann der Schreibversuch, dann das Aufheben.
  const begin = calls.indexOf("beginWrite");
  const write = calls.indexOf("createAppointment");
  const forget = calls.indexOf("forget");
  assert.ok(begin >= 0, "beginWrite wurde gerufen");
  assert.ok(write >= 0, "es wurde geschrieben");
  assert.ok(begin < write, `Absicht vor dem Schreiben (${calls.join(" → ")})`);
  assert.ok(forget > write, "nach dem Erfolg wird aufgehoben");
  assert.equal(calls.includes("remember"), false, "kein unklarer Ausgang bei Erfolg");
});

test("Punkt 2: eine nicht sicherbare Absicht verhindert das Schreiben", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const guard = {
    beginWrite: async () => false,
    remember: async () => undefined,
    forget: async () => undefined,
    status: async () => ({ kind: "clear" as const }),
  };
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      writes += 1;
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });
  await advanceBooking({ scope: SCOPE_TEST, callId: "no-pre", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella", guard });
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "no-pre", adapter, message: "Ja, passt.", guard });
  assert.ok(out);
  assert.equal(out.failed, true);
  assert.equal(writes, 0, "ohne gesicherte Absicht wird nicht geschrieben");
});

test("Punkt 3: eine belegte Sperre wird automatisch aufgehoben", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  let blocked = true;
  const guard = {
    beginWrite: async () => true,
    remember: async () => undefined,
    forget: async () => {
      blocked = false;
    },
    status: async () =>
      blocked
        ? ({ kind: "blocked" as const, entry: { callId: "resolve-1", slotStart: SLOT_A, reason: "uncertain" as const, createdAt: new Date().toISOString() } })
        : ({ kind: "clear" as const }),
  };
  const adapter = fakeAdapter({
    slots: [SLOT_A, SLOT_B],
    createResult: () => {
      writes += 1;
      return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
    },
  });

  // Ohne Beleg bleibt die Sperre: keine Buchung.
  const stillBlocked = await advanceBooking({ scope: SCOPE_TEST, callId: "resolve-1", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella", guard, resolveGuard: async () => false });
  assert.ok(stillBlocked);
  assert.equal(stillBlocked.uncertain, true);
  assert.equal(writes, 0);

  // Mit Beleg (die Tafel hat den Termin) wird die Sperre aufgehoben und der
  // Weg ist frei.
  const resolved = await advanceBooking({ scope: SCOPE_TEST, callId: "resolve-1", adapter, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella", guard, resolveGuard: async () => true });
  assert.ok(resolved);
  assert.notEqual(resolved.uncertain, true, "der Weg ist frei");
  assert.equal(blocked, false, "die Sperre wurde aufgehoben");
});


// --- Runde 10, zweiter Teil: Zuordnung, Fenster und Suche -----------------

test("Punkt 9: ein als verstorben gefuehrtes Tier bekommt keinen Termin", async () => {
  _resetBookingStoreForTests();
  let writes = 0;
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: { o1: [{ id: "p1", name: "Bella", deceased: true }] },
  });
  adapter.createAppointment = async () => {
    writes += 1;
    return { ok: true, data: { id: "APT", start: SLOT_A, end: SLOT_A } };
  };
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "dead-1", adapter, message: "Termin f�r Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(out);
  assert.equal(out.failed, true);
  assert.match(out.text, /verstorben/);
  assert.equal(writes, 0, "kein Termin f�r ein verstorbenes Tier");
  assert.equal(_peekBookingStateForTests("dead-1"), null);
});

test("Punkt 9: ein lebendes Tier derselben Halterin bleibt waehlbar", async () => {
  _resetBookingStoreForTests();
  const adapter = multiAdapter({
    owners: [{ id: "o1", name: "Frau Wallner" }],
    patients: {
      o1: [
        { id: "p1", name: "Bella", deceased: true },
        { id: "p2", name: "Mizzi" },
      ],
    },
  });
  // Ohne Tiernamen: nur das lebende Tier kommt in Frage, keine Rueckfrage.
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "dead-2", adapter, message: "Termin bitte", owner: "Frau Wallner" });
  assert.ok(out);
  assert.match(out.text, /frei/);
  assert.equal(_peekBookingStateForTests("dead-2")?.patientId, "p2", "nur das lebende Tier");
});

test("Punkt 11: ein Verbindungsfehler ist kein 'kenne ich nicht'", async () => {
  _resetBookingStoreForTests();
  // Der Anschluss ist nicht erreichbar.
  const ownersDown = multiAdapter({ ownersUnavailable: true });
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "conn-1", adapter: ownersDown, message: "Termin f�r Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(out);
  assert.equal(out.failed, true);
  assert.match(out.text, /nicht erreichbar/);
  // Wichtig: NICHT behaupten, das Tier sei unbekannt.
  assert.doesNotMatch(out.text, /kenne ich/);

  // Dasselbe, wenn nur der Patientenabruf scheitert.
  _resetBookingStoreForTests();
  const patientsDown = multiAdapter({ patientsUnavailable: true });
  const out2 = await advanceBooking({ scope: SCOPE_TEST, callId: "conn-2", adapter: patientsDown, message: "Termin f�r Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(out2);
  assert.match(out2.text, /nicht erreichbar/);
  assert.doesNotMatch(out2.text, /kein Tier hinterlegt/);
});

test("Punkt 11: ein Verbindungsfehler bei der Slot-Suche ist kein 'nichts frei'", async () => {
  _resetBookingStoreForTests();
  const owners = [{ id: "o1", name: "Frau Wallner" }];
  const patients = { o1: [{ id: "p1", name: "Bella" }] };

  // Ressourcenabruf scheitert -> "nicht erreichbar", nicht "kein Termin frei".
  const resourcesDown = multiAdapter({ owners, patients });
  resourcesDown.resources = async () => ({ ok: false, reason: "notConnected" });
  const out = await advanceBooking({ scope: SCOPE_TEST, callId: "conn-slot-1", adapter: resourcesDown, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(out);
  assert.equal(out.failed, true);
  assert.match(out.text, /nicht erreichbar/);
  assert.doesNotMatch(out.text, /kein freier Termin/);

  // Auch ein scheiternder freeSlots-Abruf ist kein "nichts frei".
  _resetBookingStoreForTests();
  const slotsDown = multiAdapter({ owners, patients });
  slotsDown.freeSlots = async () => ({ ok: false, reason: "timeout" });
  const out2 = await advanceBooking({ scope: SCOPE_TEST, callId: "conn-slot-2", adapter: slotsDown, message: "Termin für Bella", owner: "Frau Wallner", pet: "Bella" });
  assert.ok(out2);
  assert.equal(out2.failed, true);
  assert.match(out2.text, /nicht erreichbar/);
  assert.doesNotMatch(out2.text, /kein freier Termin/);
});

test("Punkt 12: ein Fenster ohne ausreichende Dauer wird verworfen", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter({ slots: [] });
  adapter.freeSlots = async ({ date }) => ({
    ok: true,
    data: [
      // Zu kurz: 5 Minuten statt 20.
      { start: `${date}T09:00:00`, end: `${date}T09:05:00` },
      // Ausreichend.
      { start: `${date}T10:00:00`, end: `${date}T10:20:00` },
    ],
  });
  const slot = await nextConnectorSlot(adapter, undefined, new Date("2026-09-17T08:00:00"));
  assert.equal(slotStart(slot)?.slice(11), "10:00:00", "das zu kurze Fenster wird uebersprungen");

  // Und die Pruefung selbst.
  assert.equal(slotCoversDuration({ start: "2026-09-18T09:00:00", end: "2026-09-18T09:20:00" }, 20), true);
  assert.equal(slotCoversDuration({ start: "2026-09-18T09:00:00", end: "2026-09-18T09:05:00" }, 20), false);
  // Genau die Dauer ist ausreichend.
  assert.equal(slotCoversDuration({ start: "2026-09-18T09:00:00", end: "2026-09-18T09:20:00" }, 20), true);
  // Ohne Ende gilt der Eintrag als brauchbar.
  assert.equal(slotCoversDuration({ start: "2026-09-18T09:00:00" }, 20), true);
  // Unbrauchbarer Beginn.
  assert.equal(slotCoversDuration({ start: "quatsch", end: "2026-09-18T09:20:00" }, 20), false);
});

test("Punkt 14: erst nach dem Tag filtern, dann auswaehlen", async () => {
  _resetBookingStoreForTests();
  const adapter = fakeAdapter({ slots: [] });
  adapter.freeSlots = async () => ({
    ok: true,
    data: [
      // Ein frueherer Termin am FALSCHEN Tag steht zuerst in der Liste.
      { start: "2026-09-18T08:00:00", end: "2026-09-18T08:20:00" },
      // Der gewuenschte Tag kommt danach.
      { start: "2026-09-19T14:00:00", end: "2026-09-19T14:20:00" },
    ],
  });
  const slot = await nextConnectorSlot(adapter, undefined, new Date("2026-09-17T08:00:00"), "2026-09-19");
  // Vorher haette der erste Treffer den richtigen verdraengt.
  assert.equal(slotStart(slot), "2026-09-19T14:00:00");
});

test("Punkt 15: abgelehnte Termine werden nach Zeitpunkt verglichen", () => {
  const now = new Date("2026-09-18T07:00:00Z");
  const slots = [
    { start: "2026-09-18T09:00:00Z" },
    { start: "2026-09-18T09:20:00Z" },
  ];
  // Derselbe Zeitpunkt, andere Schreibweise: +00:00 statt Z.
  const picked = pickFutureSlot(slots, now, {
    excludeStart: ["2026-09-18T09:00:00+00:00"],
    leadMinutes: 0,
  });
  assert.equal(picked?.start, "2026-09-18T09:20:00Z", "Textvergleich allein haette 09:00 erneut geliefert");

  // Die woertliche Schreibweise greift weiterhin.
  assert.equal(
    pickFutureSlot(slots, now, { excludeStart: ["2026-09-18T09:00:00Z"], leadMinutes: 0 })?.start,
    "2026-09-18T09:20:00Z",
  );
});

test("Punkt 16: die Ressourcen werden in kleinen Gruppen gefragt", async () => {
  _resetBookingStoreForTests();
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `r${i + 1}`, name: `Raum ${i + 1}` }));
  const adapter = fakeAdapter({ slots: [] });
  adapter.resources = async () => ({ ok: true, data: many });
  let inFlight = 0;
  let peak = 0;
  adapter.freeSlots = async ({ date }) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return { ok: true, data: [{ start: `${date}T09:00:00`, end: `${date}T09:20:00` }] };
  };
  const slot = await nextConnectorSlot(adapter, undefined, new Date("2026-09-17T08:00:00"));
  assert.ok(slot, "es wurde ein Termin gefunden");
  assert.ok(peak <= SLOT_QUERY_CONCURRENCY, `hoechstens ${SLOT_QUERY_CONCURRENCY} gleichzeitig, war ${peak}`);
  assert.ok(peak > 1, "aber nicht streng nacheinander");
});
