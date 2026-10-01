import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, open, readFile, realpath, rmdir, stat, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parseLiveBaseUrl } from "./live/policy";

export const LIVE_DEMO_MAX_MS = 120_000;
export const LIVE_DEMO_MODEL = "gpt-live-1";
export const LIVE_DEMO_VOICE = "marin";
// Der WebRTC-Browser ist nicht vertrauenswürdig. Die Sideband-Verbindung des
// Servers bleibt davon bewusst unberührt und steuert Begrüßung/Abschluss.
export const LIVE_DEMO_BROWSER_CLIENT_EVENTS = ["session.close"] as const;
export const LIVE_DEMO_BROWSER_SERVER_EVENTS = [
  { type: "session.started" },
  { type: "session.closed" },
  { type: "session.input_transcript.delta" },
  { type: "session.output_transcript.delta" },
  { type: "error" },
] as const;

export const LIVE_DEMO_INSTRUCTIONS = `Du bist Silvia, eine warme, sympathische weibliche Rezeptionistin für eine Cloud-Live-Demo. Sprich kurz, natürlich und auf Österreichisch; ein österreichischer Akzent ist nicht garantiert. Verwende nur die erfundenen Demo-Fakten: Ordination Huber in Wien, Bella und Frau Huber. Keine echte Buchung, keine medizinische Beratung, keine echten Kontaktdaten und keine Tools.

Backchannel policy: Verwende moderate Zuhörsignale und falle der anrufenden Person nicht ins Wort.
Interruption policy: Wenn die Person dich unterbricht, stoppe deine Antwort und höre zu.
Diese Hörprobe hat keine Backend-Fähigkeiten oder Werkzeuge. Begrüßungen und kurze Klärungen beantwortest du selbst. Bei unklaren Namen, Daten oder Zahlen frage gezielt nach und übernimm Korrekturen. Führe keine echte Buchung, Suche, Änderung, Stornierung oder sonstige Tool-Aktion aus.
Behaupte niemals, eine Aktion sei erledigt, wenn sie nicht in dieser Hörprobe möglich ist. Sage bei anderen Wünschen freundlich, dass die Hörprobe das nicht erledigt.`;

type ActiveLiveSession = {
  id: string;
  socket: WebSocket | null;
  startedAt: number;
  closeRequested: boolean;
  uncertain: boolean;
  timer: ReturnType<typeof setTimeout>;
  closeAckTimer: ReturnType<typeof setTimeout> | null;
  stopPending: boolean;
  releaseUncertainOnFinish?: boolean;
  voiceSeconds: number | null;
  finalUsageConfirmed: boolean;
  closeReason: string | null;
  guardLease: LiveDemoGuardLease;
  finishing?: boolean;
};

type LiveDemoSummary = Pick<ActiveLiveSession, "voiceSeconds" | "finalUsageConfirmed" | "closeReason">;
const CLOSE_REASONS = new Set(["close_requested", "expired", "content", "remote_hangup", "connection_lost"]);

type LiveDemoDeps = {
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  guardDir?: string;
  guardAcquire?: () => Promise<LiveDemoGuardAcquire>;
  guardRelease?: (lease: LiveDemoGuardLease) => Promise<boolean>;
  guardStatus?: () => LiveDemoGuardStatus;
};

type LiveDemoGuardLease = { lockDir: string; nonce: string };
type LiveDemoGuardStatus = "ready" | "blocked" | "unconfigured" | "unavailable";
type LiveDemoGuardAcquire =
  | { ok: true; lease: LiveDemoGuardLease }
  | { ok: false; reason: Exclude<LiveDemoGuardStatus, "ready"> };

/** The cloud demo is only safe in an explicitly isolated, RAM-only process. */
export type LiveDemoSandboxStatus = "ready" | "unconfigured" | "persistent-data";

