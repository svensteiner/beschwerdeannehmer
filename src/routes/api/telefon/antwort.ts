// AP 27 — POST /api/telefon/antwort: stabile, token-geschuetzte HTTP-Bruecke fuer
// das Telefon-Gateway (C:\silvia-phone) und das Eval-Skript, damit beide nicht mehr
// ueber den Browser (Playwright /sprechen) gehen muessen (siehe AP 25/21 Befund:
// createServerFn nutzt intern eine build-abhaengige /_serverFn/<hash>-Route mit
// proprietaerem "seroval"-Framing, keine stabile HTTP-API).
//
// Diese Route ruft denselben Kern wie /sprechen auf: askAlma() und persistBoardEvent()
// aus @/lib/alma/ask-alma bzw. @/lib/practice/board werden HIER SERVERSEITIG DIREKT
// aufgerufen (kein Netzwerk-Hop, kein seroval — createServerFn-Funktionen sind auf dem
// Server ganz normale async-Funktionen). Keine Logikkopie.
//
// Sicherheit: Bearer-Token (SILVIA_PHONE_TOKEN, server-only) + IP-Guard (nur
// 127.0.0.1/LAN, siehe phone-auth.ts) — ein Telefon-Gateway laeuft nie im Internet.
//
// AP 55: Gateway sendet ended:true beim Auflegen — primaeres Signal fuer die
// Anruf-Zusammenfassung (detectEndCall() ist nur der Fallback ohne dieses Feld).
//
// AP 56: Abschluss-Ping — das Gateway darf `ended:true` auch OHNE neue Anrufer-
// Aeusserung schicken (reines "aufgelegt"-Signal, letzte Zeile ist noch Silvias
// eigene Antwort). Dafuer wird NICHT nochmal askAlma() aufgerufen (keine neue
// Anrufer-Aussage zum Beantworten) — statt dessen wird direkt die zu dieser
// external_call_id gehoerende calls-Zeile gesucht und finalizeCallSummary() im
// Hintergrund angestossen. Antwort ist sofort leer + endCall:true.
import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import type { ChatTurn } from "@/lib/alma/ask-alma";
import { detectEndCall, isLocalOrLanIp, isValidPhoneBearer } from "@/lib/practice/phone-auth";

type TelefonAntwortBody = {
  callId?: string;
  from?: string;
  messages?: { role?: string; content?: string }[];
  /** Optional: Praxis-Slug wie /leitung/$slug. Ohne Angabe: SILVIA_PHONE_LINE aus .env. */
  line?: string;
  /** AP 55: Gateway sendet ended:true beim Auflegen — primaeres Signal fuer die
   * Anruf-Zusammenfassung. Ohne Angabe faellt die Route auf detectEndCall() zurueck. */
  ended?: boolean;
};

/**
 * AP 56: reine Entscheidungsfunktion (kein DB-/Netzzugriff) fuer den
 * Abschluss-Ping: `body.ended === true` UND die letzte Zeile der Konversation
 * stammt vom Assistenten (also keine neue Anrufer-Aeusserung, die Silvia noch
 * beantworten muesste).
 */
export function isEndPing(body: { ended?: boolean; messages?: { role?: string }[] }): boolean {
  if (body?.ended !== true) return false;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  // Ohne Verlauf ist auch keine neue Anrufer-Aeusserung da — das Gateway darf
  // das Auflegen allein melden. Vorher galt das als "nichts zu tun" und die
  // Anfrage wurde abgewiesen, obwohl genau dieser Fall vorgesehen ist.
  if (messages.length === 0) return true;
  const last = messages[messages.length - 1];
  return last?.role === "assistant";
}

/**
 * Verlauf aus dem gespeicherten Protokoll (`calls.transcript`) als Zeilen.
 *
 * Gebraucht, wenn das Gateway nur das Auflegen meldet und keinen Verlauf
 * mitschickt: ohne diesen Rueckgriff waere die Zusammenfassung leer und
 * wuerde still gar nichts schreiben.
 */
export function summaryLinesFromTranscript(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const from = String((entry as { from?: unknown })?.from ?? "");
      const text = String((entry as { text?: unknown })?.text ?? "").trim();
      if (!text) return "";
      return `${from === "alma" ? "Silvia" : "Anrufer"}: ${text}`;
    })
    .filter((line) => line.length > 0);
}

