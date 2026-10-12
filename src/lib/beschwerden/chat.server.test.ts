import assert from "node:assert/strict";
import test from "node:test";
import { addTranscriptToProtocol, answerComplaint, emptyComplaintProtocol, safeModelProtocol } from "./chat.server";

test("lokale Regeln füllen Standort, Kategorie, Zeitpunkt und Rückrufnummer", async () => {
  const previous = process.env.GARAGEN_LLM_BASE_URL;
  delete process.env.GARAGEN_LLM_BASE_URL;
  try {
    const result = await answerComplaint(
      "Gestern gegen 18 Uhr hat in der Garage Hauptbahnhof die Schranke nicht geöffnet. Sie erreichen mich unter 0664 123 45 67.",
      [],
      emptyComplaintProtocol,
    );
    assert.equal(result.protocol.category, "Ein-/Ausfahrt");
    assert.equal(result.protocol.location, "Hauptbahnhof");
    assert.equal(result.protocol.occurredAt, "Gestern");
    assert.equal(result.protocol.callback, "0664 123 45 67");
    assert.match(result.reply, /vollständig/i);
  } finally {
    if (previous === undefined) delete process.env.GARAGEN_LLM_BASE_URL;
    else process.env.GARAGEN_LLM_BASE_URL = previous;
  }
});

test("lokale Regeln fragen genau die nächste fehlende Angabe ab", async () => {
  const previous = process.env.GARAGEN_LLM_BASE_URL;
  delete process.env.GARAGEN_LLM_BASE_URL;
  try {
    const result = await answerComplaint("Mein Ticket wurde nicht erkannt.", [], emptyComplaintProtocol);
    assert.equal(result.protocol.category, "Parkticket oder Schranke");
    assert.match(result.reply, /Standort/i);
  } finally {
    if (previous === undefined) delete process.env.GARAGEN_LLM_BASE_URL;
    else process.env.GARAGEN_LLM_BASE_URL = previous;
  }
});

test("lokale Regeln erkennen eine sicherheitsrelevante eingeschlossene Person", async () => {
  const previous = process.env.GARAGEN_LLM_BASE_URL;
  delete process.env.GARAGEN_LLM_BASE_URL;
  try {
    const result = await answerComplaint("Die Schranke öffnet nicht. Ich komme nicht hinaus und brauche dringend Hilfe.", [], emptyComplaintProtocol);
    assert.equal(result.protocol.priority, "sicherheit");
  } finally {
    if (previous === undefined) delete process.env.GARAGEN_LLM_BASE_URL;
    else process.env.GARAGEN_LLM_BASE_URL = previous;
  }
});

test("lokale Regeln erkennen ein Parkticket", async () => {
  const previous = process.env.GARAGEN_LLM_BASE_URL;
  delete process.env.GARAGEN_LLM_BASE_URL;
  try {
    const result = await answerComplaint("Parkticket wird nicht erkannt.", [], emptyComplaintProtocol);
    assert.equal(result.protocol.category, "Parkticket oder Schranke");
  } finally {
    if (previous === undefined) delete process.env.GARAGEN_LLM_BASE_URL;
    else process.env.GARAGEN_LLM_BASE_URL = previous;
  }
});

test("Live-Transkript ergänzt das Protokoll ohne eine zweite Bot-Antwort", () => {
  const protocol = addTranscriptToProtocol("In der Garage Hauptbahnhof ist die Ausfahrt blockiert. Ich komme nicht hinaus.", emptyComplaintProtocol);
  assert.equal(protocol.location, "Hauptbahnhof");
  assert.equal(protocol.category, "Ein-/Ausfahrt");
  assert.equal(protocol.priority, "sicherheit");
  assert.match(protocol.summary, /Ausfahrt/i);
});

test("ein lokales Modell darf keine Beschwerdedaten erfinden oder überschreiben", () => {
  const protocol = safeModelProtocol("Das Ticket wurde nicht erkannt.", { ...emptyComplaintProtocol, location: "Hauptbahnhof" }, { location: "Erfundener Ort", category: "Unbekannt", priority: "sicherheit", callback: "0664 999 99 99" });
  assert.equal(protocol.location, "Hauptbahnhof");
  assert.equal(protocol.category, "Parkticket oder Schranke");
  assert.equal(protocol.priority, "normal");
  assert.equal(protocol.callback, "");
});
