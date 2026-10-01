/* eslint-disable @typescript-eslint/no-this-alias -- Test-Doubles müssen ihre Instanz weiterreichen. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import {
  createLiveDemoSession,
  LIVE_DEMO_BROWSER_CLIENT_EVENTS,
  LIVE_DEMO_BROWSER_SERVER_EVENTS,
  LIVE_DEMO_INSTRUCTIONS,
  liveDemoBodyLimit,
  liveDemoLoopback,
  liveDemoOriginAllowed,
  liveDemoRequestAllowed,
  liveDemoMutationAllowed,
  readLiveDemoBody,
  closeLiveDemoSession,
  liveDemoStatus,
  __setLiveDemoDependenciesForTests,
  liveDemoSandboxStatus,
} from "./live-demo.server";

type LiveStartPayload = {
  session?: {
    model?: unknown;
    audio?: { output?: { voice?: unknown } };
    store?: unknown;
    instructions?: unknown;
    delegation?: unknown;
    client?: {
      data_channel?: {
        allowed_client_events?: unknown;
        allowed_server_events?: unknown;
      };
    };
  };
  transport?: unknown;
};

// Erfolgsfälle laufen bewusst nur in dieser expliziten, nicht-persistenten Test-Sandbox.
test.beforeEach(() => {
  process.env.SILVIA_LIVE_DEMO_SANDBOX = "1";
  process.env.SILVIA_DATA_DIR = "memory";
  delete process.env.DATABASE_URL;
});

test("Live-Demo-Prompt bleibt bei statischen erfundenen Fakten", () => {
  assert.match(LIVE_DEMO_INSTRUCTIONS, /erfundenen Demo-Fakten/);
  assert.match(LIVE_DEMO_INSTRUCTIONS, /keine echte Buchung/i);
  for (const forbidden of ["Vquadrat", "Praxissoftware", "Rufnummer", "Telefonnummer", "Patientenakte", "SILVIA_"]) {
    assert.equal(LIVE_DEMO_INSTRUCTIONS.includes(forbidden), false, `unerlaubter Live-Prompt-Begriff: ${forbidden}`);
  }
});

const request = (headers: Record<string, string>) =>
  new Request("http://localhost:8080/api/live-demo/status", { headers });
const liveState = globalThis as typeof globalThis & { __silviaLiveDemo__?: unknown; __silviaLiveDemoCreating__?: boolean; __silviaLiveDemoUncertain__?: boolean; __silviaLiveDemoSummary__?: unknown };
const guardBase = mkdtempSync(join(tmpdir(), "silvia-live-demo-guard-"));
let guardRoot = "";
let guardLock = "";
const resetLiveState = () => {
  liveState.__silviaLiveDemo__ = null;
  liveState.__silviaLiveDemoCreating__ = false;
  liveState.__silviaLiveDemoUncertain__ = false;
  liveState.__silviaLiveDemoSummary__ = null;
  guardRoot = mkdtempSync(join(guardBase, "case-"));
  guardLock = join(guardRoot, "silvia-live-demo-active");
  __setLiveDemoDependenciesForTests({ guardDir: guardRoot });
};
const waitForGuardRelease = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!existsSync(guardLock)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Der Test-Guard wurde nach session.closed nicht freigegeben.");
};
const waitFor = async (ready: () => boolean, message: string) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
};
const reserveInSeparateProcess = async (dir: string) => await new Promise<number>((resolve, reject) => {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/lib/live-demo.server.ts")).href;
  const program = `
    const mod = await import(${JSON.stringify(moduleUrl)});
    class Socket { static OPEN = 1; static CLOSED = 3; readyState = 1; on() { return this; } send() {} close() {} }
    mod.__setLiveDemoDependenciesForTests({
      fetch: async () => new Response(JSON.stringify({ session: { id: "synthetic" }, transport: { sdp: "answer" } }), { status: 200 }),
      WebSocket: Socket,
      setTimeout: () => 1,
      clearTimeout: () => {},
    });
    const result = await mod.createLiveDemoSession("offer");
    process.stdout.write(String(result.status));
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", program], {
    cwd: process.cwd(),
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) =>
        ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"].includes(key.toUpperCase()))),
      SILVIA_LIVE_DEMO_ENABLED: "1", SILVIA_LIVE_DEMO_SANDBOX: "1", SILVIA_DATA_DIR: "memory", OPENAI_API_KEY: "test-only", SILVIA_LIVE_GUARD_DIR: dir,
    },
    windowsHide: true,
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errors += chunk; });
  child.once("error", reject);
  child.once("close", (code) => {
    if (code !== 0) reject(new Error(`Test-Unterprozess fehlgeschlagen (${code}): ${errors.slice(0, 200)}`));
    else resolve(Number(output));
  });
});

test.after(() => {
  __setLiveDemoDependenciesForTests();
  rmSync(guardBase, { recursive: true, force: true, maxRetries: 3, retryDelay: 20 });
});

test("Live-Demo akzeptiert nur Loopback und lokale Origins", () => {
  assert.equal(liveDemoRequestAllowed(request({ host: "localhost:8080", origin: "http://localhost:8080" })), true);
  assert.equal(liveDemoRequestAllowed(request({ host: "127.0.0.1:8080", origin: "https://127.0.0.1:8080" })), true);
  assert.equal(liveDemoRequestAllowed(request({ host: "example.test", origin: "http://localhost:8080" })), false);
  assert.equal(liveDemoOriginAllowed(request({ origin: "https://example.test" })), false);
  assert.equal(liveDemoLoopback(request({ host: "localhost:8080", "x-forwarded-for": "127.0.0.1" })), false);
  assert.equal(liveDemoLoopback(request({ host: "localhost:8080" }), "8.8.8.8"), false);
});

test("Live-Demo begrenzt Content-Length und erlaubt fehlende Längenangabe", () => {
  assert.equal(liveDemoBodyLimit(request({ "content-length": "256000" })), true);
  assert.equal(liveDemoBodyLimit(request({ "content-length": "256001" })), false);
  assert.equal(liveDemoBodyLimit(request({})), true);
  assert.equal(liveDemoBodyLimit(request({ "content-length": "-1" })), false);
  assert.equal(liveDemoBodyLimit(request({ "content-length": "abc" })), false);
});

test("Sandbox-Gate blockiert aktivierte Demo ohne ausdrückliche Sandbox vor Netzwerk", async () => {
  assert.equal(liveDemoSandboxStatus({ SILVIA_LIVE_DEMO_ENABLED: "1", SILVIA_DATA_DIR: "memory" }), "unconfigured");
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldSandbox = process.env.SILVIA_LIVE_DEMO_SANDBOX;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1";
  delete process.env.SILVIA_LIVE_DEMO_SANDBOX;
  process.env.OPENAI_API_KEY = "test-only";
  let calls = 0;
  __setLiveDemoDependenciesForTests({ fetch: async () => { calls += 1; throw new Error("network must not be reached"); } });
  try {
    const result = await createLiveDemoSession("offer");
    assert.equal(result.status, 503); assert.equal(calls, 0);
  } finally {
    __setLiveDemoDependenciesForTests();
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldSandbox === undefined) delete process.env.SILVIA_LIVE_DEMO_SANDBOX; else process.env.SILVIA_LIVE_DEMO_SANDBOX = oldSandbox;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Sandbox-Gate blockiert persistente Praxisdaten vor Netzwerk", async () => {
  assert.equal(liveDemoSandboxStatus({ SILVIA_LIVE_DEMO_SANDBOX: "1", SILVIA_DATA_DIR: "C:\\praxisdaten" }), "persistent-data");
  assert.equal(liveDemoSandboxStatus({ SILVIA_LIVE_DEMO_SANDBOX: "1", SILVIA_DATA_DIR: "memory", DATABASE_URL: "postgres://praxis" }), "persistent-data");
});

test("Mutation verlangt exakt die Origin der Request-URL und liest den Stream begrenzt", async () => {
  const same = new Request("http://localhost:8080/api/live-demo/create", { method: "POST", headers: { origin: "http://localhost:8080" }, body: "{}" });
  const other = new Request("http://localhost:8080/api/live-demo/create", { method: "POST", headers: { origin: "http://localhost:8081" }, body: "{}" });
  assert.equal(liveDemoMutationAllowed(same), true);
  assert.equal(liveDemoMutationAllowed(other), false);
  assert.equal(liveDemoMutationAllowed(new Request(same.url, { method: "POST", body: "{}" })), false);
  const oversized = new Request(same.url, { method: "POST", body: new Uint8Array(256_001) });
  assert.equal(await readLiveDemoBody(oversized), null);
});

test("Live-Hörprobe konfiguriert kein Responses-Hintergrundmodell", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-only";
  resetLiveState();
  const capture: { payload: LiveStartPayload | null } = { payload: null };
  class FakeSocket {
    static OPEN = 1; static CLOSED = 3; readyState = 1;
    on() { return this; } send() {} close() {}
  }
  globalThis.fetch = async (_input, init) => {
    capture.payload = JSON.parse(String(init?.body ?? "")) as LiveStartPayload;
    return new Response(JSON.stringify({ session: { id: "without-delegation" }, transport: { sdp: "answer" } }), { status: 200 });
  };
  try {
    __setLiveDemoDependenciesForTests({
      fetch: globalThis.fetch,
      WebSocket: FakeSocket as any,
      setTimeout: (() => 1 as any) as any,
      clearTimeout: (() => {}) as any,
    });
    assert.equal((await createLiveDemoSession("offer")).status, 201);
    assert.ok(capture.payload);
    assert.equal(capture.payload.session?.model, "gpt-live-1");
    assert.equal(capture.payload.session?.audio?.output?.voice, "marin");
    assert.equal(capture.payload.session?.store, false);
    assert.equal(capture.payload.session?.instructions, LIVE_DEMO_INSTRUCTIONS);
    assert.deepEqual(
      capture.payload.session?.client?.data_channel?.allowed_client_events,
      LIVE_DEMO_BROWSER_CLIENT_EVENTS,
    );
    assert.deepEqual(
      capture.payload.session?.client?.data_channel?.allowed_server_events,
      LIVE_DEMO_BROWSER_SERVER_EVENTS,
    );
    assert.equal(Object.prototype.hasOwnProperty.call(capture.payload.session ?? {}, "delegation"), false);
    assert.deepEqual(capture.payload.transport, { type: "webrtc", sdp: "offer" });
  } finally {
    globalThis.fetch = oldFetch;
    __setLiveDemoDependenciesForTests();
    resetLiveState();
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Stop vor WebSocket-open wird nachgeholt und session.closed räumt die Sitzung frei", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-only";
  resetLiveState();
  const oldFetch = globalThis.fetch;
  const sent: string[] = [];
  class FakeSocket {
    static OPEN = 1; static CLOSED = 3;
    readyState = 0;
    private listeners = new Map<string, ((value?: any) => void)[]>();
    constructor(_url: string, _options: unknown) {}
    on(name: string, fn: (value?: any) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]); return this; }
    send(value: string) { sent.push(value); }
    close() { this.readyState = 3; for (const fn of this.listeners.get("close") ?? []) fn(); }
    emit(name: string, value?: any) { if (name === "open") this.readyState = 1; for (const fn of this.listeners.get(name) ?? []) fn(value); }
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ session: { id: "session-1" }, transport: { sdp: "answer" } }), { status: 200 });
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any });
    const created = await createLiveDemoSession("offer");
    assert.equal(created.status, 201);
    assert.equal(closeLiveDemoSession(), true);
    assert.equal(sent.length, 0);
    const active = (globalThis as typeof globalThis & { __silviaLiveDemo__?: { socket?: FakeSocket } }).__silviaLiveDemo__;
    active?.socket?.emit("open");
    assert.equal(sent.some((value) => value.includes("session.close")), true);
    assert.equal(sent.some((value) => value.includes("session.instructions.append")), false);
    active?.socket?.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) });
    assert.equal(liveDemoStatus().active, false);
  } finally {
    __setLiveDemoDependenciesForTests();
    globalThis.fetch = oldFetch;
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Usage-Snapshots und dokumentierte close-Gründe bleiben datensparsam", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY; const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let socket!: any;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 1; listeners = new Map<string, ((v?: any) => void)[]>(); constructor() { socket = this; } on(n: string, f: (v?: any) => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); return this; } send() {} close() {} emit(n: string, v?: any) { for (const f of this.listeners.get(n) ?? []) f(v); } }
  globalThis.fetch = async () => new Response(JSON.stringify({ session: { id: "usage-1" }, transport: { sdp: "answer" } }), { status: 200 });
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any });
    await createLiveDemoSession("offer");
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: 3 } }) });
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: 3 } }) });
    assert.equal(liveDemoStatus().voiceSeconds, 3);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: 7 } }) });
    assert.equal(liveDemoStatus().voiceSeconds, 7);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: 0 } }) });
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: -1 } }) });
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.usage.updated", usage: { seconds: "9" } }) });
    assert.equal(liveDemoStatus().voiceSeconds, 0);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed", reason: "unknown" }) });
    assert.deepEqual({ voiceSeconds: liveDemoStatus().voiceSeconds, finalUsageConfirmed: liveDemoStatus().finalUsageConfirmed, closeReason: liveDemoStatus().closeReason }, { voiceSeconds: 0, finalUsageConfirmed: false, closeReason: null });
    await waitForGuardRelease();
    const oldSocket = socket;
    await createLiveDemoSession("second-offer");
    oldSocket.emit("message", { toString: () => JSON.stringify({ type: "session.closed", usage: { seconds: 999 }, reason: "close_requested" }) });
    assert.equal(liveDemoStatus().voiceSeconds, null);
    assert.equal(liveDemoStatus().active, true);
    socket.emit("message", { toString: () => JSON.stringify({ type: "unrelated", usage: { seconds: 123 } }) });
    assert.equal(liveDemoStatus().voiceSeconds, null);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed", usage: { seconds: 8 }, reason: "close_requested" }) });
    assert.deepEqual({ voiceSeconds: liveDemoStatus().voiceSeconds, finalUsageConfirmed: liveDemoStatus().finalUsageConfirmed, closeReason: liveDemoStatus().closeReason }, { voiceSeconds: 8, finalUsageConfirmed: true, closeReason: "close_requested" });
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Sideband löst die Begrüßung erst nach bestätigter Anweisung genau einmal aus", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-only";
  resetLiveState();
  const sent: string[] = [];
  let socket!: any;
  class FakeSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    listeners = new Map<string, ((v?: any) => void)[]>();
    constructor() { socket = this; }
    on(n: string, f: (v?: any) => void) {
      this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]);
      return this;
    }
    send(v: string) { sent.push(v); }
    close() {}
    emit(n: string, v?: any) {
      if (n === "open") this.readyState = 1;
      for (const f of this.listeners.get(n) ?? []) f(v);
    }
  }
  globalThis.fetch = async () => new Response(
    JSON.stringify({ session: { id: "open-only" }, transport: { sdp: "answer" } }),
    { status: 200 },
  );
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any });
    await createLiveDemoSession("offer");
    socket.emit("open");
    assert.equal(sent.filter((v) => v.includes("session.instructions.append")).length, 1);
    assert.equal(sent.filter((v) => v.includes("session.commentary.append")).length, 0);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.instructions.appended", client_event_id: "wrong-event" }) });
    assert.equal(sent.filter((v) => v.includes("session.commentary.append")).length, 0);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.instructions.appended", client_event_id: "silvia-demo-greeting-open-only" }) });
    assert.equal(sent.filter((v) => v.includes("session.commentary.append")).length, 1);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.instructions.appended", client_event_id: "silvia-demo-greeting-open-only" }) });
    assert.equal(sent.filter((v) => v.includes("session.commentary.append")).length, 1);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.started" }) });
    assert.equal(sent.filter((v) => v.includes("session.instructions.append")).length, 1);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) });
  } finally {
    __setLiveDemoDependenciesForTests();
    resetLiveState();
    globalThis.fetch = oldFetch;
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED;
    else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Unsicherer Netzwerkstart blockiert weitere Starts", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only";
  resetLiveState();
  try {
    __setLiveDemoDependenciesForTests({ fetch: async () => { throw new Error("network"); } });
    await assert.rejects(() => createLiveDemoSession("offer"));
    assert.equal((await createLiveDemoSession("offer")).status, 429);
  } finally {
    __setLiveDemoDependenciesForTests();
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("paralleler Start reserviert genau einen externen Start", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-only";
  resetLiveState();
  let calls = 0;
  let release!: (response: Response) => void;
  globalThis.fetch = async () => {
    calls += 1;
    return await new Promise<Response>((resolve) => { release = resolve; });
  };
  __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch });
  try {
    const first = createLiveDemoSession("offer");
    await waitFor(() => calls === 1, "Der erste Start erreichte fetch nicht.");
    const second = await createLiveDemoSession("offer");
    assert.equal(second.status, 429);
    assert.equal(calls, 1);
    release(new Response(JSON.stringify({}), { status: 200 }));
    assert.equal((await first).status, 502);
  } finally {
    __setLiveDemoDependenciesForTests();
    resetLiveState();
    globalThis.fetch = oldFetch;
    if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED;
    else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Close-Ack-Timeout markiert unsicher und räumt den WebSocket auf", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  const oldFetch = globalThis.fetch; let fireTimeout!: () => void; let socket!: any;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 0; listeners = new Map<string, ((v?: any) => void)[]>();
    constructor() { socket = this; } on(n: string, f: (v?: any) => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); return this; }
    send() {} close() { this.readyState = 3; } emit(n: string, v?: any) { if (n === "open") this.readyState = 1; for (const f of this.listeners.get(n) ?? []) f(v); } }
  globalThis.fetch = async () => new Response(JSON.stringify({ session: { id: "ack-timeout" }, transport: { sdp: "answer" } }), { status: 200 });
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any, setTimeout: ((fn: () => void, ms?: number) => { if (ms === 5_000) fireTimeout = fn; return 1 as any; }) as any, clearTimeout: (() => {}) as any });
    await createLiveDemoSession("offer"); socket.emit("open"); closeLiveDemoSession(); fireTimeout();
    assert.equal(socket.readyState, 3); assert.equal(liveDemoStatus().active, true); assert.equal(liveDemoStatus().finalizationUncertain, true);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("2xx mit Session-ID ohne SDP blockiert bis session.closed und wird per Attach geschlossen", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  const oldFetch = globalThis.fetch; const sent: string[] = []; let socket!: any;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 0; listeners = new Map<string, ((v?: any) => void)[]>(); constructor() { socket = this; } on(n: string, f: (v?: any) => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); return this; } send(v: string) { sent.push(v); } close() { this.readyState = 3; } emit(n: string, v?: any) { if (n === "open") this.readyState = 1; for (const f of this.listeners.get(n) ?? []) f(v); } }
  globalThis.fetch = async () => new Response(JSON.stringify({ session: { id: "orphan" }, transport: {} }), { status: 200 });
  try { __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any, setTimeout: (() => 1 as any) as any, clearTimeout: (() => {}) as any }); const result = await createLiveDemoSession("offer"); assert.equal(result.status, 502); assert.equal((await createLiveDemoSession("offer")).status, 429); socket.emit("open"); assert.equal(sent.some((v) => v.includes("session.close")), true); socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) }); assert.equal(liveDemoStatus().active, false); }
  finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Deaktivierter Live-Server ruft fetch nicht auf", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY; const oldFetch = globalThis.fetch; let calls = 0;
  delete process.env.SILVIA_LIVE_DEMO_ENABLED; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  try { __setLiveDemoDependenciesForTests({ fetch: async () => { calls += 1; return new Response(); } }); assert.equal((await createLiveDemoSession("offer")).status, 404); assert.equal(calls, 0); }
  finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("persistente Reservierung blockiert nach simuliertem Prozessneustart ohne weiteren externen Start", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY; const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let calls = 0;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 1; on() { return this; } send() {} close() {} }
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ session: { id: "restart-guard" }, transport: { sdp: "answer" } }), { status: 200 });
  };
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any, guardDir: guardRoot, setTimeout: (() => 1 as any) as any, clearTimeout: (() => {}) as any });
    assert.equal((await createLiveDemoSession("offer")).status, 201);
    assert.equal(calls, 1);
    // Simuliert nur den RAM-Verlust eines neuen Prozesses; die echte Test-Reservierung bleibt bestehen.
    liveState.__silviaLiveDemo__ = null; liveState.__silviaLiveDemoCreating__ = false; liveState.__silviaLiveDemoUncertain__ = false; liveState.__silviaLiveDemoSummary__ = null;
    const blocked = await createLiveDemoSession("offer-after-restart");
    assert.equal(blocked.status, 429);
    assert.equal(calls, 1);
    // Unter Windows kann die rein diagnostische Pfadprüfung kurzzeitig nicht
    // lesbar sein. Entscheidend ist der Fail-Closed-Zustand: kein zweiter
    // Start und keine Freigabe der persistenten Reservierung.
    assert.deepEqual({ active: liveDemoStatus().active, persistentGuardBlocked: liveDemoStatus().persistentGuardBlocked }, { active: false, persistentGuardBlocked: true });
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("nur session.closed gibt die eigene persistente Reservierung frei", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY; const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let calls = 0; let socket!: any;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 1; listeners = new Map<string, ((value?: any) => void)[]>(); constructor() { socket = this; } on(name: string, fn: (value?: any) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]); return this; } send() {} close() {} emit(name: string, value?: any) { for (const fn of this.listeners.get(name) ?? []) fn(value); } }
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ session: { id: `closed-${calls}` }, transport: { sdp: "answer" } }), { status: 200 });
  };
  try {
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, WebSocket: FakeSocket as any, guardDir: guardRoot, setTimeout: (() => 1 as any) as any, clearTimeout: (() => {}) as any });
    assert.equal((await createLiveDemoSession("offer")).status, 201);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed", reason: "close_requested" }) });
    assert.equal(liveDemoStatus().finalUsageConfirmed, false);
    await waitForGuardRelease();
    assert.equal((await createLiveDemoSession("offer-again")).status, 201);
    assert.equal(calls, 2);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("nicht verfügbare persistente Reservierung blockiert vor fetch ohne interne Fehlerdetails", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let calls = 0;
  try {
    __setLiveDemoDependenciesForTests({ guardDir: guardRoot, guardAcquire: async () => ({ ok: false, reason: "unavailable" }), fetch: async () => { calls += 1; return new Response(); } });
    const result = await createLiveDemoSession("offer");
    assert.equal(result.status, 503);
    assert.equal(calls, 0);
    assert.equal(result.body.error, "Der Schutz der Live-Hörprobe ist nicht verfügbar.");
    assert.equal(result.body.error.includes(guardRoot), false);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("fehlender oder relativer Schutzordner blockiert vor fetch", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY; const oldGuard = process.env.SILVIA_LIVE_GUARD_DIR; const oldFetch = globalThis.fetch;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; delete process.env.SILVIA_LIVE_GUARD_DIR; resetLiveState();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  try {
    __setLiveDemoDependenciesForTests();
    assert.equal((await createLiveDemoSession("offer")).status, 503);
    __setLiveDemoDependenciesForTests({ fetch: globalThis.fetch, guardDir: "relative-guard" });
    assert.equal((await createLiveDemoSession("offer")).status, 503);
    assert.equal(calls, 0);
    assert.equal(liveDemoStatus().persistentGuard, "unconfigured");
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); globalThis.fetch = oldFetch; if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; if (oldGuard === undefined) delete process.env.SILVIA_LIVE_GUARD_DIR; else process.env.SILVIA_LIVE_GUARD_DIR = oldGuard; }
});

test("ein nicht beschreibbarer Schutzpfad blockiert vor fetch", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  const filePath = join(guardRoot, "not-a-directory");
  writeFileSync(filePath, "synthetic");
  let calls = 0;
  try {
    __setLiveDemoDependenciesForTests({ guardDir: filePath, fetch: async () => { calls += 1; return new Response(); } });
    const result = await createLiveDemoSession("offer");
    assert.equal(result.status, 503);
    assert.equal(calls, 0);
    assert.equal(liveDemoStatus().persistentGuard, "unavailable");
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("zwei getrennte Prozesse reservieren denselben Schutzordner atomar", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  try {
    const statuses = await Promise.all([reserveInSeparateProcess(guardRoot), reserveInSeparateProcess(guardRoot)]);
    assert.deepEqual(statuses.sort((left, right) => left - right), [201, 429]);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Fetch-Timeout umfasst hängende Header-Anfrage ohne unbehandelte Promise", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let fireTimeout!: () => void;
  try {
    __setLiveDemoDependenciesForTests({ fetch: async () => new Promise<Response>(() => {}), setTimeout: ((fn: () => void) => { fireTimeout = fn; return 1 as any; }) as any, clearTimeout: (() => {}) as any });
    const start = createLiveDemoSession("offer"); await waitFor(() => Boolean(fireTimeout), "Der Timeout wurde nicht gesetzt."); fireTimeout();
    await assert.rejects(start, /timeout/i);
    assert.equal((await createLiveDemoSession("offer")).status, 429);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Fetch-Timeout umfasst hängendes JSON und blockiert danach neue Starts", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let fireTimeout!: () => void;
  try {
    __setLiveDemoDependenciesForTests({ fetch: async () => ({ ok: true, json: async () => new Promise<unknown>(() => {}) } as Response), setTimeout: ((fn: () => void) => { fireTimeout = fn; return 1 as any; }) as any, clearTimeout: (() => {}) as any });
    const start = createLiveDemoSession("offer"); await waitFor(() => Boolean(fireTimeout), "Der Timeout wurde nicht gesetzt."); fireTimeout();
    await assert.rejects(start, /timeout/i);
    assert.equal((await createLiveDemoSession("offer")).status, 429);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Verspätete Session-ID wird per Sideband geschlossen und gibt den Slot erst danach frei", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let fireTimeout!: () => void; let release!: (response: Response) => void; let socket!: any; const sent: string[] = [];
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 0; listeners = new Map<string, ((v?: any) => void)[]>(); constructor() { socket = this; } on(n: string, f: (v?: any) => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); return this; } send(v: string) { sent.push(v); } close() { this.readyState = 3; } emit(n: string, v?: any) { if (n === "open") this.readyState = 1; for (const f of this.listeners.get(n) ?? []) f(v); } }
  try {
    __setLiveDemoDependenciesForTests({
      fetch: async () => new Promise<Response>((resolve) => { release = resolve; }), WebSocket: FakeSocket as any,
      setTimeout: ((fn: () => void, ms?: number) => { if (ms === 15_000) fireTimeout = fn; return 1 as any; }) as any,
      clearTimeout: (() => {}) as any,
    });
    const start = createLiveDemoSession("offer"); await waitFor(() => Boolean(fireTimeout), "Der Timeout wurde nicht gesetzt."); fireTimeout();
    await assert.rejects(start, /timeout/i);
    assert.equal((await createLiveDemoSession("offer")).status, 429);
    release(new Response(JSON.stringify({ session: { id: "late-session" }, transport: { sdp: "answer" } }), { status: 200 }));
    await new Promise((resolve) => setImmediate(resolve));
    socket.emit("open");
    assert.equal(sent.some((value) => value.includes("session.close")), true);
    assert.equal((await createLiveDemoSession("offer")).status, 429);
    socket.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) });
    assert.equal(liveDemoStatus().active, false);
    assert.equal(liveDemoStatus().finalizationUncertain, false);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});

test("Altes session.closed hebt Unsicherheit eines neueren Starts nicht auf", async () => {
  const oldEnabled = process.env.SILVIA_LIVE_DEMO_ENABLED; const oldKey = process.env.OPENAI_API_KEY;
  process.env.SILVIA_LIVE_DEMO_ENABLED = "1"; process.env.OPENAI_API_KEY = "test-only"; resetLiveState();
  let fireTimeout!: () => void; let release!: (response: Response) => void; let oldSocket!: any;
  let fetchCalls = 0;
  class FakeSocket { static OPEN = 1; static CLOSED = 3; readyState = 0; listeners = new Map<string, ((v?: any) => void)[]>(); constructor() { oldSocket = this; } on(n: string, f: (v?: any) => void) { this.listeners.set(n, [...(this.listeners.get(n) ?? []), f]); return this; } send() {} close() { this.readyState = 3; } emit(n: string, v?: any) { if (n === "open") this.readyState = 1; for (const f of this.listeners.get(n) ?? []) f(v); } }
  try {
    __setLiveDemoDependenciesForTests({
      fetch: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) return new Promise<Response>((resolve) => { release = resolve; });
        return new Promise<Response>(() => {});
      }, WebSocket: FakeSocket as any,
      setTimeout: ((fn: () => void, ms?: number) => { if (ms === 15_000) fireTimeout = fn; return 1 as any; }) as any,
      clearTimeout: (() => {}) as any,
    });
    const first = createLiveDemoSession("offer"); await waitFor(() => Boolean(fireTimeout), "Der Timeout wurde nicht gesetzt."); fireTimeout(); await assert.rejects(first, /timeout/i);
    release(new Response(JSON.stringify({ session: { id: "late-old" }, transport: { sdp: "answer" } }), { status: 200 }));
    await new Promise((resolve) => setImmediate(resolve)); oldSocket.emit("open");
    oldSocket.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) });
    await waitForGuardRelease();
    assert.equal(liveDemoStatus().finalizationUncertain, false);
    fireTimeout = undefined as unknown as () => void;
    const second = createLiveDemoSession("offer"); await waitFor(() => Boolean(fireTimeout), "Der Timeout wurde nicht gesetzt."); fireTimeout(); await assert.rejects(second, /timeout/i);
    assert.equal(liveDemoStatus().finalizationUncertain, true);
    oldSocket.emit("message", { toString: () => JSON.stringify({ type: "session.closed" }) });
    assert.equal(liveDemoStatus().finalizationUncertain, true);
  } finally { __setLiveDemoDependenciesForTests(); resetLiveState(); if (oldEnabled === undefined) delete process.env.SILVIA_LIVE_DEMO_ENABLED; else process.env.SILVIA_LIVE_DEMO_ENABLED = oldEnabled; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
