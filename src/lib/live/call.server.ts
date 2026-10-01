/**
 * Live-Wrapper, Stufe 6: produktiver Live-Anruf über die öffentliche Leitung.
 *
 * Ablauf: Freigabe-Politik (EU, ZDR, DPA) -> Praxis laden -> Stimmen-Stufe und
 * Minutenkonto -> Sitzung bei OpenAI (EU-Host, store:false) -> Sideband-Brücke.
 * Live hört und spricht; entschieden, gebucht und protokolliert wird hier, auf
 * unserem Server. Scheitert eine Bedingung, antwortet der Server mit
 * `fallback: true`, und der Aufrufer nutzt die lokale Stimme (Premium).
 *
 * Es wird kein Audio und kein Transkript gespeichert. Das Audit-Protokoll enthält
 * nur Metadaten. Server-only; nicht aus Client-Komponenten importieren.
 */
import WebSocket from "ws";
import {
  LIVE_DEMO_BROWSER_CLIENT_EVENTS,
  LIVE_DEMO_BROWSER_SERVER_EVENTS,
  LIVE_DEMO_MODEL,
  LIVE_DEMO_VOICE,
} from "../live-demo.server";
import type { SilviaAction } from "../alma/actions";
import { buildLiveAuditRecord, type LiveAuditRecord } from "./audit";
import { createLiveBridge } from "./bridge";
import { monthKeyOf, recordUsage, rolloverIfNewMonth, type LiveBudget } from "./budget";
import { resolveLivePolicy } from "./policy";
import { buildLiveInstructions, disclosureGreeting } from "./prompt";
import { chooseVoiceTier } from "./tier";
import { decideLiveTurn } from "./turn";

type Env = Record<string, string | undefined>;

export type LiveCallProfile = {
  id: string;
  name: string;
  hours: { day: string; time: string }[];
  nachtdienstPhone: string;
};

export type LiveCallPersist = (input: {
  user: string;
  reply: string;
  action: SilviaAction;
  lines: { role: "user" | "assistant"; content: string }[];
  slug: string;
  callId: string;
  idempotencyKey: string;
}) => Promise<void>;

export type LiveCallDeps = {
  fetch: typeof fetch;
  WebSocket: typeof WebSocket;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  env: Env;
  now: () => Date;
  loadProfile: (slug: string) => Promise<LiveCallProfile | null>;
  /** Vollprofil für Antwortlogik (desk); Test-Naht. */
  deskFor: (slug: string) => Promise<import("../alma/desk").Desk | null>;
  persist: LiveCallPersist;
  audit: (record: LiveAuditRecord) => void;
  budgets: Map<string, LiveBudget>;
};

/** Minutenkonten leben im Prozess; nach einem Neustart beginnt das Konto neu (bewusst konservativ genug für den Pilot). */
const processBudgets = new Map<string, LiveBudget>();
let activeCalls = 0;

/** Nur für Tests: Zähler und Konten zurücksetzen. */
export function __resetLiveCallStateForTests() {
  activeCalls = 0;
  processBudgets.clear();
}

export const LIVE_CALL_RESULT_FALLBACK = { fallback: true } as const;

