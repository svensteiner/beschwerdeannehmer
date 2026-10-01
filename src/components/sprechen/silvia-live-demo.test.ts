import assert from "node:assert/strict";
import test from "node:test";
import { mergeTranscriptDelta, playLiveDemoAudio } from "./silvia-live-demo-state";

test("führt Live-Deltas in Lieferreihenfolge zusammen", () => {
  const first = mergeTranscriptDelta([], {
    type: "session.output_transcript.delta",
    event_id: "event-1",
    start_ms: 0,
    end_ms: 100,
    delta: "Guten ",
  });
  const second = mergeTranscriptDelta(first, {
    type: "session.output_transcript.delta",
    event_id: "event-2",
    start_ms: 100,
    end_ms: 200,
    delta: "Tag!",
  });

  assert.deepEqual(second.map(({ speaker, text }) => ({ speaker, text })), [
    { speaker: "Silvia", text: "Guten Tag!" },
  ]);
});

test("trennt die Sprecher, aber nicht den einzelnen Live-Zug", () => {
  const first = mergeTranscriptDelta([], {
    type: "session.output_transcript.delta",
    event_id: "event-1",
    delta: "Guten ",
  });
  const second = mergeTranscriptDelta(first, {
    type: "session.input_transcript.delta",
    event_id: "event-2",
    delta: "Bitte morgen.",
  });
  const third = mergeTranscriptDelta(second, {
    type: "session.output_transcript.delta",
    event_id: "event-3",
    delta: "Tag!",
  });

  assert.deepEqual(third.map(({ speaker, text }) => ({ speaker, text })), [
    { speaker: "Silvia", text: "Guten " },
    { speaker: "Sie", text: "Bitte morgen." },
    { speaker: "Silvia", text: "Tag!" },
  ]);
});

test("meldet abgelehntes Audio-Abspielen sichtbar an den Aufrufer", async () => {
  let blocked = false;
  await playLiveDemoAudio(
    { play: () => Promise.reject(new Error("Autoplay blockiert")) },
    () => { blocked = true; },
  );

  assert.equal(blocked, true);
});

test("meldet auch einen synchronen Audiofehler", async () => {
  let blocked = false;
  await playLiveDemoAudio(
    { play: () => { throw new Error("Audio nicht verfügbar"); } },
    () => { blocked = true; },
  );

  assert.equal(blocked, true);
});
