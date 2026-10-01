import assert from "node:assert/strict";
import test from "node:test";
import { fetchJsonWithTimeout } from "./live-demo-request";

function abortablePending(signal: AbortSignal) {
  return new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
}

test("begrenzt eine hängende Header-Anfrage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => abortablePending(init?.signal as AbortSignal)) as typeof fetch;
  try { await assert.rejects(fetchJsonWithTimeout("/status", {}, { timeoutMs: 10, label: "Status" }), /Status Zeitüberschreitung/); }
  finally { globalThis.fetch = originalFetch; }
});

test("begrenzt einen hängenden JSON-Body", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => ({ ok: true, json: () => abortablePending(init?.signal as AbortSignal) })) as unknown as typeof fetch;
  try { await assert.rejects(fetchJsonWithTimeout("/create", {}, { timeoutMs: 10, label: "Create" }), /Create Zeitüberschreitung/); }
  finally { globalThis.fetch = originalFetch; }
});

test("liefert erfolgreiches JSON unverändert", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ ok: true }) })) as unknown as typeof fetch;
  try { assert.deepEqual((await fetchJsonWithTimeout("/status", {}, { timeoutMs: 100 })).result, { ok: true }); }
  finally { globalThis.fetch = originalFetch; }
});

test("unterscheidet äußeren Abbruch vom Timeout", async () => {
  const originalFetch = globalThis.fetch;
  const cancellation = new Error("manuell abgebrochen");
  globalThis.fetch = ((_input, init) => new Promise<never>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(cancellation), { once: true });
  })) as typeof fetch;
  const controller = new AbortController();
  try {
    const pending = fetchJsonWithTimeout("/create", {}, { signal: controller.signal, timeoutMs: 100 });
    controller.abort();
    await assert.rejects(pending, (error) => error === cancellation);
  } finally { globalThis.fetch = originalFetch; }
});