export function liveDemoSandboxStatus(env: NodeJS.ProcessEnv = process.env): LiveDemoSandboxStatus {
  if (env.SILVIA_LIVE_DEMO_SANDBOX !== "1") return "unconfigured";
  const dataDir = env.SILVIA_DATA_DIR?.trim().toLowerCase() ?? "";
  // An unset data dir uses the persistent .silvia-data default; DATABASE_URL is
  // persistent by definition. Accept the documented RAM spellings only.
  const memoryOnly = dataDir === "memory" || dataDir === "memory://" || dataDir === ":memory:";
  if (!memoryOnly || Boolean(env.DATABASE_URL?.trim())) return "persistent-data";
  return "ready";
}

let deps: Omit<Required<LiveDemoDeps>, "guardDir" | "guardAcquire" | "guardRelease" | "guardStatus"> & Pick<LiveDemoDeps, "guardDir" | "guardAcquire" | "guardRelease" | "guardStatus"> = {
  fetch: globalThis.fetch,
  WebSocket,
  setTimeout,
  clearTimeout,
};

export function __setLiveDemoDependenciesForTests(next?: LiveDemoDeps) {
  if (!next) {
    deps = { fetch: globalThis.fetch, WebSocket, setTimeout, clearTimeout };
    return;
  }
  deps = {
    fetch: next.fetch ?? globalThis.fetch,
    WebSocket: next.WebSocket ?? WebSocket,
    setTimeout: next.setTimeout ?? setTimeout,
    clearTimeout: next.clearTimeout ?? clearTimeout,
    guardDir: next.guardDir ?? deps.guardDir,
    guardAcquire: next.guardAcquire,
    guardRelease: next.guardRelease,
    guardStatus: next.guardStatus,
  };
}

const globalRef = globalThis as typeof globalThis & {
  __silviaLiveDemo__?: ActiveLiveSession | null;
  __silviaLiveDemoCreating__?: boolean;
  __silviaLiveDemoUncertain__?: boolean;
  __silviaLiveDemoSummary__?: LiveDemoSummary | null;
};

const LIVE_DEMO_GUARD_LOCK = "silvia-live-demo-active";
const LIVE_DEMO_GUARD_LEASE = "lease.json";

function configuredGuardDir() {
  return deps.guardDir ?? process.env.SILVIA_LIVE_GUARD_DIR ?? "";
}

function persistentGuardStatus(): LiveDemoGuardStatus {
  if (!enabled()) return "ready";
  if (deps.guardStatus) return deps.guardStatus();
  const configured = configuredGuardDir();
  if (!configured || !isAbsolute(configured)) return "unconfigured";
  try {
    const root = realpathSyncSafe(configured);
    if (!root || !existsSync(root) || !statSync(root).isDirectory()) return "unavailable";
    return existsSync(join(root, LIVE_DEMO_GUARD_LOCK)) ? "blocked" : "ready";
  } catch {
    return "unavailable";
  }
}

function realpathSyncSafe(path: string) {
  try { return realpathSync(path); } catch { return ""; }
}

async function acquirePersistentGuard(): Promise<LiveDemoGuardAcquire> {
  if (deps.guardAcquire) return deps.guardAcquire();
  const configured = configuredGuardDir();
  if (!configured || !isAbsolute(configured)) return { ok: false, reason: "unconfigured" };
  let root: string;
  try {
    root = await realpath(configured);
    if (!(await stat(root)).isDirectory()) return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const lockDir = join(root, LIVE_DEMO_GUARD_LOCK);
  try {
    await mkdir(lockDir);
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException).code === "EEXIST" ? "blocked" : "unavailable" };
  }
  const lease: LiveDemoGuardLease = { lockDir, nonce: randomUUID() };
  try {
    const file = await open(join(lockDir, LIVE_DEMO_GUARD_LEASE), "wx");
    try {
      await file.writeFile(JSON.stringify({ version: 1, nonce: lease.nonce }));
      await file.sync();
    } finally {
      await file.close();
    }
    return { ok: true, lease };
  } catch {
    // Der Ordner bleibt absichtlich bestehen: ohne dauerhaft bestätigte Reservierung kein Start.
    return { ok: false, reason: "unavailable" };
  }
}

