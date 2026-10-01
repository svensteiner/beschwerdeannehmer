import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { isAllowedLocalLlmUrl, llmChat, llmStt, llmTtsStream, llmTtsWithMime } from "./llm-runtime.ts";

test("LLM-Ausgang erlaubt ausschließlich echte Loopback-URLs", () => {
  assert.equal(isAllowedLocalLlmUrl("http://127.0.0.1:11434/v1"), true);
  assert.equal(isAllowedLocalLlmUrl("https://localhost:8178/v1"), true);
  assert.equal(isAllowedLocalLlmUrl("http://[::1]:8179/v1"), true);
  assert.equal(isAllowedLocalLlmUrl("https://api.openai.com/v1"), false);
  assert.equal(isAllowedLocalLlmUrl("http://127.0.0.1.evil.example/v1"), false);
  assert.equal(isAllowedLocalLlmUrl("http://user:pass@127.0.0.1/v1"), false);
});

test("externe Chat-/STT-/beide TTS-Ziele werden vor fetch blockiert", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response("unexpected", { status: 500 }); });
  const external = { OPENAI_API_KEY: "synthetic", SILVIA_LLM_PROVIDER: "openai" };
  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], external), null);
  assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", external), null);
  assert.equal(await llmTtsWithMime("synthetic", "ara", external), null);
  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], { OPENAI_API_KEY: "synthetic" }), null);
  assert.equal(await llmTtsStream("synthetic", "ara", external), null);
  assert.equal(calls, 0);
});

test("lokale Chat-/STT-/TTS-Ziele bleiben erlaubt und verlangen redirect:error", async (t) => {
  const inits: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string | URL, init?: RequestInit) => {
    inits.push(init ?? {});
    if (String(_url).includes("transcriptions")) return new Response(JSON.stringify({ text: "synthetic" }), { status: 200 });
    if (String(_url).includes("speech")) return new Response(Buffer.alloc(100), { status: 200, headers: { "content-type": "audio/wav" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic" } }] }), { status: 200 });
  });
  const env = { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1", SILVIA_STT_URL: "http://localhost:8178/v1/audio/transcriptions", SILVIA_TTS_URL: "http://[::1]:8179/v1/audio/speech" };
  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], env), "synthetic");
  assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", env), "synthetic");
  assert.ok(await llmTtsWithMime("synthetic", "ara", env));
  assert.equal(inits.length, 3); assert.ok(inits.every((init) => init.redirect === "error"));
});

test("local Chat nutzt Loopback-URL, Standardmodell und keinen API-Key", async (t) => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic local" } }] }), { status: 200 });
  });
  const result = await llmChat([{ role: "user", content: "test" }], {
    SILVIA_LLM_PROVIDER: "local",
    SILVIA_LLM_BASE_URL: "http://localhost:11434/v1/",
  }, { maxTokens: 120 });
  assert.equal(result, "synthetic local");
  assert.equal(requestUrl, "http://localhost:11434/v1/chat/completions");
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, undefined);
  assert.equal(JSON.parse(String(requestInit?.body)).model, "llama3.2");
  assert.equal(JSON.parse(String(requestInit?.body)).max_tokens, 120);
});

test("local Chat blockiert externe oder Credential-URLs vor fetch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response("unexpected"); });
  for (const base of ["https://example.test/v1", "http://user:pass@127.0.0.1/v1", "http://127.0.0.1.evil.test/v1"]) {
    assert.equal(await llmChat([{ role: "user", content: "test" }], { SILVIA_LLM_PROVIDER: "local", SILVIA_LLM_BASE_URL: base }), null);
  }
  assert.equal(calls, 0);
});

