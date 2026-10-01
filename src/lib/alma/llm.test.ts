import assert from "node:assert/strict";
import { test } from "node:test";
import type { Patient } from "./patients.ts";
import {
  LLM_EXCERPT_LIMIT,
  SETTINGS_LLM_HINT_ID,
  aclPatientExcerpt,
  llmHostIsThirdParty,
  llmMissingCloudKey,
  llmPatientPrompt,
  llmStatusHint,
  llmStatusView,
  redactPatientExcerpt,
  redactStoredContact,
  resolveLlm,
} from "./llm.ts";
import { llmSourceLabel } from "./llm-source.ts";

function stub(over: Partial<Patient> & { name: string }): Patient {
  return {
    chip: "",
    species: "Hund",
    breed: "",
    born: "",
    owner: "Klientel",
    phone: "",
    lastVaccine: "",
    rabies: "",
    registered: false,
    notes: "",
    ...over,
  };
}

test("Cloud provider requires an explicit choice; VITE_ keys never count", () => {
  const implicit = resolveLlm({ OPENAI_API_KEY: "sk-test", XAI_API_KEY: "xai-test" });
  assert.equal(implicit.id, "local");
  const openai = resolveLlm({ SILVIA_LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", XAI_API_KEY: "xai-test" });
  assert.equal(openai.id, "openai");
  assert.equal(openai.chatModel, "gpt-4o-mini");
  assert.equal(openai.thirdParty, true);
  assert.match(openai.chatUrl, /api\.openai\.com/);
  assert.equal(openai.apiKey, "sk-test");

  const viteOnly = resolveLlm({ VITE_OPENAI_API_KEY: "sk-leaked", VITE_XAI_API_KEY: "xai-leaked" });
  assert.equal(viteOnly.id, "local");
  assert.equal(viteOnly.chatUrl, "");
  assert.equal(viteOnly.apiKey, "");
});

test("own server is a URL swap, not a new product path", () => {
  const home = resolveLlm({
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1/",
    SILVIA_LLM_MODEL: "silvia-local",
  });
  assert.equal(home.id, "compat");
  assert.equal(home.chatUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(home.chatModel, "silvia-local");
  assert.equal(home.thirdParty, false);
  assert.equal(llmHostIsThirdParty("https://api.openai.com/v1/chat/completions"), true);
  assert.equal(llmHostIsThirdParty("https://llm.example.net/v1"), true);
  assert.equal(llmHostIsThirdParty("http://192.168.1.20:8080/v1"), false);
  assert.equal(llmHostIsThirdParty("http://[::1]:8179/v1"), false);
});

test("compat STT/TTS URLs are optional and stay local", () => {
  const noUrls = resolveLlm({
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
  });
  assert.equal(noUrls.sttKind, "none");
  assert.equal(noUrls.ttsKind, "none");
  assert.equal(noUrls.sttUrl, "");
  assert.equal(noUrls.ttsUrl, "");

  const withUrls = resolveLlm({
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions",
    SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech",
  });
  assert.equal(withUrls.sttKind, "compat");
  assert.equal(withUrls.ttsKind, "compat");
  assert.equal(withUrls.thirdParty, false);

  const vendorStt = resolveLlm({
    SILVIA_LLM_PROVIDER: "compat",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1",
    SILVIA_STT_URL: "https://api.openai.com/v1/audio/transcriptions",
  });
  assert.equal(vendorStt.thirdParty, true);
});

test("openai chat with default voice provider keeps historic behavior (voice follows OpenAI)", () => {
  const openai = resolveLlm({
    SILVIA_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions",
    SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech",
  });
  assert.equal(openai.id, "openai");
  assert.equal(openai.sttKind, "openai");
  assert.equal(openai.ttsKind, "openai");
  assert.equal(openai.sttUrl, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(openai.ttsUrl, "https://api.openai.com/v1/audio/speech");
});

test("openai chat with SILVIA_TTS_PROVIDER/SILVIA_STT_PROVIDER=compat routes voice locally", () => {
  const mixed = resolveLlm({
    SILVIA_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    SILVIA_TTS_PROVIDER: "compat",
    SILVIA_STT_PROVIDER: "compat",
    SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions",
    SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech",
  });
  assert.equal(mixed.id, "openai");
  assert.equal(mixed.chatUrl, "https://api.openai.com/v1/chat/completions");
  assert.equal(mixed.sttKind, "compat");
  assert.equal(mixed.ttsKind, "compat");
  assert.equal(mixed.sttUrl, "http://127.0.0.1:8178/v1/audio/transcriptions");
  assert.equal(mixed.ttsUrl, "http://127.0.0.1:8179/v1/audio/speech");
  assert.equal(mixed.thirdParty, true);
});

test("openai chat with SILVIA_TTS_PROVIDER/SILVIA_STT_PROVIDER=none disables voice", () => {
  const noVoice = resolveLlm({
    SILVIA_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    SILVIA_TTS_PROVIDER: "none",
    SILVIA_STT_PROVIDER: "none",
  });
  assert.equal(noVoice.sttKind, "none");
  assert.equal(noVoice.ttsKind, "none");
  assert.equal(noVoice.sttUrl, "");
  assert.equal(noVoice.ttsUrl, "");
});

test("SILVIA_TTS_PROVIDER=compat without a compat URL falls back to openai voice", () => {
  const fallback = resolveLlm({
    SILVIA_LLM_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    SILVIA_TTS_PROVIDER: "compat",
  });
  assert.equal(fallback.ttsKind, "openai");
  assert.equal(fallback.ttsUrl, "https://api.openai.com/v1/audio/speech");
});

test("forced local uses optional loopback chat endpoint without keys", () => {
  const llm = resolveLlm({
    SILVIA_LLM_PROVIDER: "local",
    OPENAI_API_KEY: "sk-test",
    SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1/",
    SILVIA_LLM_MODEL: "silvia-local",
    SILVIA_STT_URL: "http://127.0.0.1:8178/v1/audio/transcriptions",
    SILVIA_TTS_URL: "http://127.0.0.1:8179/v1/audio/speech",
  });
  assert.equal(llm.id, "local");
  assert.equal(llm.chatUrl, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal(llm.chatModel, "silvia-local");
  assert.equal(llm.sttKind, "compat");
  assert.equal(llm.ttsKind, "compat");
  assert.equal(llm.thirdParty, false);

  const rootVoiceUrls = resolveLlm({
    SILVIA_LLM_PROVIDER: "local",
    SILVIA_STT_URL: "http://127.0.0.1:8178/",
    SILVIA_TTS_URL: "http://127.0.0.1:8179",
  });
  assert.equal(rootVoiceUrls.sttUrl, "http://127.0.0.1:8178/v1/audio/transcriptions");
  assert.equal(rootVoiceUrls.ttsUrl, "http://127.0.0.1:8179/v1/audio/speech");

  const customVoiceUrls = resolveLlm({
    SILVIA_LLM_PROVIDER: "local",
    SILVIA_STT_URL: "http://127.0.0.1:8178/custom/stt",
    SILVIA_TTS_URL: "http://127.0.0.1:8179/custom/tts",
  });
  assert.equal(customVoiceUrls.sttUrl, "http://127.0.0.1:8178/custom/stt");
  assert.equal(customVoiceUrls.ttsUrl, "http://127.0.0.1:8179/custom/tts");

  assert.equal(resolveLlm({ SILVIA_LLM_PROVIDER: "local" }).chatModel, "llama3.2");

  const blocked = resolveLlm({
    SILVIA_LLM_PROVIDER: "local",
    SILVIA_STT_URL: "https://api.openai.com/v1/audio/transcriptions",
    SILVIA_TTS_URL: "https://example.test/v1/audio/speech",
  });
  assert.equal(blocked.sttKind, "none");
  assert.equal(blocked.ttsKind, "none");
  assert.equal(blocked.sttUrl, "");
  assert.equal(blocked.ttsUrl, "");

  for (const base of ["https://example.test/v1", "http://user:pass@127.0.0.1/v1", "ftp://127.0.0.1/v1"]) {
    assert.equal(resolveLlm({ SILVIA_LLM_PROVIDER: "local", SILVIA_LLM_BASE_URL: base }).chatUrl, "");
  }
});

test("ACL excerpt is named hits only — never the recent Kartei dump", () => {
  const rows = [
    stub({ name: "Ada", owner: "A", chip: "1", phone: "0664111" }),
    stub({ name: "Zorro", owner: "Frau Nowak", chip: "040099900000001", phone: "06649876543" }),
    stub({ name: "Nala", owner: "B", chip: "3", phone: "0664222" }),
  ];
  const hit = aclPatientExcerpt(rows, "Zorro braucht Impfung");
  assert.deepEqual(
    hit.map((p) => p.name),
    ["Zorro"],
  );
  assert.equal(aclPatientExcerpt(rows, "Grüß Gott, haben Sie heute offen?").length, 0);
  assert.ok(hit.length <= LLM_EXCERPT_LIMIT);
});

test("third-party prompt strips stored Handy, Chip and E-Mail", () => {
  const row = stub({
    name: "Zorro",
    owner: "Frau Nowak",
    chip: "040099900000001",
    phone: "0664 987 65 43",
    notes: "Mail nowak@example.com und 0664 181 20 08 in der Akte.",
  });
  const remote = llmPatientPrompt([row], true);
  assert.equal(remote[0]?.phone, "");
  assert.equal(remote[0]?.chip, "");
  assert.equal(remote[0]?.name, "Zorro");
  assert.match(remote[0]?.notes ?? "", /E-Mail hinterlegt/);
  assert.match(remote[0]?.notes ?? "", /Nummer hinterlegt/);
  assert.equal(remote[0]?.notes.includes("nowak@example.com"), false);
  assert.equal(redactStoredContact("ohne Kontakt"), "ohne Kontakt");
  const local = llmPatientPrompt([row], false);
  assert.equal(local[0]?.phone, "0664 987 65 43");
  assert.equal(redactPatientExcerpt(row).chip, "");
});

test("status label never includes the API key and states the external-KI boundary", () => {
  const view = llmStatusView({ SILVIA_LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-secret-do-not-leak" });
  assert.equal(view.id, "openai");
  assert.equal(view.thirdParty, true);
  assert.equal(view.missingKey, false);
  assert.equal(JSON.stringify(view).includes("sk-secret"), false);
  assert.match(view.label, /OpenAI/);
  assert.match(view.label, /für Praxisdaten gesperrt/);
  assert.match(view.hint, /Externe KI für Praxisdaten gesperrt/);
  assert.match(view.hint, /Lokale Verarbeitung einrichten/);
  assert.equal(SETTINGS_LLM_HINT_ID, "settings-llm-hint");
});

test("missing cloud configuration points to local processing without exposing secrets", () => {
  const none = llmStatusView({});
  assert.equal(none.id, "local");
  assert.equal(none.missingKey, false);
  assert.match(none.label, /Lokal, ohne Cloud-Modell/);
  assert.match(none.hint, /lokale Regeln ohne Antwortmodell/);
  assert.equal(llmMissingCloudKey({ VITE_OPENAI_API_KEY: "sk-leaked" }), false);
  assert.equal(llmMissingCloudKey({ SILVIA_LLM_PROVIDER: "openai", VITE_OPENAI_API_KEY: "sk-leaked" }), true);
  assert.equal(llmMissingCloudKey({ SILVIA_LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" }), false);
  assert.equal(llmMissingCloudKey({ SILVIA_LLM_PROVIDER: "local", OPENAI_API_KEY: "sk-test" }), false);
  const forced = llmStatusView({ SILVIA_LLM_PROVIDER: "local" });
  assert.equal(forced.missingKey, false);
  assert.match(forced.hint, /lokale Regeln ohne Antwortmodell/);
  assert.match(llmStatusHint({ id: "openai", missingKey: true }), /Externe KI für Praxisdaten gesperrt/);
});

test("configured local server never implies verified readiness, with or without STT", () => {
  for (const sttUrl of ["", "http://127.0.0.1:8178/v1/audio/transcriptions"]) {
    const view = llmStatusView({ SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "http://127.0.0.1:11434/v1", SILVIA_STT_URL: sttUrl });
    assert.match(view.hint, /Eigener Server konfiguriert/);
    assert.match(view.hint, /Betriebsbereitschaft noch nicht abgenommen/);
    assert.match(view.label, /noch nicht abgenommen/);
    assert.doesNotMatch(view.label, /im Haus/);
  }
  const remote = llmStatusView({ SILVIA_LLM_PROVIDER: "compat", SILVIA_LLM_BASE_URL: "https://synthetic.example/v1" });
  assert.doesNotMatch(remote.label, /im Haus/);
  assert.match(remote.label, /noch nicht abgenommen/);
});

test("live line names silent local fallback without leaking keys", () => {
  const model = llmSourceLabel("alma", "openai");
  assert.equal(model.label, "Modell");
  assert.equal(model.source, "alma");
  assert.equal(model.provider, "openai");
  assert.equal(model.fallback, false);

  const silent = llmSourceLabel("local", "openai");
  assert.equal(silent.label, "Lokal — Modell hat nicht geantwortet");
  assert.equal(silent.fallback, true);
  assert.equal(llmSourceLabel("local", "compat").fallback, true);
  assert.equal(llmSourceLabel("local", "xai").label, "Lokal — Modell hat nicht geantwortet");

  const local = llmSourceLabel("local", "local");
  assert.equal(local.label, "Lokal");
  assert.equal(local.fallback, false);
  assert.equal(llmSourceLabel("local", "local").label.includes("nicht geantwortet"), false);

  assert.equal(llmSourceLabel("alma", "compat").label, "Modell");
  assert.equal(JSON.stringify(llmSourceLabel("alma", "openai")).includes("sk-"), false);
});
