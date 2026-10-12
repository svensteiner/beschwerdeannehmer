import assert from "node:assert/strict";
import test from "node:test";
import { answerWithLocalRules, emergencyReply, updateComplaintProtocol } from "./complaint-rules.js";

const emptyProtocol = { location: "", category: "", priority: "normal", occurredAt: "", summary: "", callback: "" };

test("Notfallbegriffe setzen Sicherheit und nennen die sofortige Hilfe", () => {
  const result = answerWithLocalRules("Ich bin eingesperrt, es riecht nach Rauch.", emptyProtocol);
  assert.equal(result.protocol.priority, "sicherheit");
  assert.equal(result.protocol.category, "Sauberkeit oder Sicherheit");
  assert.equal(result.reply, emergencyReply);
  assert.match(result.reply, /alarmiert niemanden.*112.*Gegensprechanlage/iu);
});

test("ein technischer Defekt ist dringend, aber kein Sicherheitsfall", () => {
  const result = answerWithLocalRules("Der Ticketautomat ist defekt.", emptyProtocol);
  assert.equal(result.protocol.priority, "dringend");
  assert.doesNotMatch(result.reply, /alarmiert niemanden/iu);
});

test("Datumsangaben sind keine Rückrufnummer", () => {
  const result = updateComplaintProtocol("Die Schranke hat am 10.05.2026 nicht geöffnet.", emptyProtocol);
  assert.equal(result.callback, "");
});

test("nur eine Nummer mit mindestens acht Ziffern wird als Rückrufnummer übernommen", () => {
  const result = updateComplaintProtocol("Bitte rufen Sie mich unter 0664 123 45 67 zurück.", emptyProtocol);
  assert.equal(result.callback, "0664 123 45 67");
});

test("eine Zeitangabe wird nicht als Standort gespeichert", () => {
  const result = updateComplaintProtocol("In der Früh bei der Einfahrt war die Schranke zu.", emptyProtocol);
  assert.equal(result.location, "");
});

test("ein Standort-Alias wird im Gespräch einheitlich gespeichert", () => {
  const result = updateComplaintProtocol("In der Bahnhofgarage ist die Ausfahrt blockiert.", emptyProtocol);
  assert.equal(result.location, "Hauptbahnhof");
});
