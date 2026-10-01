import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createConnectorClient, validConnectorBaseUrl } from "./praxissoftware-connector.ts";

test("connector URL accepts loopback only for HTTP and rejects credentials/private targets", () => {
  assert.ok(validConnectorBaseUrl("http://127.0.0.1:8765"));
  assert.ok(validConnectorBaseUrl("http://[::1]:8765"));
  assert.equal(validConnectorBaseUrl("http://192.168.1.10:8765"), null);
  assert.equal(validConnectorBaseUrl("https://connector.example/path?x=1"), null);
  assert.equal(validConnectorBaseUrl("https://user:pass@connector.example"), null);
  assert.equal(validConnectorBaseUrl("http://connector.example"), null);
});

test("production blocks plain HTTP even for loopback; local test mode is explicit", () => {
  const production = { NODE_ENV: "production" };
  assert.equal(validConnectorBaseUrl("http://127.0.0.1:8765", production), null);
  assert.equal(validConnectorBaseUrl("http://[::1]:8765", production), null);
  assert.equal(
    validConnectorBaseUrl("http://127.0.0.1:8765", { ...production, SILVIA_PMS_LOCAL_TEST: "1" }),
    "http://127.0.0.1:8765",
  );
});

test("abgewiesenes Connector-Ziel löst keinen fetch-Aufruf aus", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error("unexpected fetch"); }) as typeof fetch;
  try {
    const client = createConnectorClient({ baseUrl: "http://192.168.1.10:8765", token: "synthetic-token" });
    assert.deepEqual(await client.resources(), { ok: false, reason: "notConnected" });
    assert.deepEqual(await client.createAppointment({ ownerId: "o", patientId: "p", resourceId: "r", vetId: "v", start: "2026-09-14T09:00:00Z", minutes: 15 }), { ok: false, reason: "notConnected" });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test("connector rejects real HTTP redirects for reads and appointment writes", async () => {
  let targetHits = 0;
  const target = createServer((_req, res) => { targetHits++; res.end("{}"); });
  const targetUrl = await listen(target);
  let responseStatus = 307;
  const received: { method?: string; url?: string; auth?: string; body: string }[] = [];
  const source = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk.toString();
    received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    res.statusCode = responseStatus;
    if (responseStatus >= 300 && responseStatus < 400) res.setHeader("Location", `${targetUrl}/trap`);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.method === "POST" ? { id: "synthetic-slot" } : []));
  });
  try {
    const baseUrl = await listen(source);
    const client = createConnectorClient({ baseUrl, token: "synthetic-token" });
    const body = { ownerId: "synthetic-owner", patientId: "synthetic-pet", resourceId: "r", vetId: "v", start: "2026-09-14T09:00:00Z", minutes: 15 };
    for (const status of [301, 302, 303, 307, 308]) {
      responseStatus = status;
      assert.deepEqual(await client.findOwners({ name: "Synthetic Example" }), { ok: false, reason: "error" });
      assert.deepEqual(await client.createAppointment(body), { ok: false, reason: "error" });
    }
    assert.equal(targetHits, 0, "No redirected recipient may receive a request");
    assert.equal(received.length, 10);
    assert.ok(received.every(request => request.auth === "Bearer synthetic-token"));
    assert.ok(received.filter(request => request.method === "POST").every(request => JSON.stringify(JSON.parse(request.body)) === JSON.stringify(body)));
    responseStatus = 200;
    assert.deepEqual(await client.findOwners({ name: "Synthetic Example" }), { ok: true, data: [] });
    assert.deepEqual(await client.createAppointment(body), { ok: true, data: { id: "synthetic-slot" } });
    responseStatus = 409;
    assert.deepEqual(await client.createAppointment(body), { ok: false, reason: "conflict" });
    responseStatus = 403;
    assert.deepEqual(await client.createAppointment(body), { ok: false, reason: "forbidden" });
    assert.equal(targetHits, 0);
  } finally {
    await close(source);
    await close(target);
  }
});