/**
 * AP 59: Idempotenz-Schluessel eines Turns — callId + Anzahl Anrufer-Aeusserungen.
 * Jeder handle_segment-Turn des Gateways haengt genau eine user-Zeile an die
 * Historie; ein Retry schickt dieselbe Historie und erzeugt damit denselben
 * Schluessel. Zwei verschiedene Turns eines Anrufs haben verschiedene Nummern.
 */
export function turnIdempotencyKey(callId: string, messages: ReadonlyArray<{ role?: string }>): string {
  const turns = Array.isArray(messages) ? messages.filter((m) => m.role === "user").length : 0;
  return `${callId}#${turns}`;
}

/**
 * AP 59: die gespeicherte Antwort des Turns zurueckgewinnen. Der Transcript
 * einer calls-Zeile endet mit der Assistenten-Antwort des letzten Turns; ein
 * Retry gibt genau diese Zeile zurueck, statt das LLM erneut zu fragen.
 */
export function lastAssistantReplyFromTranscript(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const entry = raw[index] as { from?: unknown; text?: unknown };
    if (entry?.from === "alma") {
      const text = String(entry.text ?? "").trim();
      if (text) return text;
    }
  }
  return "";
}

/**
 * Groesste zulaessige Anfrage. Die Route hat vorher den gesamten JSON-Inhalt
 * eingelesen und erst danach gekuerzt — eine sehr grosse Anfrage belegte damit
 * unbegrenzt Arbeitsspeicher.
 */
export const MAX_TELEFON_BODY_BYTES = 512 * 1024;

/** Wahr, wenn die angekuendigte Anfragegroesse das Limit ueberschreitet. */
export function telefonBodyTooLarge(contentLength: string | null, limit = MAX_TELEFON_BODY_BYTES): boolean {
  const declared = Number(String(contentLength ?? "").trim());
  if (!Number.isFinite(declared) || declared <= 0) return false;
  return declared > limit;
}

export type CappedBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "too_large" | "bad_json" };

/**
 * Anfrage lesen und die Groesse DABEI begrenzen.
 *
 * `telefonBodyTooLarge` prueft nur den angekuendigten `Content-Length`. Fehlt
 * der Kopf — etwa bei einer gestueckelten Anfrage —, greift die Pruefung nicht,
 * und eine beliebig grosse Anfrage wuerde trotzdem vollstaendig eingelesen.
 * Deshalb wird hier beim Lesen mitgezaehlt und beim Ueberschreiten abgebrochen.
 */
export async function readCappedJsonBody(
  request: Request,
  limit = MAX_TELEFON_BODY_BYTES,
): Promise<CappedBodyResult> {
  if (telefonBodyTooLarge(request.headers.get("content-length"), limit)) {
    return { ok: false, reason: "too_large" };
  }
  const body = request.body;
  if (!body) return { ok: false, reason: "bad_json" };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  try {
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(merged)) };
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}

/** Fenster fuer den Verlauf: mehr als vorher, damit lange Gespraeche tragen. */
export const TRANSCRIPT_MAX_TURNS = 40;
/** So viele Zeilen vom Anfang bleiben immer erhalten. */
export const TRANSCRIPT_HEAD_TURNS = 8;

/**
 * Verlauf fuer Antwort und Zusammenfassung.
 *
 * Vorher blieben nur die letzten zwoelf Zeilen uebrig. Name und Anliegen stehen
 * aber am ANFANG eines Gespraechs; ein langer Anruf verlor sie. Jetzt bleiben
 * Anfang und Ende erhalten, nur die Mitte faellt bei sehr langen Gespraechen weg.
 */
export function normalizeMessages(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const all = raw
    .map((m) => ({
      role: (m as { role?: string })?.role === "assistant" ? ("assistant" as const) : ("user" as const),
      // Trimmen, damit eine Zeile aus lauter Leerzeichen nicht als echte
      // Anrufer-Aeusserung zaehlt — sie wuerde sonst das Fenster belegen und
      // beim Auflege-Signal als neue Aussage gelten.
      content: String((m as { content?: string })?.content ?? "").slice(0, 1200).trim(),
    }))
    .filter((m) => m.content.length > 0);
  if (all.length <= TRANSCRIPT_MAX_TURNS) return all;
  const head = all.slice(0, TRANSCRIPT_HEAD_TURNS);
  const tail = all.slice(-(TRANSCRIPT_MAX_TURNS - TRANSCRIPT_HEAD_TURNS));
  return [...head, ...tail];
}

