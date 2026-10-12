import assert from "node:assert/strict";
import test from "node:test";
import { answerComplaint, emptyComplaintProtocol } from "./chat.server";

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

test("lokale Regeln erkennen eine dringende Ausfahrt", async () => {
  const previous = process.env.GARAGEN_LLM_BASE_URL;
  delete process.env.GARAGEN_LLM_BASE_URL;
  try {
    const result = await answerComplaint("Die Schranke öffnet nicht. Ich komme nicht hinaus und brauche dringend Hilfe.", [], emptyComplaintProtocol);
    assert.equal(result.protocol.priority, "dringend");
  } finally {
    if (previous === undefined) delete process.env.GARAGEN_LLM_BASE_URL;
    else process.env.GARAGEN_LLM_BASE_URL = previous;
  }
});
