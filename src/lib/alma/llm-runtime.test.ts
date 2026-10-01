import assert from "node:assert/strict";
import { test } from "node:test";
import { TTS_STYLE } from "./speak-text.ts";
import { COMPAT_TTS_VOICE, OPENAI_TTS_VOICE, STT_FACH_PROMPT, STT_FALLBACK_MODEL, TTS_FALLBACK_MODEL, TTS_LANGUAGE_AT, compatTtsVoice, llmChat, llmStt, llmTtsStream, llmTtsWithMime, sttModelFromEnv, sttPromptWithCorrections, ttsModelFromEnv } from "./llm-runtime.ts";
import { voiceStyle } from "./voices.ts";

const AUDIO = Buffer.alloc(400, 1);
const COMPAT_ENV = { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1", SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions", SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech" };

test("Standardstimme verwendet OpenAI Marin", () => assert.equal(OPENAI_TTS_VOICE.ara, "marin"));
test("llmChat: Netzwerk-, Redirect- und ungültiges JSON fail-closed", async (t) => {
  let calls = 0;
  for (const failure of [new TypeError("network"), new TypeError("redirect"), new Response("{bad")]) {
    t.mock.method(globalThis, "fetch", async () => { calls += 1; if (failure instanceof Response) return failure; throw failure; });
    assert.equal(await llmChat([{ role: "user", content: "test" }], COMPAT_ENV), null);
    t.mock.restoreAll();
  }
  assert.equal(calls, 3);
});
test("llmChat bricht einen hängenden lokalen Chat nach 30 Sekunden ab und räumt den Timer auf", async (t) => {
  t.mock.timers.enable();
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Promise<Response>((_, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  });
  const pending = llmChat([{ role: "user", content: "synthetic" }], COMPAT_ENV);
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("llmChat bricht auch einen hängenden JSON-Body nach erfolgreichen Headern ab", async (t) => {
  t.mock.timers.enable();
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return {
      ok: true,
      json: () => new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
    } as unknown as Response;
  });
  const pending = llmChat([{ role: "user", content: "synthetic body" }], COMPAT_ENV);
  // Fetch liefert Header sofort; erst nach diesem Microtask wartet json().
  await Promise.resolve();
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("llmChat räumt den Timeout nach erfolgreicher Antwort auf", async (t) => {
  t.mock.timers.enable();
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    init.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(JSON.stringify({ choices: [{ message: { content: "synthetic" } }] }));
  });
  assert.equal(await llmChat([{ role: "user", content: "synthetic" }], COMPAT_ENV), "synthetic");
  t.mock.timers.tick(30_000);
  assert.equal(aborted, false);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("Cloud-Provider: STT/TTS/Stream bleiben mit jeder Modellvariante gesperrt", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response("unexpected"); });
  for (const env of [{ OPENAI_API_KEY: "synthetic", SILVIA_LLM_PROVIDER: "openai", SILVIA_STT_MODEL: "gpt-transcribe", SILVIA_TTS_MODEL: "gpt-4o-mini-tts" }, { OPENAI_API_KEY: "synthetic", SILVIA_LLM_PROVIDER: "openai", SILVIA_STT_MODEL: STT_FALLBACK_MODEL, SILVIA_TTS_MODEL: TTS_FALLBACK_MODEL }, { XAI_API_KEY: "synthetic", SILVIA_LLM_PROVIDER: "xai" }]) {
    assert.equal(await llmStt(AUDIO, "audio/webm", env), null); assert.equal(await llmTtsWithMime("synthetic", "ara", env), null); assert.equal(await llmTtsStream("synthetic", "ara", env), null);
  }
  assert.equal(calls, 0);
});
test("Cloud-Provider: Auch Chat sendet keine Praxisinhalte nach außen", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; return new Response("unexpected"); });
  const messages = [{ role: "user" as const, content: "synthetischer Testfall" }];
  for (const env of [
    { SILVIA_LLM_PROVIDER: "openai", OPENAI_API_KEY: "synthetic" },
    { SILVIA_LLM_PROVIDER: "xai", XAI_API_KEY: "synthetic" },
    { SILVIA_LLM_PROVIDER: "auto", OPENAI_API_KEY: "synthetic" },
    { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "https://example.test/v1" },
    { SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://192.168.1.20:11434/v1" },
  ]) {
    assert.equal(await llmChat(messages, env), null);
  }
  assert.equal(calls, 0);
});
test("Compat-STT sendet Fach-Prompt und Demo-Begriffe nur requestlokal", async (t) => {
  const prompts: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { prompts.push(String((init.body as FormData).get("prompt") ?? "")); return new Response(JSON.stringify({ text: "Termin um neun Uhr fünfzehn" })); });
  await llmStt(AUDIO, "audio/webm", COMPAT_ENV, { demoTerms: ["Marin"] }); await llmStt(AUDIO, "audio/webm", COMPAT_ENV);
  assert.match(prompts[0] ?? "", /Marin/); assert.equal(prompts[1], STT_FACH_PROMPT);
});
test("Compat-STT wiederholt einmal ohne Prompt, wenn der Server ihn ablehnt", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls += 1;
    const prompt = (init.body as FormData).get("prompt");
    if (calls === 1) { assert.ok(prompt); return new Response("bad", { status: 400 }); }
    assert.equal(prompt, null);
    return new Response(JSON.stringify({ text: "FIP" }));
  });
  assert.equal(await llmStt(Buffer.alloc(400), "audio/webm", COMPAT_ENV), "FIP");
  assert.equal(calls, 2);
});
test("Compat-STT ordnet MP4/M4A trotz MIME-Parametern korrekt zu", async (t) => {
  const seen: Array<{ name: string; type: string }> = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const file = (init.body as FormData).get("file") as File;
    seen.push({ name: file.name, type: file.type });
    return new Response(JSON.stringify({ text: "synthetic" }));
  });
  assert.equal(await llmStt(AUDIO, "audio/mp4; codecs=mp4a.40.2", COMPAT_ENV), "synthetic");
  assert.equal(await llmStt(AUDIO, "audio/x-m4a; codecs=mp4a.40.2", COMPAT_ENV), "synthetic");
  assert.deepEqual(seen, [
    { name: "clip.mp4", type: "audio/mp4" },
    { name: "clip.m4a", type: "audio/x-m4a" },
  ]);
});
test("llmStt bricht einen hängenden Header-Fetch ab", async (t) => {
  t.mock.timers.enable();
  let signal: AbortSignal | undefined;
  let fetchCalls = 0;
  let markFetchStarted!: () => void;
  const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    fetchCalls += 1;
    markFetchStarted();
    signal = init.signal as AbortSignal;
    return new Promise<Response>((_, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  });
  const pending = llmStt(AUDIO, "audio/webm", COMPAT_ENV);
  await fetchStarted;
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  assert.equal(fetchCalls, 1);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("llmStt bricht einen hängenden Response-Body ab", async (t) => {
  t.mock.timers.enable();
  let signal: AbortSignal | undefined;
  let markJsonStarted!: () => void;
  const jsonStarted = new Promise<void>((resolve) => { markJsonStarted = resolve; });
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return {
      ok: true,
      json: () => new Promise<never>((_, reject) => {
        markJsonStarted();
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
    } as unknown as Response;
  });
  const pending = llmStt(AUDIO, "audio/webm", COMPAT_ENV);
  await jsonStarted;
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("llmStt räumt den Timeout nach erfolgreicher Antwort auf", async (t) => {
  t.mock.timers.enable();
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    init.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(JSON.stringify({ text: "synthetic" }));
  });
  assert.equal(await llmStt(AUDIO, "audio/webm", COMPAT_ENV), "synthetic");
  t.mock.timers.tick(30_000);
  assert.equal(aborted, false);
  t.mock.restoreAll();
  t.mock.timers.reset();
});
test("llmStt weist externe URLs vor dem Korrektur-Reader ab", async () => {
  let reads = 0;
  const env = { ...COMPAT_ENV, SILVIA_STT_URL: "https://api.openai.com/v1/audio/transcriptions" };
  const result = await llmStt(AUDIO, "audio/webm", env, {
    practiceId: "synthetic",
    correctionReader: async () => { reads += 1; return ["synthetic"]; },
  });
  assert.equal(result, null);
  assert.equal(reads, 0);
});
test("Compat-TTS verwendet Kokoro-Stimme und Stream-Body", async (t) => {
  let body: Record<string, unknown> = {}; const payload = Buffer.alloc(120, 3);
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(payload, { headers: { "content-type": "audio/wav" } }); });
  const spoken = await llmTtsWithMime("Ja.", "ara", COMPAT_ENV); assert.equal(spoken?.mime, "audio/wav"); assert.equal(body.voice, COMPAT_TTS_VOICE.ara);
  const streamed = await llmTtsStream("Ja.", "ara", COMPAT_ENV); assert.equal(streamed?.mime, "audio/wav"); assert.equal(Buffer.from(await new Response(streamed?.stream).arrayBuffer()).byteLength, 120);
});
test("llmTtsWithMime bricht einen hängenden Header-Fetch ab", async (t) => {
  t.mock.timers.enable();
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let signal: AbortSignal | undefined;
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_url: string, init: RequestInit) => {
    calls += 1; signal = init.signal as AbortSignal; markStarted();
    return new Promise<Response>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
  });
  const pending = llmTtsWithMime("synthetic", "ara", COMPAT_ENV);
  await started;
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  assert.equal(calls, 1);
  t.mock.restoreAll(); t.mock.timers.reset();
});
test("llmTtsWithMime behandelt einen hängenden Audio-Body als null", async (t) => {
  t.mock.timers.enable();
  let markBody!: () => void;
  const bodyStarted = new Promise<void>((resolve) => { markBody = resolve; });
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({ pull() { markBody(); return new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })); } });
    return new Response(body, { headers: { "content-type": "audio/wav" } });
  });
  const pending = llmTtsWithMime("synthetic", "ara", COMPAT_ENV);
  await bodyStarted;
  t.mock.timers.tick(30_000);
  assert.equal(await pending, null);
  assert.equal(signal?.aborted, true);
  t.mock.restoreAll(); t.mock.timers.reset();
});
test("llmTtsStream räumt den Timer erst nach normalem EOF auf", async (t) => {
  t.mock.timers.enable();
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    init.signal?.addEventListener("abort", () => { aborted = true; });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } });
  });
  const spoken = await llmTtsStream("synthetic", "ara", COMPAT_ENV);
  assert.ok(spoken);
  assert.deepEqual([...new Uint8Array(await new Response(spoken!.stream).arrayBuffer())], [1, 2, 3]);
  t.mock.timers.tick(30_000);
  assert.equal(aborted, false);
  t.mock.restoreAll(); t.mock.timers.reset();
});
test("llmTtsStream meldet Timeout nicht als normalen EOF", async (t) => {
  t.mock.timers.enable();
  let markRead!: () => void;
  const readStarted = new Promise<void>((resolve) => { markRead = resolve; });
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        markRead();
        return new Promise<never>((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      },
    });
    return new Response(body, { headers: { "content-type": "audio/wav" } });
  });
  const spoken = await llmTtsStream("synthetic", "ara", COMPAT_ENV);
  assert.ok(spoken);
  const reading = new Response(spoken!.stream).arrayBuffer();
  await readStarted;
  t.mock.timers.tick(30_000);
  await assert.rejects(reading, (error: unknown) => (error as DOMException).name === "AbortError");
  assert.equal(signal?.aborted, true);
  t.mock.restoreAll(); t.mock.timers.reset();
});
test("llmTtsStream-Timeout bereinigt auch ohne Verbraucher", async (t) => {
  t.mock.timers.enable();
  let upstreamCancelled = false;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream<Uint8Array>({ cancel() { upstreamCancelled = true; } }), { headers: { "content-type": "audio/wav" } }));
  const spoken = await llmTtsStream("synthetic", "ara", COMPAT_ENV);
  assert.ok(spoken);
  t.mock.timers.tick(30_000);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(upstreamCancelled, true);
  t.mock.restoreAll(); t.mock.timers.reset();
});
test("llmTtsStream-Clientcancel bricht den Upstream ab", async (t) => {
  let signal: AbortSignal | undefined;
  let upstreamCancelled = false;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Response(new ReadableStream<Uint8Array>({ cancel() { upstreamCancelled = true; } }), { headers: { "content-type": "audio/wav" } });
  });
  const spoken = await llmTtsStream("synthetic", "ara", COMPAT_ENV);
  assert.ok(spoken);
  await spoken!.stream.cancel("synthetic-cancel");
  assert.equal(signal?.aborted, true);
  assert.equal(upstreamCancelled, true);
  t.mock.restoreAll();
});
test("Kompatibilitätskonstanten und Modellvorgaben bleiben stabil", () => {
  assert.equal(compatTtsVoice("luna"), "af_sky");
  assert.equal(compatTtsVoice("ara", { SILVIA_TTS_VOICE: "af_heart" }), "af_heart");
  assert.equal(ttsModelFromEnv({}), "gpt-4o-mini-tts"); assert.equal(sttModelFromEnv({}), "gpt-transcribe"); assert.equal(TTS_LANGUAGE_AT, "de-AT"); assert.ok(TTS_STYLE); assert.ok(voiceStyle("ara"));
});

test("sttPromptWithCorrections: leer lässt den Basis-Prompt unverändert", () => {
  assert.equal(sttPromptWithCorrections("base", []), "base");
});
test("sttPromptWithCorrections: jüngste eindeutige Korrekturen zuerst, case-insensitive", () => {
  assert.equal(sttPromptWithCorrections("base", ["Doktor Huber", "kastration", "Doktor huber"]), "base, Doktor huber, kastration");
});
test("sttPromptWithCorrections: ignoriert >40 Zeichen und begrenzt auf 20", () => {
  assert.equal(sttPromptWithCorrections("base", ["x".repeat(41), "kurz"]), "base, kurz");
  const result = sttPromptWithCorrections("base", Array.from({ length: 25 }, (_, i) => `wort${i}`));
  const words = result.slice("base, ".length).split(", ");
  assert.equal(words.length, 20); assert.equal(words[0], "wort24"); assert.equal(words[19], "wort5");
});
