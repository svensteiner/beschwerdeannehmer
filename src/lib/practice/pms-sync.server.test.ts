import assert from "node:assert/strict";
import test from "node:test";
import { pmsSyncHttpResponse } from "./pms-sync.server.ts";

test("pms sync HTTP-Antwort ersetzt externe Patientenschlüssel durch einen Zähler", async () => {
  const response = pmsSyncHttpResponse({
    ok: true,
    master: { id: "run-m", practiceId: "practice", pmsKind: "vquadrat", scope: "master", startedAt: new Date(), finishedAt: new Date(), ok: true, stats: {} , error: null },
    outbox: { id: "run-o", practiceId: "practice", pmsKind: "vquadrat", scope: "outbox", startedAt: new Date(), finishedAt: new Date(), ok: true, stats: { patients: { "external-owner-1": { inserted: 1 }, "external-owner-2": { inserted: 2 } } }, error: null },
  });
  const body = await response.json() as { outbox: { stats: { patients: { owners: number } } } };
  assert.deepEqual(body.outbox.stats.patients, { owners: 2 });
  assert.doesNotMatch(JSON.stringify(body), /external-owner/);
});