async function releasePersistentGuard(lease: LiveDemoGuardLease) {
  if (deps.guardRelease) return deps.guardRelease(lease);
  try {
    const stored = JSON.parse(await readFile(join(lease.lockDir, LIVE_DEMO_GUARD_LEASE), "utf8")) as { nonce?: unknown };
    if (stored.nonce !== lease.nonce) return false;
    await unlink(join(lease.lockDir, LIVE_DEMO_GUARD_LEASE));
    await rmdir(lease.lockDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ziel für Live-HTTP und Sideband. Ohne SILVIA_LIVE_BASE_URL bleibt die
 * synthetische Demo bei api.openai.com; ist die Variable gesetzt, muss sie auf
 * den EU-Host zeigen, sonst startet keine Sitzung (fail-closed).
 */
export function liveDemoEndpoints(env: NodeJS.ProcessEnv = process.env):
  | { ok: true; http: string; ws: string }
  | { ok: false } {
  const raw = env.SILVIA_LIVE_BASE_URL?.trim();
  if (!raw) return { ok: true, http: "https://api.openai.com/v1", ws: "wss://api.openai.com/v1" };
  const parsed = parseLiveBaseUrl(raw);
  if (!parsed.ok) return { ok: false };
  return { ok: true, http: `https://${parsed.host}/v1`, ws: `wss://${parsed.host}/v1` };
}

function enabled() {
  return process.env.SILVIA_LIVE_DEMO_ENABLED === "1";
}

export function liveDemoEnabled() {
  return enabled();
}

export function liveDemoStatus() {
  const active = globalRef.__silviaLiveDemo__;
  const summary = active ?? globalRef.__silviaLiveDemoSummary__;
  const guard = persistentGuardStatus();
  const sandbox = liveDemoSandboxStatus();
  return {
    enabled: enabled(),
    active: Boolean(active),
    finalizationUncertain: Boolean(active?.uncertain || globalRef.__silviaLiveDemoUncertain__),
    maxDurationMs: LIVE_DEMO_MAX_MS,
    voiceSeconds: summary?.voiceSeconds ?? null,
    finalUsageConfirmed: summary?.finalUsageConfirmed ?? false,
    closeReason: summary?.closeReason ?? null,
    persistentGuard: guard,
    persistentGuardBlocked: guard !== "ready",
    sandbox,
    sandboxReady: sandbox === "ready",
  };
}

export function liveDemoOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

export function liveDemoMutationAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return origin === new URL(request.url).origin; } catch { return false; }
}

export function liveDemoLoopback(request: Request, requestIP?: string | null) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return false;
  if (requestIP !== undefined && (requestIP === null || !(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/i.test(requestIP)))) return false;
  const host = request.headers.get("host") ?? "";
  return /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/.test(host);
}

export function liveDemoRequestAllowed(request: Request) {
  return liveDemoLoopback(request) && liveDemoOriginAllowed(request);
}

export function liveDemoBodyLimit(request: Request) {
  const raw = request.headers.get("content-length");
  if (raw === null) return true;
  if (!/^\d+$/.test(raw.trim())) return false;
  const length = Number(raw);
  return Number.isSafeInteger(length) && length <= 256_000;
}

export async function readLiveDemoBody(request: Request) {
  if (!liveDemoBodyLimit(request)) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 256_000) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function sendClose(session: ActiveLiveSession) {
  if (session.closeRequested) return;
  session.closeRequested = true;
  session.stopPending = true;
  if (session.socket?.readyState === deps.WebSocket.OPEN) {
    session.stopPending = false;
    session.socket.send(JSON.stringify({ type: "session.close" }));
    session.closeAckTimer = deps.setTimeout(() => { session.uncertain = true; cleanupWS(session); }, 5_000);
  }
}

function cleanupWS(session: ActiveLiveSession) {
  if (session.socket && session.socket.readyState !== deps.WebSocket.CLOSED) session.socket.close();
  session.socket = null;
}