export const Route = createFileRoute("/api/telefon/antwort")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1) Netzguard zuerst — kein Token-Timing-Leak an externe Aufrufer.
        // getRequestIP() liest die echte Socket-Peer-Adresse (kein x-forwarded-for,
        // also nicht durch Header spoofbar) — Silvia hat vor diesem lokalen
        // Prozess-zu-Prozess-Aufruf keinen Reverse-Proxy.
        const ip = getRequestIP() || "";
        if (!isLocalOrLanIp(ip)) {
          return Response.json({ error: "Nur lokal/LAN erreichbar." }, { status: 401 });
        }

        // 2) Bearer-Token gegen SILVIA_PHONE_TOKEN (fail-closed ohne konfiguriertes Token).
        const auth = request.headers.get("authorization");
        if (!isValidPhoneBearer(auth, process.env.SILVIA_PHONE_TOKEN)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3) Rate-Limit wie ein normaler Anruf am Kassa-Client (denselben Bucket-Mechanismus nutzen).
        const { takeToken } = await import("@/lib/practice/rate-limit");
        if (!takeToken(`telefon-api:${ip}`, 60, 60_000).allowed) {
          return Response.json({ error: "Zu viele Anfragen." }, { status: 429 });
        }

        // Groesse VOR und WAEHREND des Einlesens begrenzen: sonst belegt eine
        // sehr grosse Anfrage unbegrenzt Arbeitsspeicher, weil erst danach
        // gekuerzt wird. Ohne Content-Length greift die Zaehlung beim Lesen.
        const gelesen = await readCappedJsonBody(request);
        if (!gelesen.ok) {
          return gelesen.reason === "too_large"
            ? Response.json({ error: "Anfrage zu gross." }, { status: 413 })
            : Response.json({ error: "Ungueltiges JSON." }, { status: 400 });
        }
        const body = gelesen.value as TelefonAntwortBody;

        const callId = String(body?.callId ?? "").slice(0, 80);
        const from = String(body?.from ?? "").slice(0, 32);
        const messages = normalizeMessages(body?.messages);
        // Ein Auflege-Signal ohne Gespraechszeilen ist gueltig: das Gateway darf
        // `ended:true` schicken, ohne den Verlauf zu wiederholen. Frueher wurde
        // es hier abgewiesen, obwohl genau dieser Fall vorgesehen ist.
        if (!callId || (messages.length === 0 && !isEndPing(body))) {
          return Response.json({ error: "callId und messages sind Pflicht." }, { status: 400 });
        }
        const line = String(body?.line ?? process.env.SILVIA_PHONE_LINE ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 48);

        // AP 56: Abschluss-Ping — Auflegen ohne neue Anrufer-Aeusserung. Kein
        // askAlma()-Aufruf (nichts zu beantworten), direkt die passende
        // calls-Zeile ueber external_call_id + Praxis suchen und die
        // Zusammenfassung im Hintergrund anstossen.
        if (isEndPing(body)) {
          const { fetchProfileBySlug } = await import("@/lib/practice/profile-data.server");
          const profile = line ? await fetchProfileBySlug(line) : null;
          const practiceId = profile?.id;
          let summary: "scheduled" | "none" = "none";
          if (practiceId) {
            const { getSql } = await import("@/lib/db.server");
            const sql = await getSql();
            const rows = await sql<{ id: string; transcript: unknown }>`
              select id, transcript from calls
              where practice_id = ${practiceId} and external_call_id = ${callId}
              order by at desc
              limit 1
            `;
            const callRowId = rows[0]?.id ?? "";
            if (callRowId) {
              // AP 59: Auflegen -> Anruf-Status und echte Dauer nachtragen.
              // "erledigt" ist der gueltige calls-Status (CALL_DESK_STATUSES);
              // "abgeschlossen" ist ein Emergency-Status und gehoert hier nicht
              // her. duration_sec ersetzt den hartcodierten Platzhalter 38 aus
              // board.ts durch die reale Zeitspanne seit Anlage der Zeile.
              const { completePhoneCall } = await import("@/lib/practice/call-completion");
              await completePhoneCall(sql, callRowId, callId);
              // Ohne mitgeschickte Zeilen (reiner Auflege-Ping) kommt der
              // Verlauf aus dem gespeicherten Protokoll. Sonst bliebe die
              // Zusammenfassung leer und wuerde still nichts schreiben.
              const transcriptLines = messages.length > 0
                ? messages.map((m) => `${m.role === "assistant" ? "Silvia" : "Anrufer"}: ${m.content}`)
                : summaryLinesFromTranscript(rows[0]?.transcript);
              if (transcriptLines.length > 0) {
                summary = "scheduled";
                void import("@/lib/practice/call-summary-finalize")
                  .then(({ finalizeCallSummary }) =>
                    finalizeCallSummary({ callRowId, lines: transcriptLines, phone: from, callId }),
                  )
                  .then((outcome) => {
                    // Punkt 4: „war schon da“ ist kein Fehler. Nur ein echtes
                    // Scheitern wird als Fehler protokolliert.
                    if (outcome === "failed") {
                      console.error("[telefon-antwort] Abschluss-Ping: Zusammenfassung fehlgeschlagen");
                    } else if (outcome === "empty") {
                      console.error("[telefon-antwort] Abschluss-Ping: keine brauchbare Zusammenfassung");
                    }
                  })
                  .catch(() => console.error("[telefon-antwort] Abschluss-Ping: Zusammenfassung fehlgeschlagen"));
              }
            }
          }
          return Response.json({ reply: "", endCall: true, summary });
        }

        // AP 59: Turn-Idempotenz — ein Gateway-Retry desselben Turns wuerde sonst
        // askAlma() doppelt ausfuehren (doppelte LLM-Kosten) und eine zweite
        // calls-Zeile anlegen. Der Schluessel ist callId + Turn-Nummer; ein Retry
        // schickt die identische Historie und trifft denselben Schluessel. Wurde
        // der Turn schon beantwortet, wird die gespeicherte Antwort zurueckgegeben,
        // statt das LLM erneut zu fragen.
        const idemKey = callId ? turnIdempotencyKey(callId, messages) : "";
        if (idemKey) {
          const { fetchProfileBySlug } = await import("@/lib/practice/profile-data.server");
          const profile = line ? await fetchProfileBySlug(line) : null;
          const practiceId = profile?.id;
          if (practiceId) {
            const { getSql } = await import("@/lib/db.server");
            const sql = await getSql();
            const prior = await sql<{ transcript: unknown }>`
              select transcript from calls
              where practice_id = ${practiceId} and idempotency_key = ${idemKey}
              limit 1
            `;
            const storedReply = prior[0] ? lastAssistantReplyFromTranscript(prior[0].transcript) : "";
            if (storedReply) {
              // endCall wie beim urspruenglichen Turn aus der Antwort ableiten,
              // damit ein Retry nach einer Verabschiedung das Gespraechsende
              // nicht verliert.
              return Response.json({
                reply: storedReply,
                source: "alma",
                provider: "idempotent",
                endCall: detectEndCall(storedReply),
              });
            }
          }
        }

        // Rufnummer der Anruferin dem Connector-Kontext zufuehren (derselbe
        // Needle-Mechanismus wie bei einem inbound-Web-Anruf, keine neue Suche).
        const withCallerContext: ChatTurn[] = from
          ? [{ role: "user", content: `Anrufer-Nummer: ${from}` }, ...messages]
          : messages;

        const { askAlma } = await import("@/lib/alma/ask-alma");
        let result: Awaited<ReturnType<typeof askAlma>>;
        try {
          result = await askAlma({
            data: {
              messages: withCallerContext,
              line: line || undefined,
              demo: false,
              train: false,
              // AP 7d Teil 2: treibt die Connector-Buchungs-Zustandsmaschine (booking.ts) je Anruf an.
              // Ohne beide expliziten Buchungsfreigaben bleibt es bei der Tafel-Vormerkung.
              callId,
            },
          });
        } catch {
          console.error("[telefon-antwort] askAlma fehlgeschlagen");
          return Response.json({ error: "Silvia konnte nicht antworten." }, { status: 502 });
        }

        const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
        let reply = result.text;
        let boardOk = true;
        let savedCallRowId = "";
        try {
          const { persistBoardEvent } = await import("@/lib/practice/board");
          // AP 55: "erster Turn" heisst hier: vor dieser Antwort gab es noch keine
          // Assistenten-Zeile im Anruf (Telefon hat keine vorbelegte Begruessungszeile
          // wie der Web-Client, siehe sprechen-call.tsx) — explizit statt der
          // bruechigen Zeilen-Heuristik in board.ts.
          const firstTurn = !messages.some((m) => m.role === "assistant");
          const saved = await persistBoardEvent({
            data: {
              user: lastUser,
              reply: result.text,
              action: result.action,
              lines: withCallerContext.concat({ role: "assistant", content: result.text }),
              line: line || undefined,
              channel: "telefon",
              firstTurn,
              callId,
              idempotencyKey: idemKey,
            },
          });
          boardOk = Boolean(saved?.ok);
          savedCallRowId = boardOk && "callId" in saved ? String(saved.callId ?? "") : "";
          if (
            "bookingConflict" in saved &&
            saved.bookingConflict &&
            "error" in saved &&
            saved.error
          ) {
            reply = saved.error;
          }
          if (!boardOk) {
            // "anonymous": keine passende Praxis gefunden (kein/unbekanntes `line`, keine Session) —
            // erwartet ohne konfigurierte SILVIA_PHONE_LINE/Anrufer-`line`, kein Bug.
            console.error("[telefon-antwort] Protokoll nicht geschrieben");
          }
        } catch {
          // Board-Schreiben ist best-effort — ein Ausfall darf die Telefonantwort nicht blockieren.
          console.error("[telefon-antwort] Protokoll-Schreibfehler");
          boardOk = false;
        }

        // AP 55: "ended" vom Gateway ist das primaere Signal (Auflegen ist eindeutig
        // bekannt) — detectEndCall() bleibt nur Fallback, wenn das Gateway es nicht
        // mitschickt, sonst loeste jede zufaellig passende Verabschiedungsfloskel
        // mitten im Gespraech eine (doppelte) Zusammenfassung aus.
        const endCall = typeof body.ended === "boolean" ? body.ended : detectEndCall(reply);
        if (endCall && boardOk && savedCallRowId) {
          // AP 59: auch bei ended:true mit letzter Anrufer-Aeusserung ist der
          // Anruf zu Ende. Status + echte Dauer der frisch geschriebenen Zeile
          // nachtragen (derselbe Abschluss wie der reine Abschluss-Ping oben).
          try {
            const { getSql } = await import("@/lib/db.server");
            const sql = await getSql();
            const { completePhoneCall } = await import("@/lib/practice/call-completion");
            await completePhoneCall(sql, savedCallRowId, callId);
          } catch {
            console.error("[telefon-antwort] Anruf-Abschluss-Status nicht geschrieben");
          }
          // AP 52: Zusammenfassung + Mail-Entwurf im Hintergrund — darf die Antwort
          // an das Telefon-Gateway nicht verzoegern (keine Rueckgabe, kein await).
          // Kein PII in der Logzeile: nur Status.
          const transcriptLines = withCallerContext
            .concat({ role: "assistant", content: reply })
            .map((m) => `${m.role === "assistant" ? "Silvia" : "Anrufer"}: ${m.content}`);
          void import("@/lib/practice/call-summary-finalize")
            .then(({ finalizeCallSummary }) =>
              finalizeCallSummary({ callRowId: savedCallRowId, lines: transcriptLines, phone: from, callId }),
            )
            .then((outcome) => {
              if (outcome === "failed") {
                console.error("[telefon-antwort] Zusammenfassung fehlgeschlagen");
              } else if (outcome === "empty") {
                console.error("[telefon-antwort] keine brauchbare Zusammenfassung");
              }
            })
            .catch(() => console.error("[telefon-antwort] Zusammenfassung fehlgeschlagen"));
        }

        return Response.json({
          reply,
          source: result.source,
          provider: result.provider,
          endCall,
        });
      },
    },
  },
});
