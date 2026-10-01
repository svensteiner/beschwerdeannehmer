import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INITIAL_HEAR_STATE,
  hearSilviaReduce,
  isCurrentHearRequest,
} from "./silvia-voice-state.ts";

test("der Klick schaltet sofort sichtbar auf Pause, nicht erst nach play()", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  // Genau die Zusage aus dem Audit: "Marin anhören" -> "Pause" unmittelbar.
  assert.equal(pressed.on, true);
  assert.equal(pressed.pending, true);

  const playing = hearSilviaReduce(pressed, { type: "playing", requestId: 1 });
  assert.equal(playing.on, true);
  assert.equal(playing.pending, false);
});

test("ein Audiofehler schaltet den Knopf zurück", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const failed = hearSilviaReduce(pressed, { type: "failed", requestId: 1 });
  assert.equal(failed.on, false);
  assert.equal(failed.pending, false);
});

test("der Stopp beendet die laufende Probe", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const stopped = hearSilviaReduce(pressed, { type: "stop", requestId: 2 });
  assert.equal(stopped.on, false);
  assert.equal(stopped.pending, false);
  assert.equal(stopped.requestId, 2);
});

test("eine überholte Probe darf den neuen Zustand nicht zurückschalten", () => {
  const first = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const second = hearSilviaReduce(first, { type: "press", requestId: 2 });
  assert.equal(second.on, true);

  // Die alte Probe meldet nachträglich einen Fehler bzw. ihr Ende.
  const lateFailed = hearSilviaReduce(second, { type: "failed", requestId: 1, reason: "error" });
  assert.deepEqual(lateFailed, second);
  assert.equal(lateFailed.on, true);

  // Auch ein spätes playing() der alten Probe ändert nichts.
  const latePlaying = hearSilviaReduce(second, { type: "playing", requestId: 1 });
  assert.deepEqual(latePlaying, second);
});

test("nur ein echter Tonfehler erzeugt die sichtbare Meldung", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  assert.equal(pressed.failed, false, "Beim Start darf keine Fehlermeldung stehen");

  // Normales Ende der Wiedergabe: kein Fehler.
  const ended = hearSilviaReduce(pressed, { type: "failed", requestId: 1, reason: "ended" });
  assert.equal(ended.on, false);
  assert.equal(ended.failed, false, "Das Ende der Wiedergabe ist kein Fehler");

  // Defekte Tonquelle: sichtbare Meldung.
  const errored = hearSilviaReduce(pressed, { type: "failed", requestId: 1, reason: "error" });
  assert.equal(errored.on, false);
  assert.equal(errored.failed, true, "Ein Tonfehler muss gemeldet werden");
});

test("ein erneuter Versuch löscht die Fehlermeldung", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const errored = hearSilviaReduce(pressed, { type: "failed", requestId: 1, reason: "error" });
  assert.equal(errored.failed, true);

  // Der Klick auf „Erneut versuchen" ist ein neuer press.
  const retry = hearSilviaReduce(errored, { type: "press", requestId: 2 });
  assert.equal(retry.failed, false, "Nach dem erneuten Versuch darf die Meldung nicht bleiben");
  assert.equal(retry.on, true);
});

test("der Stopp ist kein Fehler", () => {
  const pressed = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const stopped = hearSilviaReduce(pressed, { type: "stop", requestId: 2 });
  assert.equal(stopped.failed, false, "Ein bewusster Stopp darf keine Fehlermeldung zeigen");
});

test("die jüngste Probe darf ihren eigenen Fehler melden", () => {
  const first = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const second = hearSilviaReduce(first, { type: "press", requestId: 2 });
  const failed = hearSilviaReduce(second, { type: "failed", requestId: 2 });
  assert.equal(failed.on, false);
});

test("isCurrentHearRequest erkennt nur die jüngste Anforderung", () => {
  const first = hearSilviaReduce(INITIAL_HEAR_STATE, { type: "press", requestId: 1 });
  const second = hearSilviaReduce(first, { type: "press", requestId: 2 });
  assert.equal(isCurrentHearRequest(second, 1), false);
  assert.equal(isCurrentHearRequest(second, 2), true);
});