test("echte lokale 302/307/308-Weiterleitungen verlassen keinen KI-Transport", async (t) => {
  let redirectedTargetHits = 0;
  let directTargetHits = 0;
  const redirectorHits = { chat: 0, stt: 0, tts: 0 };
  const target = createServer((request, response) => {
    if (request.url?.startsWith("/redirect-target")) redirectedTargetHits += 1;
    else directTargetHits += 1;
    if (request.url?.includes("stt")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ text: "synthetic" }));
      return;
    }
    if (request.url?.includes("tts")) {
      response.writeHead(200, { "content-type": "audio/wav" });
      response.end(Buffer.alloc(100));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "synthetic" } }] }));
  });
  await new Promise<void>((resolve, reject) => target.once("error", reject).listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (!target.listening) return;
    const closed = once(target, "close");
    target.close();
    await closed;
  });
  const targetAddress = target.address();
  assert(targetAddress && typeof targetAddress !== "string");
  const targetBase = `http://127.0.0.1:${targetAddress.port}`;
  const redirector = createServer((request, response) => {
    const path = request.url ?? "";
    if (path.includes("chat")) redirectorHits.chat += 1;
    else if (path.includes("stt")) redirectorHits.stt += 1;
    else redirectorHits.tts += 1;
    const code = path.includes("chat") ? 302 : path.includes("stt") ? 307 : 308;
    response.writeHead(code, { location: `${targetBase}/redirect-target${request.url}` });
    response.end();
  });
  await new Promise<void>((resolve, reject) => redirector.once("error", reject).listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (!redirector.listening) return;
    const closed = once(redirector, "close");
    redirector.close();
    await closed;
  });
  const redirectAddress = redirector.address();
  assert(redirectAddress && typeof redirectAddress !== "string");
  const redirectBase = `http://127.0.0.1:${redirectAddress.port}`;
  const redirected = {
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: `${redirectBase}/chat`,
    SILVIA_STT_URL: `${redirectBase}/stt`,
    SILVIA_TTS_URL: `${redirectBase}/tts`,
  };
  const direct = {
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: `${targetBase}/chat`,
    SILVIA_STT_URL: `${targetBase}/stt`,
    SILVIA_TTS_URL: `${targetBase}/tts`,
  };
  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], redirected), null);
  assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", redirected), null);
  assert.equal(await llmTtsWithMime("synthetic", "ara", redirected), null);
  assert.equal(await llmTtsStream("synthetic", "ara", redirected), null);
  // Compat-STT versucht nach einer nicht erfolgreichen Prompt-Anfrage einmal
  // ohne Prompt erneut. Auch dieser zweite Versuch darf den Redirector nicht verlassen.
  assert.deepEqual(redirectorHits, { chat: 1, stt: 2, tts: 2 }, "jeder Runtime-Weg muss seinen Redirector erreichen");
  assert.equal(redirectedTargetHits, 0, "redirect:error darf kein zweites Ziel kontaktieren");

  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], direct), "synthetic");
  assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", direct), "synthetic");
  assert.ok(await llmTtsWithMime("synthetic", "ara", direct));
  const stream = await llmTtsStream("synthetic", "ara", direct);
  assert.ok(stream);
  assert.equal((await new Response(stream.stream).arrayBuffer()).byteLength, 100);
  assert.equal(directTargetHits, 4, "die positiven Kontrollen müssen alle vier lokalen Wege erreichen");
});

test("jede Proxy-Variante blockiert Chat, STT und TTS vor fetch", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "unexpected" } }] }));
  });
  const base = {
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
  };
  for (const proxy of [
    { NODE_USE_ENV_PROXY: "1" },
    { HTTP_PROXY: "", HTTPS_PROXY: "synthetic" },
    { http_proxy: "synthetic", https_proxy: "", all_proxy: "" },
  ]) {
    const env = { ...base, ...proxy };
    assert.equal(await llmChat([{ role: "user", content: "synthetic" }], env), null);
    assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", env), null);
    assert.equal(await llmTtsWithMime("synthetic", "ara", env), null);
    assert.equal(await llmTtsStream("synthetic", "ara", env), null);
  }
  assert.equal(calls, 0);
});

test("echtes process.env-Proxyflag blockiert alle drei Runtime-Funktionen", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response("unexpected"); });
  const old = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = "synthetic";
  try {
    const env = { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1" };
    assert.equal(await llmChat([{ role: "user", content: "synthetic" }], env), null);
    assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", env), null);
    assert.equal(await llmTtsWithMime("synthetic", "ara", env), null);
    assert.equal(await llmTtsStream("synthetic", "ara", env), null);
  } finally {
    if (old === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = old;
  }
  assert.equal(calls, 0);
});