function defaultDeps(): LiveCallDeps {
  return {
    fetch: globalThis.fetch,
    WebSocket,
    setTimeout,
    clearTimeout,
    env: process.env,
    now: () => new Date(),
    loadProfile: async (slug) => {
      const { fetchProfileBySlug } = await import("../practice/profile-data.server");
      const p = await fetchProfileBySlug(slug);
      return p ? { id: p.id, name: p.name, hours: p.hours, nachtdienstPhone: p.nachtdienstPhone } : null;
    },
    deskFor: async (slug) => {
      const { fetchProfileBySlug } = await import("../practice/profile-data.server");
      const { deskFromProfile } = await import("../alma/desk");
      const p = await fetchProfileBySlug(slug);
      return p ? deskFromProfile(p) : null;
    },
    persist: async (input) => {
      const { persistBoardEvent } = await import("../practice/board");
      await persistBoardEvent({
        data: {
          user: input.user,
          reply: input.reply,
          action: input.action,
          lines: input.lines,
          line: input.slug,
          channel: "web",
          callId: input.callId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    },
    audit: (record) => {
      // Nur Metadaten. Zieldatei optional, sonst Serverlog.
      const line = JSON.stringify(record);
      const file = process.env.SILVIA_LIVE_AUDIT_FILE;
      if (file) void import("node:fs").then((fs) => fs.appendFileSync(file, `${line}${String.fromCharCode(10)}`));
      else console.info("[live-audit]", line);
    },
    budgets: processBudgets,
  };
}

function numberEnv(env: Env, key: string, fallback: number): number {
  const n = Number(String(env[key] ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function startLiveCall(
  input: { slug: string; sdp: string },
  overrides: Partial<LiveCallDeps> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const deps: LiveCallDeps = { ...defaultDeps(), ...overrides };
  const now = deps.now();
  const policy = resolveLivePolicy(deps.env, now);
  // Warum Live gesperrt ist, gehört nicht auf die öffentliche Seite: nur der Rückfall wird gemeldet.
  if (!policy.ok) return { status: 503, body: { ...LIVE_CALL_RESULT_FALLBACK, error: "Live ist für diese Leitung nicht freigegeben." } };

  const profile = await deps.loadProfile(input.slug);
  if (!profile) return { status: 404, body: { error: "Leitung nicht gefunden." } };

  const limitSeconds = Math.round(numberEnv(deps.env, "SILVIA_LIVE_MINUTES_PER_MONTH", 600) * 60);
  const stored = deps.budgets.get(profile.id) ?? { tenantId: profile.id, monthKey: monthKeyOf(now), usedSeconds: 0, limitSeconds };
  const budget = rolloverIfNewMonth({ ...stored, limitSeconds }, now);
  deps.budgets.set(profile.id, budget);

  const plan = deps.env.SILVIA_LIVE_PLAN === "budget" ? "budget" : "live";
  const choice = chooseVoiceTier({ plan, policy, budget });
  if (choice.tier !== "live") return { status: 503, body: { ...LIVE_CALL_RESULT_FALLBACK, error: "Live ist gerade nicht verfügbar.", reason: choice.reason } };

  const maxConcurrent = Math.round(numberEnv(deps.env, "SILVIA_LIVE_MAX_CONCURRENT", 3));
  if (activeCalls >= maxConcurrent) return { status: 429, body: { ...LIVE_CALL_RESULT_FALLBACK, error: "Alle Live-Leitungen sind belegt." } };

  const desk = await deps.deskFor(input.slug);
  if (!desk) return { status: 404, body: { error: "Leitung nicht gefunden." } };

  const instructions = buildLiveInstructions({
    practiceName: profile.name,
    hoursLines: profile.hours.map((h) => `${h.day} ${h.time}`),
    nightPhone: profile.nachtdienstPhone,
  });

  activeCalls += 1;
  let released = false;
  const release = () => { if (!released) { released = true; activeCalls = Math.max(0, activeCalls - 1); } };

  try {
    const controller = new AbortController();
    const abortTimer = deps.setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    let body: { session?: { id?: unknown }; transport?: { sdp?: unknown } } | null;
    try {
      response = await deps.fetch(`${policy.httpBase}/live/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${deps.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          session: {
            model: LIVE_DEMO_MODEL,
            audio: { output: { voice: LIVE_DEMO_VOICE } },
            client: { data_channel: { allowed_client_events: LIVE_DEMO_BROWSER_CLIENT_EVENTS, allowed_server_events: LIVE_DEMO_BROWSER_SERVER_EVENTS } },
            store: false,
            instructions,
          },
          transport: { type: "webrtc", sdp: input.sdp },
        }),
        signal: controller.signal,
      });
      body = (await response.json()) as typeof body;
    } finally {
      deps.clearTimeout(abortTimer);
    }
    const id = typeof body?.session?.id === "string" ? body.session.id : "";
    const answer = typeof body?.transport?.sdp === "string" ? body.transport.sdp : "";
    if (!response.ok || !id || !answer) {
      release();
      return { status: 502, body: { ...LIVE_CALL_RESULT_FALLBACK, error: "Live konnte nicht gestartet werden." } };
    }

    attach({ id, slug: input.slug, profile, desk, deps, policyWs: policy.wsBase, budget, release, startedAt: now, maxSeconds: numberEnv(deps.env, "SILVIA_LIVE_MAX_CALL_SECONDS", 600) });
    return { status: 201, body: { session: { id }, transport: { type: "webrtc", sdp: answer } } };
  } catch {
    release();
    return { status: 502, body: { ...LIVE_CALL_RESULT_FALLBACK, error: "Live konnte nicht gestartet werden." } };
  }
}

function attach(ctx: {
  id: string;
  slug: string;
  profile: LiveCallProfile;
  desk: import("../alma/desk").Desk;
  deps: LiveCallDeps;
  policyWs: string;
  budget: LiveBudget;
  release: () => void;
  startedAt: Date;
  maxSeconds: number;
}) {
  const { deps, id } = ctx;
  const socket = new deps.WebSocket(`${ctx.policyWs}/live/sessions/${encodeURIComponent(id)}/attach`, {
    headers: { Authorization: `Bearer ${deps.env.OPENAI_API_KEY}` },
  });
  let voiceSeconds: number | null = null;
  let closeReason: string | null = null;
  let emergency = false;
  let turnNo = 0;
  let finished = false;
  const lines: { role: "user" | "assistant"; content: string }[] = [];
  const greetingId = `silvia-live-greeting-${id}`;

  const closeTimer = deps.setTimeout(() => {
    if (socket.readyState === deps.WebSocket.OPEN) socket.send(JSON.stringify({ type: "session.close" }));
  }, ctx.maxSeconds * 1000);

  const bridge = createLiveBridge({
    socket: { send: (data) => { if (socket.readyState === deps.WebSocket.OPEN) socket.send(data); } },
    setTimeout: deps.setTimeout,
    clearTimeout: deps.clearTimeout,
    decide: (utterance) => {
      const live = deps.budgets.get(ctx.profile.id) ?? ctx.budget;
      const used = voiceSeconds ?? 0;
      const result = decideLiveTurn({ text: utterance, desk: ctx.desk, patients: [], budget: { ...live, usedSeconds: live.usedSeconds + used } });
      if (result.emergency) emergency = true;
      lines.push({ role: "user", content: utterance }, { role: "assistant", content: result.speak });
      turnNo += 1;
      if (result.action) {
        void deps.persist({ user: utterance, reply: result.speak, action: result.action, lines: [...lines], slug: ctx.slug, callId: id, idempotencyKey: `${id}#${turnNo}` })
          .catch(() => console.error("[live-call] Protokoll nicht geschrieben"));
      }
      return { speak: result.speak, handoff: result.handoff };
    },
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    deps.clearTimeout(closeTimer);
    bridge.dispose();
    const endedAt = deps.now();
    if (voiceSeconds !== null) {
      const current = deps.budgets.get(ctx.profile.id) ?? ctx.budget;
      deps.budgets.set(ctx.profile.id, recordUsage(current, voiceSeconds));
    }
    try {
      deps.audit(buildLiveAuditRecord({
        tenantId: ctx.profile.id, sessionId: id, startedAt: ctx.startedAt, endedAt,
        voiceSeconds, closeReason, emergencyHandoff: emergency, toolCalls: [],
      }));
    } catch { console.error("[live-call] Audit nicht geschrieben"); }
    ctx.release();
  };

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "session.instructions.append", event_id: greetingId, delegation_id: null,
      content: `Sprich jetzt auf Deutsch. Begrüße die anrufende Person sofort mit genau diesen Worten und pausiere dann: ${disclosureGreeting(ctx.profile.name)}`,
    }));
  });
  socket.on("message", (raw) => {
    let event: { type?: string; client_event_id?: unknown; usage?: { seconds?: unknown }; reason?: unknown; delta?: unknown };
    try { event = JSON.parse(raw.toString()); } catch { return; }
    if (event.type === "session.instructions.appended" && event.client_event_id === greetingId) {
      socket.send(JSON.stringify({ type: "session.commentary.append", event_id: `${greetingId}-go`, delegation_id: null, content: "Beginne jetzt mit der Begrüßung." }));
    }
    const seconds = event.usage?.seconds;
    if ((event.type === "session.usage.updated" || event.type === "session.closed") && typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) voiceSeconds = seconds;
    if (event.type === "session.closed") {
      closeReason = typeof event.reason === "string" ? event.reason : null;
      finish();
      return;
    }
    bridge.onEvent(event);
  });
  socket.on("close", finish);
  socket.on("error", finish);
}
