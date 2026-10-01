import assert from "node:assert/strict";
import { test } from "node:test";
import { PMS_OPTIONS as DATA_PMS_OPTIONS } from "../alma/data.ts";
import {
  hasPraxissoftwareAdapter,
  notConnected,
  PMS_DEFAULT,
  PMS_HINT_ID,
  PMS_OPTIONS,
  PRESENTATION_HOST,
  PRAXISSOFTWARE_HINT,
  bridgePraxissoftware,
  praxissoftwareFor,
  praxissoftwareKindOf,
  VQUADRAT_KIND,
  VQUADRAT_LABEL,
} from "./praxissoftware.ts";
import { APPOINTMENT_STATUSES } from "./desk-status.ts";
import { connectorPraxissoftwarePort } from "./praxissoftware-connector.ts";
import {
  isVquadratPartnerPort,
  vquadratAdapter,
  vquadratAdminNeeds,
  vquadratBindableProtocol,
  vquadratPublicSurface,
  VQUADRAT_ADMIN_NEEDS,
  VQUADRAT_PARTNER_PORTS,
  VQUADRAT_PUBLIC_SOURCE,
  VQUADRAT_STORE,
  VQUADRAT_VENDOR,
  VQUADRAT_TAFEL_AKTE,
  VQUADRAT_TAFEL_KONTAKT,
  VQUADRAT_TAFEL_SLOT,
  vquadratFelderOffen,
} from "./vquadrat/index.ts";
import angebotBeispiel from "./vquadrat/angebot.beispiel.json" with { type: "json" };

test("Vquadrat Veterinär is the first listed Praxissoftware and the only adapter", () => {
  assert.equal(PMS_OPTIONS[0], VQUADRAT_LABEL);
  assert.equal(VQUADRAT_KIND, "vquadrat");
  assert.equal(VQUADRAT_LABEL, "Vquadrat Veterinär");
  assert.equal(PMS_DEFAULT, VQUADRAT_LABEL);
  assert.deepEqual([...PMS_OPTIONS], [...DATA_PMS_OPTIONS]);
  assert.ok(PMS_OPTIONS.includes("vetera"));
  assert.ok(PMS_OPTIONS.includes("easyVET"));
  assert.ok(PMS_OPTIONS.includes("pentavèt"));
  assert.equal(praxissoftwareKindOf(VQUADRAT_LABEL), VQUADRAT_KIND);
  assert.equal(praxissoftwareKindOf("vquadrat"), VQUADRAT_KIND);
  assert.equal(praxissoftwareKindOf("vetera"), null);
  assert.equal(praxissoftwareKindOf("easyVET"), null);
  assert.equal(hasPraxissoftwareAdapter("vetera"), false);
  assert.equal(hasPraxissoftwareAdapter(VQUADRAT_LABEL), true);
  assert.equal(praxissoftwareFor("vetera"), null);
  assert.equal(praxissoftwareFor("easyVET"), null);
  const port = praxissoftwareFor(VQUADRAT_KIND);
  assert.ok(port);
  assert.equal(port.kind, VQUADRAT_KIND);
  assert.equal(port.label, VQUADRAT_LABEL);
  const adapter = vquadratAdapter();
  assert.equal(adapter.kind, VQUADRAT_KIND);
  assert.equal(PRESENTATION_HOST, "laptop");
  assert.equal(adapter.host, PRESENTATION_HOST);
  assert.equal(port.host, PRESENTATION_HOST);
  assert.deepEqual(
    bridgePraxissoftware("vetera", {
      slot: { start: "2026-09-02T08:00:00+02:00" },
    }),
    {
      skipped: true,
    },
  );
  assert.deepEqual(
    bridgePraxissoftware(VQUADRAT_LABEL, {
      akte: { pet: "Bella", owner: "Frau Wallner" },
      slot: {
        start: "2026-09-02T08:00:00+02:00",
        pet: "Bella",
        owner: "Frau Wallner",
        reason: "Kontrolle",
        status: "bestätigt",
      },
      kontakt: { owner: "Frau Wallner", phone: "0316 73 59 40" },
    }),
    notConnected(),
  );
  const akte = adapter.sendAkte({ pet: "Bella", owner: "Frau Wallner" });
  const slot = adapter.sendSlot({
    start: "2026-09-02T08:00:00+02:00",
    status: "abgesagt",
  });
  const kontakt = adapter.sendKontakt({ phone: "0316 73 59 40" });
  assert.deepEqual(akte, { ok: false, reason: "notConnected" });
  assert.deepEqual(slot, notConnected());
  assert.deepEqual(kontakt, notConnected());
  assert.deepEqual(
    [...APPOINTMENT_STATUSES],
    ["gelegt", "bestätigt", "abgesagt"],
  );
  assert.equal(PMS_HINT_ID, "pms-hint");
  assert.match(PRAXISSOFTWARE_HINT, /Vquadrat Veterinär/);
  assert.match(PRAXISSOFTWARE_HINT, /dieselbe Schnittstelle/);
  assert.doesNotMatch(PRAXISSOFTWARE_HINT, /zwei.?wege|sync|REST|Twilio|SMTP/i);
});