function finish(session: ActiveLiveSession) {
  if (session.finishing) return;
  session.finishing = true;
  deps.clearTimeout(session.timer);
  if (session.closeAckTimer) deps.clearTimeout(session.closeAckTimer);
  cleanupWS(session);
  const isCurrent = globalRef.__silviaLiveDemo__ === session;
  if (isCurrent) {
    globalRef.__silviaLiveDemoSummary__ = {
      voiceSeconds: session.voiceSeconds,
      finalUsageConfirmed: session.finalUsageConfirmed,
      closeReason: session.closeReason,
    };
    globalRef.__silviaLiveDemo__ = null;
    if (session.releaseUncertainOnFinish) globalRef.__silviaLiveDemoUncertain__ = false;
  }
  // Ein fehlgeschlagenes Freigeben lässt den Guard absichtlich liegen. Der
  // nächste Start scheitert dann fail-closed an der persistenten Reservierung.
  void releasePersistentGuard(session.guardLease).catch(() => false);
}

function attachSideband(session: ActiveLiveSession) {
  // Sideband attaches to an already-running session; session.started may have passed.
  // https://developers.openai.com/api/docs/guides/voice-server-controls?api=live#attach-to-the-existing-session
  const greetingInstructionEventId = `silvia-demo-greeting-${session.id}`;
  const greetingCommentaryEventId = `silvia-demo-greeting-begin-${session.id}`;
  let greetingInstructionsSent = false;
  let greetingCommentarySent = false;
  const sendGreetingInstructions = () => {
    if (greetingInstructionsSent || session.closeRequested || session.stopPending || socket.readyState !== deps.WebSocket.OPEN) return;
    greetingInstructionsSent = true;
    socket.send(JSON.stringify({
      type: "session.instructions.append",
      event_id: greetingInstructionEventId,
      delegation_id: null,
      content: "Sprich jetzt auf Deutsch. Begrüße die anrufende Person sofort, ohne auf ihre erste Antwort zu warten, freundlich mit: Grüß Gott, hier ist Silvia von der Ordination Huber. Frage anschließend kurz, wie du helfen darfst, pausiere dann und höre zu.",
    }));
  };
  const sendGreetingCommentary = () => {
    if (!greetingInstructionsSent || greetingCommentarySent || session.closeRequested || session.stopPending || socket.readyState !== deps.WebSocket.OPEN) return;
    greetingCommentarySent = true;
    socket.send(JSON.stringify({
      type: "session.commentary.append",
      event_id: greetingCommentaryEventId,
      delegation_id: null,
      content: "Beginne die Unterhaltung jetzt und befolge die gerade gesetzten Begrüßungsanweisungen.",
    }));
  };
  const socket = new deps.WebSocket(
    `${(liveDemoEndpoints() as { ws: string }).ws}/live/sessions/${encodeURIComponent(session.id)}/attach`,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } },
  );
  session.socket = socket;
  socket.on("open", () => {
    if (session.stopPending) {
      session.stopPending = false;
      socket.send(JSON.stringify({ type: "session.close" }));
      session.closeAckTimer = deps.setTimeout(() => { session.uncertain = true; cleanupWS(session); }, 5_000);
      return;
    }
    sendGreetingInstructions();
  });
  socket.on("message", (raw) => {
    // Sondierung (nur mit SILVIA_LIVE_PROBE_LOG): Ereignistyp und Schlüsselnamen, nie Inhalte.
    if (process.env.SILVIA_LIVE_PROBE_LOG) {
      try {
        const probe = JSON.parse(raw.toString()) as Record<string, unknown>;
        void import("node:fs").then((fs) => fs.appendFileSync(process.env.SILVIA_LIVE_PROBE_LOG as string, JSON.stringify({ t: Date.now() % 1e7, type: probe.type, keys: Object.keys(probe).sort() }) + String.fromCharCode(10)));
      } catch { /* ignorieren */ }
    }
    try {
      const event = JSON.parse(raw.toString()) as { type?: string; client_event_id?: unknown; usage?: { seconds?: unknown }; reason?: unknown };
      if (event.type === "session.instructions.appended" && event.client_event_id === greetingInstructionEventId)
        sendGreetingCommentary();
      const seconds = event.usage?.seconds;
      if ((event.type === "session.usage.updated" || event.type === "session.closed") && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) session.voiceSeconds = seconds;
      if (event.type === "session.closed") {
        const reason = event.reason;
        session.closeReason = typeof reason === "string" && CLOSE_REASONS.has(reason) ? reason : null;
        session.finalUsageConfirmed = typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0;
        finish(session);
      }
    } catch {
      // Unbekannte Events werden für diese begrenzte Demo bewusst ignoriert.
    }
  });
  socket.on("close", () => {
    // Ohne session.closed bleibt die Sitzung absichtlich belegt: der Prozess
    // kann die Kosten-/Lebensdauer dann nicht sicher bestätigen.
    if (globalRef.__silviaLiveDemo__?.id === session.id && !session.closeRequested) session.uncertain = true;
  });
  socket.on("error", () => { session.uncertain = true; });
}

