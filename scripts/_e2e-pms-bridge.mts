// Lesender E2E-Test der PMS-Bridge gegen den echten silvia-connector / Vquadrat.
// Keine Terminbuchung. Bridge-DB = PGLite im Speicher.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "@/lib/db";
import { adapterFor } from "@/lib/practice/bridge/adapters.ts";
import { bridgeRepo } from "@/lib/practice/bridge/repo.ts";
import { syncEngine } from "@/lib/practice/bridge/sync.ts";
import { bridgeReader } from "@/lib/practice/bridge/reader.ts";
import { VQUADRAT_LABEL } from "@/lib/practice/praxissoftware.ts";

async function memoryDb(): Promise<Sql> {
  const pg = new PGlite();
  await pg.waitReady;
  const dir = join(process.cwd(), "migrations");
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".sql")).sort()) {
    await pg["exec"](await readFile(join(dir, f), "utf8"));
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return (await pg.query(text, values)).rows;
  }) as unknown as Sql;
  sql.query = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    (await pg.query<T>(text, params)).rows;
  return sql;
}

const t0 = Date.now();
const sql = await memoryDb();
await sql`insert into practices (id, name, owner_name, email, pms) values ('e2e', 'E2E Praxis', 'Test', 'e2e@example.invalid', 'Vquadrat Veterinär')`;
const adapter = adapterFor(VQUADRAT_LABEL, process.env);
const scope = { practiceId: "e2e", pmsKind: adapter.kind };
const repo = bridgeRepo(sql);
let adapterCalls = 0;
let adapterWriteCalls = 0;
const counting = {
  ...adapter,
  resources: async () => { adapterCalls += 1; return adapter.resources(); },
  createAppointment: async (...args: Parameters<typeof adapter.createAppointment>) => {
    adapterWriteCalls += 1;
    return adapter.createAppointment(...args);
  },
};
const engine = syncEngine({ repo, adapter: counting, scope, log: (m) => console.log("  log:", m) });

console.log("1) health:", JSON.stringify(await adapter.health()));
const master = await engine.syncMasterData();
console.log("2) syncMasterData:", master.ok, JSON.stringify(master.stats), master.error ?? "");
const byName = await engine.syncOwnerByName("Hub");
console.log("3) syncOwnerByName('a'):", byName.ok, JSON.stringify(byName.stats), byName.error ?? "");
console.log("4) bridge stats:", JSON.stringify(await repo.stats(scope)));

adapterCalls = 0;
const port = bridgeReader({ repo, adapter: counting, scope });
const r1 = await port.resources(); const r2 = await port.resources();
console.log("5) read-through resources:", r1.ok, r1.ok ? r1.data.length : r1.reason, "| adapterCalls =", adapterCalls, "(erwartet 0)", r2.ok);
const owners = await port.findOwners({ name: "Hub" });
console.log("6) findOwners via reader:", owners.ok, owners.ok ? owners.data.length : owners.reason);
if (owners.ok && owners.data.length) {
  const first = owners.data[0];
  const pats = await port.patientsOf(first.id);
  console.log("6b) patientsOf(erster Halter):", pats.ok, pats.ok ? pats.data.length : pats.reason);
  const withPhone = owners.data.find((o) => o.phones && o.phones[0] && o.phones[0].replace(/\D/g, "").length >= 6);
  if (withPhone) {
    const byPhone = await port.findOwners({ phone: withPhone.phones[0] });
    console.log("6c) findOwners per Telefon (aus Bridge):", byPhone.ok, byPhone.ok ? byPhone.data.length : byPhone.reason);
    const adapterPhone = await adapter.findOwners({ phone: withPhone.phones[0] });
    console.log("6d) gleiche Suche direkt am Connector:", adapterPhone.ok, adapterPhone.ok ? adapterPhone.data.length : adapterPhone.reason, "| gleiche IDs:", JSON.stringify(byPhone.ok ? byPhone.data.map((o) => o.id).sort() : null) === JSON.stringify(adapterPhone.ok ? adapterPhone.data.map((o) => o.id).sort() : null));
    // Anruf von der Zweitnummer, falls vorhanden
    if (withPhone.phones.length > 1) {
      const second = await port.findOwners({ phone: withPhone.phones[1] });
      console.log("6d2) Zweitnummer aus Bridge:", second.ok && second.data.some((o) => o.id === withPhone.id));
    }
  } else console.log("6c) kein Halter mit Telefon im Treffer");
}
const vets = await port.vets(); const hours = await port.hours();
console.log("6e) vets:", vets.ok ? vets.data.length : vets.reason, "| hours:", hours.ok ? "ok" : hours.reason);
const slots = await port.freeSlots({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), resourceId: r1.ok && r1.data[0] ? r1.data[0].id : "", minutes: 20 });
console.log("6f) freeSlots morgen (Echtzeit):", slots.ok ? slots.data.length : slots.reason);
const outbox = await engine.flushOutbox();
console.log("7) flushOutbox (leer):", outbox.ok, JSON.stringify(outbox.stats));
if (process.env.SILVIA_PMS_E2E_OUTAGE === "1") {
  console.log("8) outage-ready");
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Ausfall-Signal fehlt.")), 5_000);
    process.stdin.once("data", (chunk) => {
      clearTimeout(timeout);
      if (String(chunk).includes("outage")) resolve();
      else reject(new Error("Ungültiges Ausfall-Signal."));
    });
    process.stdin.once("end", () => {
      clearTimeout(timeout);
      reject(new Error("Ausfall-Signal endet vorzeitig."));
    });
  });
  const cachedAfterOutage = await port.resources();
  const slotsAfterOutage = await port.freeSlots({ date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), resourceId: r1.ok && r1.data[0] ? r1.data[0].id : "", minutes: 20 });
  const outboxAfterOutage = await engine.flushOutbox();
  console.log(`9) outage: cache=${cachedAfterOutage.ok} cacheReadOnly=${adapterCalls === 0} slotsBlocked=${!slotsAfterOutage.ok} writes=${adapterWriteCalls} emptyOutbox=${outboxAfterOutage.ok}`);
}
console.log(`fertig in ${Date.now() - t0} ms`);
process.exit(0);