test("public Vquadrat surface names partner ports and SQL without binding them", () => {
  const surface = vquadratPublicSurface();
  assert.equal(surface.source, VQUADRAT_PUBLIC_SOURCE);
  assert.equal(surface.vendor, VQUADRAT_VENDOR);
  assert.equal(surface.store, VQUADRAT_STORE);
  assert.match(surface.store, /SQL/);
  assert.doesNotMatch(surface.store, /dsn|odbc|connection|jdbc|host=/i);
  assert.deepEqual(
    [...surface.modules],
    ["Kalender", "Kundenverwaltung", "Patientenverwaltung"],
  );
  assert.ok(surface.partnerPorts.includes("Idexx Vetlab Station Interlink"));
  assert.ok(surface.partnerPorts.includes("ELORD (Richter Pharma)"));
  assert.ok(surface.partnerPorts.includes("Laboklin"));
  assert.ok(surface.partnerPorts.includes("Animaldata.com"));
  assert.equal(surface.bindable, null);
  assert.equal(vquadratBindableProtocol(), null);
  assert.equal(
    vquadratBindableProtocol("Idexx Vetlab Station Interlink"),
    null,
  );
  assert.equal(vquadratBindableProtocol("ELORD (Richter Pharma)"), null);
  assert.deepEqual([...vquadratAdminNeeds()], [...VQUADRAT_ADMIN_NEEDS]);
  assert.ok(VQUADRAT_ADMIN_NEEDS.includes("reception-port-kind"));
  assert.ok(VQUADRAT_ADMIN_NEEDS.includes("kunde-patient-termin-fields"));
  assert.ok(VQUADRAT_ADMIN_NEEDS.includes("redacted-sample"));
  for (const port of VQUADRAT_PARTNER_PORTS) {
    assert.equal(isVquadratPartnerPort(port), true);
    assert.equal(praxissoftwareKindOf(port), null);
    assert.equal(hasPraxissoftwareAdapter(port), false);
    assert.equal(praxissoftwareFor(port), null);
    assert.deepEqual(
      bridgePraxissoftware(port, {
        slot: { start: "2026-09-02T08:00:00+02:00" },
      }),
      {
        skipped: true,
      },
    );
  }
  assert.equal(isVquadratPartnerPort("Vquadrat Veterinär"), false);
  assert.equal(isVquadratPartnerPort("vetera"), false);
  assert.equal(adapterStillOffline(), true);
});

test("Vquadrat daten stay Tafel names until the admin fills vendor fields", () => {
  const offen = vquadratFelderOffen();
  assert.ok(offen.length >= 10);
  for (const row of offen) {
    assert.equal(row.vquadrat, null);
    assert.ok(row.tafel);
  }
  assert.equal(VQUADRAT_TAFEL_AKTE.pet.tafel, "pet");
  assert.equal(VQUADRAT_TAFEL_SLOT.status.tafel, "status");
  assert.equal(VQUADRAT_TAFEL_KONTAKT.phone.tafel, "phone");
  assert.equal(angebotBeispiel.quelle, "tafel");
  assert.equal(angebotBeispiel.host, "laptop");
  assert.equal(angebotBeispiel.verbunden, false);
  assert.equal(angebotBeispiel.vquadrat, null);
  assert.equal(angebotBeispiel.akte.pet, "Bella");
  assert.equal(angebotBeispiel.slot.status, "gelegt");
});

function adapterStillOffline() {
  const adapter = vquadratAdapter();
  return (
    adapter.sendAkte({ pet: "Bella" }).reason === "notConnected" &&
    adapter.sendSlot({ start: "2026-09-02T08:00:00+02:00" }).reason ===
      "notConnected" &&
    adapter.sendKontakt({ owner: "Frau Wallner" }).reason === "notConnected"
  );
}

