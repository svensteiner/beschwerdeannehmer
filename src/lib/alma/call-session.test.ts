import assert from "node:assert/strict";
import test from "node:test";
import {
  isCurrentCallSession,
  isCurrentRecordingSession,
  stopMediaStreamTracks,
} from "./call-session.ts";

test("nur die aktive Leitung darf eine Antwort anzeigen", () => {
  assert.equal(
    isCurrentCallSession({
      callGeneration: 4,
      currentCallGeneration: 4,
      phase: "live",
    }),
    true,
  );
  assert.equal(
    isCurrentCallSession({
      callGeneration: 4,
      currentCallGeneration: 5,
      phase: "live",
    }),
    false,
  );
  assert.equal(
    isCurrentCallSession({
      callGeneration: 4,
      currentCallGeneration: 4,
      phase: "ended",
    }),
    false,
  );
});

test("Stream-Helfer ruft stop für jede Spur auch bei wiederholter Bereinigung auf", () => {
  const tracks = [{ stops: 0, stop() { this.stops += 1; } }, { stops: 0, stop() { this.stops += 1; } }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  stopMediaStreamTracks(stream);
  stopMediaStreamTracks(stream);
  assert.deepEqual(tracks.map((track) => track.stops), [2, 2]);
});

test("eine alte oder abgebrochene Aufnahme wird nicht hochgeladen", () => {
  const current = {
    listenGeneration: 7,
    currentListenGeneration: 7,
    callGeneration: 3,
    currentCallGeneration: 3,
    phase: "live",
  };
  assert.equal(isCurrentRecordingSession(current), true);
  assert.equal(
    isCurrentRecordingSession({ ...current, currentListenGeneration: 8 }),
    false,
  );
  assert.equal(
    isCurrentRecordingSession({ ...current, currentCallGeneration: 4 }),
    false,
  );
  assert.equal(
    isCurrentRecordingSession({ ...current, ownsRecorder: false }),
    false,
  );
});
