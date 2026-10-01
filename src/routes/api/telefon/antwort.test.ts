import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isEndPing,
  lastAssistantReplyFromTranscript,
  MAX_TELEFON_BODY_BYTES,
  normalizeMessages,
  readCappedJsonBody,
  summaryLinesFromTranscript,
  telefonBodyTooLarge,
  TRANSCRIPT_HEAD_TURNS,
  TRANSCRIPT_MAX_TURNS,
  turnIdempotencyKey,
} from "./antwort.ts";

// AP 56: Abschluss-Ping — reines ended:true ohne neue Anrufer-Aeusserung.
test("isEndPing: ended=true und letzte Zeile ist Assistent -> true", () => {
  const ok = isEndPing({
    ended: true,
    messages: [
      { role: "user" },
      { role: "assistant" },
    ],
  });
  assert.equal(ok, true);
});

test("isEndPing: ended=true aber letzte Zeile ist Anrufer (neue Aussage) -> false", () => {
  const ok = isEndPing({
    ended: true,
    messages: [
      { role: "assistant" },
      { role: "user" },
    ],
  });
  assert.equal(ok, false);
});

test("isEndPing: ended fehlt/false -> false", () => {
  assert.equal(isEndPing({ messages: [{ role: "assistant" }] }), false);
  assert.equal(isEndPing({ ended: false, messages: [{ role: "assistant" }] }), false);
});

test("isEndPing: keine Nachrichten -> true (reines Auflege-Signal)", () => {
  // Punkt 24: das Gateway darf das Auflegen allein melden. Vorher galt das als
  // "nichts zu tun" und die Anfrage wurde abgewiesen, obwohl genau dieser Fall
  // in AP 56 vorgesehen ist.
  assert.equal(isEndPing({ ended: true, messages: [] }), true);
  assert.equal(isEndPing({ ended: true }), true);
  // Ohne ended bleibt es abgelehnt.
  assert.equal(isEndPing({ messages: [] }), false);
});

test("telefonBodyTooLarge prueft die angekuendigte Groesse", () => {
  // Punkt 23: vorher wurde der ganze JSON-Inhalt eingelesen und erst danach
  // gekuerzt — eine sehr grosse Anfrage belegte unbegrenzt Arbeitsspeicher.
  assert.equal(telefonBodyTooLarge(null), false, "ohne Angabe wird nicht abgelehnt");
  assert.equal(telefonBodyTooLarge(""), false);
  assert.equal(telefonBodyTooLarge("abc"), false);
  assert.equal(telefonBodyTooLarge("-5"), false);
  assert.equal(telefonBodyTooLarge("1024"), false);
  assert.equal(telefonBodyTooLarge(String(MAX_TELEFON_BODY_BYTES)), false, "genau das Limit ist erlaubt");
  assert.equal(telefonBodyTooLarge(String(MAX_TELEFON_BODY_BYTES + 1)), true);
  assert.equal(telefonBodyTooLarge("99999999"), true);
  // Eigenes Limit fuer Tests.
  assert.equal(telefonBodyTooLarge("101", 100), true);
});

test("normalizeMessages behaelt Anfang und Ende langer Gespraeche", () => {
  // Punkt 26: vorher blieben nur die letzten zwoelf Zeilen. Name und Anliegen
  // stehen am Anfang eines Gespraechs und gingen damit verloren.
  const kurz = [
    { role: "user", content: "Grüß Gott, hier Berger" },
    { role: "assistant", content: "Guten Tag" },
  ];
  assert.deepEqual(normalizeMessages(kurz), kurz, "kurze Gespraeche bleiben ganz");

  const gesamt = TRANSCRIPT_MAX_TURNS + 20;
  const lang = Array.from({ length: gesamt }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `Zeile ${index + 1}`,
  }));
  const kept = normalizeMessages(lang);
  assert.equal(kept.length, TRANSCRIPT_MAX_TURNS, "auf das Fenster gekuerzt");
  // Der Anfang mit Name und Anliegen bleibt.
  assert.equal(kept[0]!.content, "Zeile 1");
  assert.equal(kept[TRANSCRIPT_HEAD_TURNS - 1]!.content, `Zeile ${TRANSCRIPT_HEAD_TURNS}`);
  // Und das Ende mit der letzten Aussage bleibt.
  assert.equal(kept[kept.length - 1]!.content, `Zeile ${gesamt}`);
  // Genau das Limit bleibt vollstaendig.
  assert.equal(normalizeMessages(lang.slice(0, TRANSCRIPT_MAX_TURNS)).length, TRANSCRIPT_MAX_TURNS);

  // Leere Zeilen fallen, ungueltige Eingaben ergeben nichts.
  assert.deepEqual(normalizeMessages([{ role: "user", content: "  " }]), []);
  assert.deepEqual(normalizeMessages(null), []);
  assert.deepEqual(normalizeMessages("kein Array"), []);
});

