import assert from "node:assert/strict";
import { test } from "node:test";
import {
  shouldSummarize,
  summaryOutcomeDone,
  summaryOutcomeFailed,
  summaryOutcomeLine,
} from "./call-summary-dedupe.ts";

test("shouldSummarize: keine vorherige Zusammenfassung, kein Duplikat -> true", () => {
  const ok = shouldSummarize({
    callSummaryAt: null,
    draftedCallIds: [],
    callId: "call-1",
  });
  assert.equal(ok, true);
});

test("shouldSummarize: calls-Zeile hat schon summary_at -> false", () => {
  const ok = shouldSummarize({
    callSummaryAt: new Date().toISOString(),
    draftedCallIds: [],
    callId: "call-1",
  });
  assert.equal(ok, false);
});

test("Punkt 1: eine Anrufkennung wird EXAKT verglichen, nicht als Teilstring", () => {
  // Reproduziert: Anruf "12" wurde wegen eines Entwurfs fuer "3124"
  // faelschlich uebersprungen, weil "12" in "3124" steckt.
  assert.equal(
    shouldSummarize({ callSummaryAt: null, draftedCallIds: ["3124"], callId: "12" }),
    true,
    "3124 ist nicht 12",
  );
  assert.equal(
    shouldSummarize({ callSummaryAt: null, draftedCallIds: ["12"], callId: "3124" }),
    true,
    "12 ist nicht 3124",
  );
  // Die echte Kennung blockiert weiterhin.
  assert.equal(shouldSummarize({ callSummaryAt: null, draftedCallIds: ["12"], callId: "12" }), false);
  // Auch bei vielen Entwuerfen.
  assert.equal(
    shouldSummarize({ callSummaryAt: null, draftedCallIds: ["1", "31", "3124", "999"], callId: "12" }),
    true,
  );
  // Leerraum um die Kennung stoert nicht.
  assert.equal(shouldSummarize({ callSummaryAt: null, draftedCallIds: [" 12 "], callId: "12" }), false);
});

test("shouldSummarize: Mail mit anderer callId stoert nicht -> true", () => {
  const ok = shouldSummarize({
    callSummaryAt: null,
    draftedCallIds: ["anderer-call"],
    callId: "call-1",
  });
  assert.equal(ok, true);
});

test("shouldSummarize: ohne eigene Kennung entscheidet nur die calls-Zeile", () => {
  // Ohne Kennung gibt es nichts zu vergleichen.
  assert.equal(shouldSummarize({ callSummaryAt: null, draftedCallIds: ["irgendwas"], callId: "" }), true);
  assert.equal(
    shouldSummarize({ callSummaryAt: null, draftedCallIds: ["irgendwas"], callId: "   " }),
    true,
  );
});

// AP 56: primaerer Dedupe-Mechanismus ueber external_call_id.
test("shouldSummarize: bereits zusammengefasste externe Anruf-ID (andere calls-Zeile) -> false", () => {
  const ok = shouldSummarize({
    callSummaryAt: null,
    draftedCallIds: [],
    callId: "call-1",
    hasSummarizedExternalCall: true,
  });
  assert.equal(ok, false);
});

test("shouldSummarize: externe Anruf-ID noch nicht zusammengefasst -> true", () => {
  const ok = shouldSummarize({
    callSummaryAt: null,
    draftedCallIds: [],
    callId: "call-1",
    hasSummarizedExternalCall: false,
  });
  assert.equal(ok, true);
});

test("Punkt 4: 'bereits erledigt' ist kein Fehler", () => {
  // Vorher lieferten „erledigt“ und „fehlgeschlagen“ beide false, und der
  // Aufrufer protokollierte in beiden Faellen einen Fehler.
  assert.equal(summaryOutcomeFailed("stored"), false);
  assert.equal(summaryOutcomeFailed("already"), false, "already ist kein Fehler");
  assert.equal(summaryOutcomeFailed("empty"), false);
  assert.equal(summaryOutcomeFailed("failed"), true);

  assert.equal(summaryOutcomeDone("stored"), true);
  assert.equal(summaryOutcomeDone("already"), true);
  assert.equal(summaryOutcomeDone("failed"), false);
  assert.equal(summaryOutcomeDone("empty"), false);
});

test("Punkt 4: jede Lage hat eine verstaendliche Zeile", () => {
  assert.equal(summaryOutcomeLine("stored"), "Zusammenfassung gespeichert");
  assert.equal(summaryOutcomeLine("already"), "Zusammenfassung war schon da");
  assert.match(summaryOutcomeLine("empty"), /keine brauchbare/);
  assert.match(summaryOutcomeLine("failed"), /fehlgeschlagen/);
  // Keine Zeile ist leer.
  for (const outcome of ["stored", "already", "empty", "failed"] as const) {
    assert.ok(summaryOutcomeLine(outcome).length > 0);
  }
});