export async function createLiveDemoSession(sdp: string) {
  if (!enabled()) return { status: 404, body: { error: "Die Silvia Live Hörprobe ist derzeit deaktiviert." } };
  const sandbox = liveDemoSandboxStatus();
  if (sandbox !== "ready") {
    const error = sandbox === "persistent-data"
      ? "Die Cloud-Live-Hörprobe ist mit persistenten Praxisdaten gesperrt."
      : "Die Cloud-Live-Hörprobe braucht eine ausdrückliche Sandbox-Konfiguration.";
    return { status: 503, body: { error, sandbox } };
  }
  const endpoints = liveDemoEndpoints();
  if (!endpoints.ok) return { status: 503, body: { error: "Der Live-Endpunkt ist nicht auf den EU-Host eingestellt." } };
  if (!process.env.OPENAI_API_KEY) return { status: 503, body: { error: "Für die Cloud-Live-Demo fehlt der serverseitige OpenAI-Schlüssel." } };
  if (globalRef.__silviaLiveDemo__ || globalRef.__silviaLiveDemoCreating__ || globalRef.__silviaLiveDemoUncertain__) return { status: 429, body: { error: "Es läuft bereits eine Silvia Live Hörprobe." } };
  // Reservierung vor dem Netzwerkaufruf: zwei parallele Klicks dürfen nicht
  // beide die Prüfung bestehen und dadurch zwei kostenpflichtige Sitzungen starten.
  globalRef.__silviaLiveDemoCreating__ = true;
  let requestTimeout: ReturnType<typeof setTimeout> | null = null;
  let rejectTimeout: ((reason?: unknown) => void) | null = null;
  let timedOut = false;
  try {
    const guarded = await acquirePersistentGuard();
    if (!guarded.ok) {
      globalRef.__silviaLiveDemoCreating__ = false;
      const error = guarded.reason === "unconfigured"
        ? "Die Live-Hörprobe braucht einen dauerhaften Schutzordner."
        : guarded.reason === "blocked"
          ? "Die vorige Live-Hörprobe ist noch nicht abschließend bestätigt."
          : "Der Schutz der Live-Hörprobe ist nicht verfügbar.";
      return { status: guarded.reason === "blocked" ? 429 : 503, body: { error } };
    }
    const guardLease = guarded.lease;
    const controller = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    requestTimeout = deps.setTimeout(() => { timedOut = true; controller.abort(); rejectTimeout?.(new Error("Live request timeout")); }, 15_000);
    const operation = (async () => {
      const response = await deps.fetch(`${endpoints.http}/live/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            model: LIVE_DEMO_MODEL,
            audio: { output: { voice: LIVE_DEMO_VOICE } },
            client: {
              data_channel: {
                allowed_client_events: LIVE_DEMO_BROWSER_CLIENT_EVENTS,
                allowed_server_events: LIVE_DEMO_BROWSER_SERVER_EVENTS,
              },
            },
            store: false,
            instructions: LIVE_DEMO_INSTRUCTIONS,
          },
          transport: { type: "webrtc", sdp },
        }),
        signal: controller.signal,
      });
      const body = await response.json();
      return { response, body };
    })();
    operation.then(({ body }) => {
      if (!timedOut) return;
      const id = typeof body?.session?.id === "string" ? body.session.id : "";
      if (!id || globalRef.__silviaLiveDemo__) return;
      const lateSession: ActiveLiveSession = {
        id, socket: null, startedAt: Date.now(), closeRequested: false,
        stopPending: true, uncertain: true,
        voiceSeconds: null, finalUsageConfirmed: false, closeReason: null,
        timer: deps.setTimeout(() => undefined, LIVE_DEMO_MAX_MS), closeAckTimer: null,
        releaseUncertainOnFinish: true,
        guardLease,
      };
      globalRef.__silviaLiveDemo__ = lateSession;
      attachSideband(lateSession);
      sendClose(lateSession);
    }).catch(() => { /* verspätete Fehler sind bereits durch den Timeout behandelt. */ });
    const { response, body } = await Promise.race([operation, timeoutPromise]);
    deps.clearTimeout(requestTimeout);
    requestTimeout = null;
    if (!response.ok) {
      if (process.env.SILVIA_LIVE_PROBE_LOG) {
        const err = (body as { error?: { message?: unknown; type?: unknown; code?: unknown } } | null)?.error;
        void import("node:fs").then((fs) => fs.appendFileSync(process.env.SILVIA_LIVE_PROBE_LOG as string, JSON.stringify({ createFailed: response.status, message: String(err?.message ?? "").slice(0, 300), type: err?.type, code: err?.code }) + String.fromCharCode(10)));
      }
      globalRef.__silviaLiveDemoCreating__ = false;
      return { status: 502, body: { error: "Die Live-Hörprobe konnte nicht gestartet werden." } };
    }
    const id = typeof body?.session?.id === "string" ? body.session.id : "";
    const answer = typeof body?.transport?.sdp === "string" ? body.transport.sdp : "";
    if (!id || !answer) {
      globalRef.__silviaLiveDemoCreating__ = false;
      if (id) {
        const cleanup: ActiveLiveSession = { id, socket: null, startedAt: Date.now(), closeRequested: true, stopPending: true, uncertain: true, voiceSeconds: null, finalUsageConfirmed: false, closeReason: null, timer: deps.setTimeout(() => undefined, LIVE_DEMO_MAX_MS), closeAckTimer: null, guardLease };
        globalRef.__silviaLiveDemo__ = cleanup;
        attachSideband(cleanup);
        sendClose(cleanup);
      } else globalRef.__silviaLiveDemoUncertain__ = true;
      return { status: 502, body: { error: "Die Live-Antwort war unvollständig." } };
    }
    const session: ActiveLiveSession = { id, socket: null, startedAt: Date.now(), closeRequested: false, stopPending: false, uncertain: false, voiceSeconds: null, finalUsageConfirmed: false, closeReason: null, timer: deps.setTimeout(() => sendClose(session), LIVE_DEMO_MAX_MS), closeAckTimer: null, guardLease };
    globalRef.__silviaLiveDemo__ = session;
    globalRef.__silviaLiveDemoCreating__ = false;
    attachSideband(session);
    return { status: 201, body: { session: { id }, transport: { type: "webrtc", sdp: answer } } };
  } catch (error) {
    if (requestTimeout) deps.clearTimeout(requestTimeout);
    globalRef.__silviaLiveDemoCreating__ = false;
    globalRef.__silviaLiveDemoUncertain__ = true;
    throw error;
  }
}

export function closeLiveDemoSession() {
  const session = globalRef.__silviaLiveDemo__;
  if (!session) return false;
  sendClose(session);
  return true;
}

export function closeLiveDemoForId(id: string) {
  const session = globalRef.__silviaLiveDemo__;
  if (!session || session.id !== id) return false;
  sendClose(session);
  return true;
}