test("summaryLinesFromTranscript baut Zeilen aus dem gespeicherten Protokoll", () => {
  // Punkt 24: beim reinen Auflege-Signal kommt der Verlauf aus der Datenbank.
  const lines = summaryLinesFromTranscript([
    { from: "anrufer", text: "Hier Berger, es geht um Bella" },
    { from: "alma", text: "Guten Tag, was braucht Bella?" },
    { from: "anrufer", text: "" },
  ]);
  assert.deepEqual(lines, [
    "Anrufer: Hier Berger, es geht um Bella",
    "Silvia: Guten Tag, was braucht Bella?",
  ]);
  assert.deepEqual(summaryLinesFromTranscript([]), []);
  assert.deepEqual(summaryLinesFromTranscript(null), []);
  assert.deepEqual(summaryLinesFromTranscript("kaputt"), []);
});

test("readCappedJsonBody bricht beim Ueberschreiten ab, auch ohne Content-Length", async () => {
  // Punkt 6: telefonBodyTooLarge prueft nur den angekuendigten Content-Length.
  // Fehlt der Kopf (gestueckelte Anfrage), greift sie nicht — eine beliebig
  // grosse Anfrage wuerde trotzdem vollstaendig eingelesen.

  // 1. Angekuendigt zu gross.
  const declared = new Request("http://lokal/api", {
    method: "POST",
    headers: { "content-length": String(MAX_TELEFON_BODY_BYTES + 1) },
    body: "{}",
  });
  assert.deepEqual(await readCappedJsonBody(declared), { ok: false, reason: "too_large" });

  // 2. Ohne Content-Length, aber tatsaechlich zu gross: wird beim Lesen erkannt.
  const gross = "x".repeat(MAX_TELEFON_BODY_BYTES + 100);
  const streamed = new Request("http://lokal/api", {
    method: "POST",
    body: gross,
    // Node setzt selbst keinen content-length, wenn der Stream gestueckelt ist.
  });
  streamed.headers.delete("content-length");
  assert.deepEqual(await readCappedJsonBody(streamed), { ok: false, reason: "too_large" });

  // 3. Gueltiges JSON innerhalb des Limits.
  const ok = new Request("http://lokal/api", { method: "POST", body: '{"callId":"a"}' });
  const gelesen = await readCappedJsonBody(ok);
  assert.equal(gelesen.ok, true);
  assert.deepEqual(gelesen.ok ? gelesen.value : null, { callId: "a" });

  // 4. Kaputtes JSON.
  const kaputt = new Request("http://lokal/api", { method: "POST", body: "{kein json" });
  assert.deepEqual(await readCappedJsonBody(kaputt), { ok: false, reason: "bad_json" });

  // 5. Eigenes Limit fuer Tests.
  const klein = new Request("http://lokal/api", { method: "POST", body: '{"a":"1234567890"}' });
  klein.headers.delete("content-length");
  assert.deepEqual(await readCappedJsonBody(klein, 5), { ok: false, reason: "too_large" });
});

// AP 59: Turn-Idempotenz — ein Gateway-Retry desselben Turns darf kein zweites
// askAlma() und keine zweite calls-Zeile ausloesen.
test("turnIdempotencyKey: callId + Anzahl Anrufer-Aeusserungen", () => {
  // Historie des Gateways: Begruessung (assistant) + je Turn eine user-Zeile.
  const turn1 = [
    { role: "assistant", content: "Gruß Gott" },
    { role: "user", content: "Ich brauche einen Termin" },
  ];
  const turn2 = [
    { role: "assistant", content: "Gruß Gott" },
    { role: "user", content: "Ich brauche einen Termin" },
    { role: "assistant", content: "Gerne" },
    { role: "user", content: "Für meine Katze Charlotte" },
  ];
  assert.equal(turnIdempotencyKey("call-1", turn1), "call-1#1");
  assert.equal(turnIdempotencyKey("call-1", turn2), "call-1#2");
  // Verschiedene Anrufe, gleiche Turn-Nummer: verschiedener Schluessel.
  assert.notEqual(turnIdempotencyKey("call-2", turn1), turnIdempotencyKey("call-1", turn1));
  // Leere/ungueltige Eingabe bleibt stabil.
  assert.equal(turnIdempotencyKey("call-1", []), "call-1#0");
  assert.equal(turnIdempotencyKey("", turn1), "#1");
});

test("lastAssistantReplyFromTranscript gewinnt die gespeicherte Antwort zurueck", () => {
  const transcript = [
    { from: "anrufer", text: "Ich brauche einen Termin" },
    { from: "alma", text: "Gerne, für welches Tier?" },
    { from: "anrufer", text: "Für meine Katze Charlotte" },
    { from: "alma", text: "Verstanden, ich habe es notiert." },
  ];
  assert.equal(lastAssistantReplyFromTranscript(transcript), "Verstanden, ich habe es notiert.");
  // Leere Alma-Zeilen am Ende werden uebersprungen.
  assert.equal(
    lastAssistantReplyFromTranscript([
      { from: "anrufer", text: "Hallo" },
      { from: "alma", text: "Hallo" },
      { from: "alma", text: "   " },
    ]),
    "Hallo",
  );
  // Keine Alma-Zeile / kaputte Eingabe: leer.
  assert.equal(lastAssistantReplyFromTranscript([{ from: "anrufer", text: "Hallo" }]), "");
  assert.equal(lastAssistantReplyFromTranscript([]), "");
  assert.equal(lastAssistantReplyFromTranscript(null), "");
  assert.equal(lastAssistantReplyFromTranscript("kaputt"), "");
});

// AP 56: Abschluss-Ping — reines ended:true ohne neue Anrufer-Aeusserung.