test("stub Vquadrat adapter answers notConnected for every read method too", async () => {
  const adapter = vquadratAdapter({});
  assert.equal(adapter.kind, VQUADRAT_KIND);
  assert.deepEqual(await adapter.health(), {
    ok: false,
    reason: "notConnected",
  });
  assert.deepEqual(await adapter.capabilities(), {
    ok: false,
    reason: "notConnected",
  });
  assert.deepEqual(await adapter.findOwners({ phone: "0664" }), {
    ok: false,
    reason: "notConnected",
  });
  assert.deepEqual(await adapter.patientsOf("o1"), {
    ok: false,
    reason: "notConnected",
  });
  assert.deepEqual(await adapter.resources(), {
    ok: false,
    reason: "notConnected",
  });
  assert.deepEqual(await adapter.vets(), { ok: false, reason: "notConnected" });
  assert.deepEqual(
    await adapter.freeSlots({
      date: "2026-09-07",
      resourceId: "r1",
      minutes: 20,
    }),
    { ok: false, reason: "notConnected" },
  );
  assert.deepEqual(await adapter.hours(), {
    ok: false,
    reason: "notConnected",
  });
});

test("Connector-backed Vquadrat adapter reads from silvia-connector via fetch", async (t) => {
  const calls: { url: string; auth: string | undefined }[] = [];
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)
      ?.Authorization;
    calls.push({ url, auth });
    if (url.endsWith("/health")) {
      return new Response(
        JSON.stringify({
          ok: true,
          adapter: "vquadrat",
          readOnly: true,
          version: "0.1.0",
        }),
        {
          status: 200,
        },
      );
    }
    if (url.includes("/owners?")) {
      return new Response(
        JSON.stringify([
          {
            id: "1402",
            name: "Zapletal",
            phones: ["0680/1211520"],
            email: null,
          },
        ]),
        { status: 200 },
      );
    }
    if (url === "http://127.0.0.1:8765/nope") {
      return new Response(
        JSON.stringify({ error: "no", code: "UNAUTHORIZED" }),
        { status: 401 },
      );
    }
    return new Response(
      JSON.stringify({ error: "not found", code: "NOT_FOUND" }),
      { status: 404 },
    );
  }) as typeof fetch;

  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const health = await adapter.health();
  assert.deepEqual(health, {
    ok: true,
    data: { ok: true, adapter: "vquadrat", readOnly: true, version: "0.1.0" },
  });
  assert.equal(calls[0]?.auth, undefined, "/health needs no bearer token");

  const owners = await adapter.findOwners({ phone: "0680 1211520" });
  assert.equal(owners.ok, true);
  if (owners.ok) assert.equal(owners.data[0]?.name, "Zapletal");
  assert.equal(calls[1]?.auth, "Bearer secret-token");

  // Reads stay read-only — write path is untouched by the Connector client.
  assert.deepEqual(adapter.sendAkte({ pet: "Bella" }), {
    ok: false,
    reason: "notConnected",
  });
});

test("Connector-backed adapter turns 401 into a read error, never a throw", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "bad token", code: "UNAUTHORIZED" }), {
      status: 401,
    })) as typeof fetch;
  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "wrong",
  });
  const owners = await adapter.findOwners({ phone: "0680" });
  assert.deepEqual(owners, { ok: false, reason: "error" });
});

