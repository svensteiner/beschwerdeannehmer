import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STIMME_HOEREN_PATH,
  STIMME_REST_HEADER,
  STIMME_SPRECHEN_PATH,
  normalizeStimmeLine,
  readHoerenBody,
  readSprechenBody,
  readSprechenRest,
  stimmeBodyGuard,
  stimmeGatewayFail,
  wantsSprechenAudio,
  writeSprechenRest,
} from "./stimme-http.ts";
import { hoerenAudio, STT_AUDIO_B64_LIMIT, sttLogFormat, sttLogLine } from "./transcribe.ts";

test("gateway paths are stable for silvia-phone", () => {
  assert.equal(STIMME_HOEREN_PATH, "/api/stimme/hoeren");
  assert.equal(STIMME_SPRECHEN_PATH, "/api/stimme/sprechen");
});

test("stimmeGatewayFail is fail-closed without token and rejects the public internet", () => {
  assert.deepEqual(stimmeGatewayFail("8.8.8.8", "Bearer secret", "secret"), {
    status: 401,
    error: "Nur lokal/LAN erreichbar.",
  });
  assert.deepEqual(stimmeGatewayFail("127.0.0.1", "Bearer secret", ""), {
    status: 401,
    error: "Unauthorized",
  });
  assert.deepEqual(stimmeGatewayFail("127.0.0.1", null, "secret"), {
    status: 401,
    error: "Unauthorized",
  });
  assert.equal(stimmeGatewayFail("127.0.0.1", "Bearer secret", "secret"), null);
  assert.equal(stimmeGatewayFail("192.168.1.20", "Bearer secret", "secret"), null);
});

test("stimmeBodyGuard lehnt zu große Bodies ab und lässt kleine durch", async () => {
  const big = new Request("http://127.0.0.1/api/stimme/hoeren", {
    method: "POST",
    body: "x".repeat(64),
  });
  const guard = await stimmeBodyGuard(big, 32);
  assert.ok(guard, "übergroßer Body ergibt eine Antwort");
  assert.equal(guard.status, 413);

  const small = new Request("http://127.0.0.1/api/stimme/sprechen", {
    method: "POST",
    body: JSON.stringify({ text: "Hallo" }),
  });
  assert.equal(await stimmeBodyGuard(small, 32), null);
});

test("readHoerenBody accepts JSON and multipart audio including a safe line", async () => {
  const json = new Request("http://127.0.0.1/api/stimme/hoeren", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ audio: "YWFh", mime: "audio/webm", line: "Huber_1!" }),
  });
  assert.deepEqual(await readHoerenBody(json), {
    audio: "YWFh",
    mime: "audio/webm",
    line: "huber1",
  });

  const form = new FormData();
  form.set("file", new Blob([Buffer.from("audio")], { type: "audio/ogg" }), "clip.ogg");
  form.set("line", "Ordination-42!!!");
  const multipart = new Request("http://127.0.0.1/api/stimme/hoeren", {
    method: "POST",
    body: form,
  });
  assert.deepEqual(await readHoerenBody(multipart), {
    audio: Buffer.from("audio").toString("base64"),
    mime: "audio/ogg",
    line: "ordination-42",
  });

  assert.equal(normalizeStimmeLine(" Ab-C_12! "), "ab-c12");

  const empty = new Request("http://127.0.0.1/api/stimme/hoeren", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(await readHoerenBody(empty), null);
});

test("wantsSprechenAudio is opt-in so JSON stays the default contract", () => {
  assert.equal(wantsSprechenAudio(null), false);
  assert.equal(wantsSprechenAudio("*/*"), false);
  assert.equal(wantsSprechenAudio("application/json"), false);
  assert.equal(wantsSprechenAudio("audio/mpeg, application/json"), false);
  assert.equal(wantsSprechenAudio("audio/mpeg"), true);
  assert.equal(wantsSprechenAudio("audio/wav"), true);
});

