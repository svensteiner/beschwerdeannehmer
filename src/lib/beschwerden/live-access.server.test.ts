import assert from "node:assert/strict";
import test from "node:test";
import { acceptsLiveConnection, openAiLiveEnabled } from "./live-access.server";

test("OpenAI-Live bleibt ohne ausdrückliche Freigabe ausgeschaltet", () => {
  assert.equal(openAiLiveEnabled({ OPENAI_API_KEY: "test" }), false);
  assert.equal(openAiLiveEnabled({ GARAGEN_OPENAI_LIVE: "on" }), false);
  assert.equal(openAiLiveEnabled({ GARAGEN_OPENAI_LIVE: "on", OPENAI_API_KEY: "test" }), true);
});

test("Live-Verbindung verlangt gleiche Herkunft und ausdrückliche Einwilligung", () => {
  const request = new Request("https://demo.example/api/telefon/live-connect", { method: "POST", headers: { origin: "https://demo.example", "x-garagen-live-consent": "yes" } });
  assert.equal(acceptsLiveConnection(request), true);
  assert.equal(acceptsLiveConnection(new Request("https://demo.example/api/telefon/live-connect", { method: "POST", headers: { "x-garagen-live-consent": "yes" } })), false);
  assert.equal(acceptsLiveConnection(new Request("https://demo.example/api/telefon/live-connect", { method: "POST", headers: { origin: "https://demo.example" } })), false);
});
