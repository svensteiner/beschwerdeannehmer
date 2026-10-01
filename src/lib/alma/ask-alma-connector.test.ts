import assert from "node:assert/strict";
import { test } from "node:test";
import { connectorPatientsFor, connectorSlotFor, mapConnectorPatient } from "./ask-alma.ts";
import {
  notConnectedRead,
  notConnectedWrite,
  type ConnectorCapabilities,
  type PraxissoftwarePort,
} from "@/lib/practice/praxissoftware.ts";

function fakePort(overrides: Partial<PraxissoftwarePort>): PraxissoftwarePort {
  return {
    kind: "vquadrat",
    label: "Vquadrat Veterinär",
    host: "other-pc",
    sendAkte: () => ({ ok: false, reason: "notConnected" }),
    sendSlot: () => ({ ok: false, reason: "notConnected" }),
    sendKontakt: () => ({ ok: false, reason: "notConnected" }),
    createAppointment: async () => notConnectedWrite(),
    health: async () => notConnectedRead(),
    capabilities: async () => notConnectedRead(),
    findOwners: async () => notConnectedRead(),
    patientsOf: async () => notConnectedRead(),
    resources: async () => notConnectedRead(),
    vets: async () => notConnectedRead(),
    freeSlots: async () => notConnectedRead(),
    hours: async () => notConnectedRead(),
    ...overrides,
  };
}

const FULL_CAPS: ConnectorCapabilities = {
  read: { owners: true, patients: true, slots: true, vets: true, hours: true },
  write: { appointment: false },
};

test("mapConnectorPatient maps a Connector Akte into Silvia's Patient shape, no invented fields", () => {
  const owner = { id: "1402", name: "Zapletal", phones: ["0680/1211520"], email: null };
  const patient = mapConnectorPatient(owner, {
    id: "p1",
    ownerId: "1402",
    name: "Rex",
    species: "Hund",
    breed: null,
    chip: "040012345678901",
    birth: "2019",
    deceased: false,
    cave: true,
    caveText: "beißt beim Ohren-Check",
    permanentMed: null,
  });
  assert.equal(patient.name, "Rex");
  assert.equal(patient.owner, "Zapletal");
  assert.equal(patient.phone, "0680/1211520");
  assert.equal(patient.chip, "040012345678901");
  assert.equal(patient.born, "2019");
  assert.equal(patient.breed, "");
  assert.equal(patient.species, "Hund");
  assert.match(patient.notes, /Cave: beißt beim Ohren-Check/);
  assert.doesNotMatch(patient.notes, /verstorben/);
  assert.equal(patient.registered, false);
  assert.equal(patient.source, "stamm");
});

test("mapConnectorPatient falls back to Heimtier / unbekannt fields it may never guess, marks deceased", () => {
  const owner = { id: "9", name: "Huber", phones: [], email: null };
  const patient = mapConnectorPatient(owner, {
    id: "p9",
    ownerId: "9",
    name: "Minka",
    species: null,
    breed: null,
    chip: null,
    birth: null,
    deceased: true,
    cave: false,
    caveText: null,
    permanentMed: "Insulin 2x tgl",
  });
  assert.equal(patient.species, "Heimtier");
  assert.equal(patient.chip, "");
  assert.equal(patient.phone, "");
  assert.equal(patient.lastVaccine, "unbekannt");
  assert.equal(patient.rabies, "unbekannt");
  assert.match(patient.notes, /Dauermedikation: Insulin 2x tgl/);
  assert.match(patient.notes, /verstorben/);
});

test("connectorPatientsFor returns [] without a phone/name needle — never dumps a full search", async () => {
  const port = fakePort({ capabilities: async () => ({ ok: true, data: FULL_CAPS }) });
  const out = await connectorPatientsFor(port, "guten Tag, ich hätte gern einen Termin");
  assert.deepEqual(out, []);
});

test("connectorPatientsFor finds owner by phone, then maps every patient of that owner", async () => {
  const port = fakePort({
    capabilities: async () => ({ ok: true, data: FULL_CAPS }),
    findOwners: async (params) => {
      assert.equal(params.phone, "06801211520");
      return { ok: true, data: [{ id: "1402", name: "Zapletal", phones: ["0680/1211520"], email: null }] };
    },
    patientsOf: async (ownerId) => {
      assert.equal(ownerId, "1402");
      return {
        ok: true,
        data: [
          {
            id: "p1",
            ownerId: "1402",
            name: "Rex",
            species: "Hund",
            breed: null,
            chip: null,
            birth: null,
            deceased: false,
            cave: false,
            caveText: null,
            permanentMed: null,
          },
        ],
      };
    },
  });
  const out = await connectorPatientsFor(port, "hier ist Frau Zapletal, 0680 1211520");
  assert.equal(out.length, 1);
  assert.equal(out[0]?.name, "Rex");
  assert.equal(out[0]?.owner, "Zapletal");
});

test("connectorPatientsFor stays empty when the Connector lacks owners/patients capability", async () => {
  const port = fakePort({
    capabilities: async () => ({
      ok: true,
      data: { read: { owners: false, patients: true, slots: false, vets: false, hours: false }, write: { appointment: false } },
    }),
  });
  const out = await connectorPatientsFor(port, "0680 1211520");
  assert.deepEqual(out, []);
});

test("connectorPatientsFor resolves to [] on a Connector error, never throws", async () => {
  const port = fakePort({
    capabilities: async () => ({ ok: false, reason: "timeout" }),
  });
  const out = await connectorPatientsFor(port, "0680 1211520");
  assert.deepEqual(out, []);
});

test("connectorSlotFor returns null when the adapter cannot do slots — caller falls back to slotFor()", async () => {
  const port = fakePort({
    capabilities: async () => ({
      ok: true,
      data: { read: { owners: true, patients: true, slots: false, vets: true, hours: true }, write: { appointment: false } },
    }),
  });
  assert.equal(await connectorSlotFor(port), null);
});

test("connectorSlotFor formats the first freeSlots() hit like slotFor()", async () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  const port = fakePort({
    capabilities: async () => ({ ok: true, data: FULL_CAPS }),
    resources: async () => ({ ok: true, data: [{ id: "r1", name: "Raum 1" }] }),
    freeSlots: async (params) => {
      assert.equal(params.resourceId, "r1");
      // Punkt 12: Der Anschluss liefert ein Fenster mit Dauer, nicht end === start.
      const end = new Date(new Date(future).getTime() + 20 * 60_000).toISOString();
      return { ok: true, data: [{ start: future, end }] };
    },
  });
  const label = await connectorSlotFor(port);
  assert.equal(typeof label, "string");
  assert.match(label ?? "", /um \d{2}:\d{2}/);
});