test("readSprechenBody requires text", async () => {
  const ok = new Request("http://127.0.0.1/api/stimme/sprechen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Grüß Gott", voice: "ara" }),
  });
  assert.deepEqual(await readSprechenBody(ok), { text: "Grüß Gott", voice: "ara", saetze: false });

  const saetze = new Request("http://127.0.0.1/api/stimme/sprechen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Grüß Gott. Der Termin liegt.", saetze: true }),
  });
  assert.deepEqual(await readSprechenBody(saetze), {
    text: "Grüß Gott. Der Termin liegt.",
    voice: "",
    saetze: true,
  });
  assert.equal(STIMME_REST_HEADER, "x-silvia-rest");
  const leftover = "Bitte bringen Sie den Impfpass mit.";
  assert.equal(readSprechenRest(writeSprechenRest(leftover)), leftover);
  assert.equal(readSprechenRest(null), "");
  assert.equal(readSprechenRest("%E2%82%AC"), "€");

  const empty = new Request("http://127.0.0.1/api/stimme/sprechen", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ voice: "ara" }),
  });
  assert.equal(await readSprechenBody(empty), null);
});

test("hoerenAudio: empty or tiny clip is quiet, missing STT is missing", async () => {
  assert.deepEqual(await hoerenAudio({ audio: "", ip: "10.71.4.1" }), {
    ok: false,
    text: "",
    reason: "quiet",
  });

  const tiny = Buffer.alloc(80, 1).toString("base64");
  assert.deepEqual(await hoerenAudio({ audio: tiny, mime: "audio/webm", ip: "10.71.4.2" }), {
    ok: false,
    text: "",
    reason: "quiet",
  });

  // Deterministic: isolate from the developer's real .env (OPENAI_API_KEY /
  // SILVIA_STT_URL may be set on this machine) so "missing" doesn't depend
  // on the ambient environment — hoerenAudio takes `env` for exactly this.
  const missing = await hoerenAudio({
    audio: Buffer.alloc(400, 1).toString("base64"),
    mime: "audio/webm",
    ip: "10.71.4.3",
    env: {},
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "missing");
});

test("hoerenAudio lehnt zu große Aufnahmen ab statt sie abzuschneiden", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    throw new Error("unerwarteter Aufruf");
  });
  assert.deepEqual(await hoerenAudio({
    audio: "A".repeat(STT_AUDIO_B64_LIMIT + 1),
    ip: "192.0.2.90",
    env: {},
  }), { ok: false, text: "", reason: "error" });
  assert.equal(requests, 0);
});

test("STT-Betriebszeilen enthalten keine frei gelieferte MIME- oder Fehlermeldung", async (t) => {
  const marker = "audio/webm\nSYNTHETIC_PRIVATE_MARKER";
  assert.equal(sttLogFormat(marker), "unknown");
  assert.equal(
    sttLogLine("ok", 400, marker, 12),
    "[stt] ok bytes=400 format=unknown zeichen=12",
  );
  assert.ok(!sttLogLine("leer", 400, marker, 0).includes("SYNTHETIC_PRIVATE_MARKER"));

  const logged: string[] = [];
  let fetches = 0;
  t.mock.method(console, "error", (...args: unknown[]) => logged.push(args.join(" ")));
  t.mock.method(globalThis, "fetch", async () => {
    fetches += 1;
    throw new Error("fetch must not run");
  });
  const throwingEnv = new Proxy<Record<string, string | undefined>>({}, {
    get() { throw new Error(marker); },
  });
  assert.deepEqual(await hoerenAudio({
    audio: Buffer.alloc(400, 1).toString("base64"),
    mime: marker,
    ip: "192.0.2.91",
    env: throwingEnv,
  }), { ok: false, text: "", reason: "error" });
  assert.equal(fetches, 0);
  assert.deepEqual(logged, ["[stt] fehler=runtime"]);
});