test("Connector-backed adapter times out instead of hanging when silvia-connector is unreachable", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = ((_input: string | URL, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;
  const adapter = connectorPraxissoftwarePort({
    kind: VQUADRAT_KIND,
    label: VQUADRAT_LABEL,
    baseUrl: "http://127.0.0.1:8765",
    token: "secret",
    timeoutMs: 30,
  });
  const owners = await adapter.findOwners({ phone: "0680" });
  assert.deepEqual(owners, { ok: false, reason: "timeout" });
});

test("writer PMS copy requires individual integration review and does not promise live sync", async () => {
  const { ADDON_AKTE, FAQ, FEATURES } = await import("../alma/data.ts");
  const pmsFeat = FEATURES.find((f) =>
    /Systeme|Vquadrat/i.test(`${f.title} ${f.body}`),
  );
  const pmsFaq = FAQ.find((f) =>
    /Praxissoftware|Ordinationssoftware/i.test(f.q),
  );
  assert.ok(pmsFeat);
  assert.ok(pmsFaq);
  assert.match(pmsFeat.body, /Anbindung wird je Ordination geprüft/);
  assert.match(pmsFeat.body, /zunächst auf der Praxistafel/);
  assert.doesNotMatch(pmsFeat.body, /bucht in denselben Slot/);
  assert.match(pmsFaq.a, /Anbindung wird je Ordination geprüft/);
  assert.match(pmsFaq.a, /Zwei-Wege-Synchronisation ist nicht zugesagt/);
  assert.doesNotMatch(pmsFaq.a, /landen direkt im Kalender/);
  assert.match(ADDON_AKTE.features.join(" "), /Praxissoftware-Anbindung separat zu prüfen/);
});

test("Anzeige still does not invent a live Vquadrat or vetera sync", async () => {
  const { HOME_PMS_ANZEIGE_BODY, homePublicFeatures, preisePlanFeatures } =
    await import("./tafel-anzeige.ts");
  const feat = {
    title: "Systeme, die Sie schon haben",
    body: "Erste Kopplung: Vquadrat Veterinär. vetera, easyVET und andere später über dieselbe Schnittstelle.",
  };
  assert.deepEqual(homePublicFeatures([feat], true), [
    { title: feat.title, body: HOME_PMS_ANZEIGE_BODY },
  ]);
  assert.match(HOME_PMS_ANZEIGE_BODY, /koppelt nicht/);
  assert.doesNotMatch(
    HOME_PMS_ANZEIGE_BODY,
    /Vquadrat Veterinär koppelt|Zwei-Wege/,
  );
  assert.deepEqual(
    preisePlanFeatures(
      ["Erste Kopplung Vquadrat Veterinär (vetera, easyVET später)"],
      true,
    ),
    ["Termine auf der Tafel, ohne Praxissoftware-Kopplung"],
  );
});

test("stub Vquadrat adapter's createAppointment stays notConnected, never calls out", async () => {
  const adapter = vquadratAdapter({});
  const result = await adapter.createAppointment({
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
  });
  assert.deepEqual(result, { ok: false, reason: "notConnected" });
});

test("Connector-backed adapter maps POST /appointments 201 to ok:true with id/start/end", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let lastBody: unknown;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/appointments") && init?.method === "POST") {
      lastBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          id: "42",
          start: "2026-09-07T09:00:00",
          end: "2026-09-07T09:20:00",
        }),
        { status: 201 },
      );
    }
    return new Response(
      JSON.stringify({ error: "not found", code: "NOT_FOUND" }),
      { status: 404 },
    );
  }) as typeof fetch;
  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const result = await adapter.createAppointment({
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
    reason: "Impfung",
  });
  assert.deepEqual(result, {
    ok: true,
    data: {
      id: "42",
      start: "2026-09-07T09:00:00",
      end: "2026-09-07T09:20:00",
    },
  });
  assert.deepEqual(lastBody, {
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
    reason: "Impfung",
  });
});

test("Connector-backed adapter maps 409 to conflict (slot taken) — Silvia must offer the next slot", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: "Zeitfenster ist bereits belegt",
        code: "CONFLICT",
      }),
      {
        status: 409,
      },
    )) as typeof fetch;
  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const result = await adapter.createAppointment({
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
  });
  assert.deepEqual(result, { ok: false, reason: "conflict" });
});

test("Connector-backed adapter maps 403 to forbidden — Silvia must fall back to Tafel-only vormerken", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: "Terminschreiben ist nicht freigeschaltet",
        code: "WRITE_FORBIDDEN",
      }),
      {
        status: 403,
      },
    )) as typeof fetch;
  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const result = await adapter.createAppointment({
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
  });
  assert.deepEqual(result, { ok: false, reason: "forbidden" });
});

test("Connector-backed adapter maps any other failure (network/5xx) to error, never throws", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;
  const adapter = vquadratAdapter({
    SILVIA_PMS_URL: "http://127.0.0.1:8765",
    SILVIA_PMS_TOKEN: "secret-token",
  });
  const result = await adapter.createAppointment({
    ownerId: "1402",
    patientId: "9",
    resourceId: "1",
    vetId: "2",
    start: "2026-09-07T09:00:00",
    minutes: 20,
  });
  assert.deepEqual(result, { ok: false, reason: "error" });
});
