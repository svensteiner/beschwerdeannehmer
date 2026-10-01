import assert from "node:assert/strict";
import test from "node:test";
import {
  playAudioWithPlayback,
  stopAudio,
  waitForAudioPlayback,
} from "./sprechen-call-helpers.ts";

test("Audioabbruch entfernt Endhandler vor pause und leert die Referenz", () => {
  let pauses = 0;
  let ends = 0;
  const audio = {
    onended: () => {
      ends += 1;
    },
    onerror: () => undefined,
    pause() {
      pauses += 1;
      audio.onended?.call(audio, new Event("ended"));
    },
  } as unknown as HTMLAudioElement;
  const ref = { current: audio as HTMLAudioElement | null };
  stopAudio(ref);
  stopAudio(ref);
  assert.equal(pauses, 1);
  assert.equal(ends, 0);
  assert.equal(audio.onended, null);
  assert.equal(audio.onerror, null);
  assert.equal(ref.current, null);
});

function fakeAudio() {
  return {
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
  } as unknown as HTMLAudioElement;
}

test("Playback-Cleanup unterscheidet normales Ende und räumt Handler auf", async () => {
  const timers = new Map<number, () => void>();
  let nextId = 0;
  let cleared = 0;
  const audio = fakeAudio();
  const playback = waitForAudioPlayback(audio, () => false, {
    setInterval: (callback) => {
      const id = ++nextId;
      timers.set(id, callback);
      return id;
    },
    clearInterval: (id) => {
      cleared += 1;
      timers.delete(id);
    },
  });
  (audio.onended as unknown as (() => void) | null)?.();
  assert.equal(await playback.ended, "ended");
  assert.equal(cleared, 1);
  assert.equal(timers.size, 0);
  assert.equal(audio.onended, null);
  assert.equal(audio.onerror, null);
});

test("natürliches Audioende mit vorherigem pause setzt den nächsten Satz fort", async () => {
  const audio = { ...fakeAudio(), ended: true } as unknown as HTMLAudioElement;
  const playback = waitForAudioPlayback(audio, () => false, {
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  audio.onpause?.call(audio, new Event("pause"));
  assert.equal(await playback.ended, "ended");

  const interrupted = { ...fakeAudio(), ended: false } as unknown as HTMLAudioElement;
  const cancelled = waitForAudioPlayback(interrupted, () => false, {
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  interrupted.onpause?.call(interrupted, new Event("pause"));
  assert.equal(await cancelled.ended, "cancel");
});

test("Playback-Cleanup unterscheidet Fehler und Abbruch", async () => {
  const audio = fakeAudio();
  let tick!: () => void;
  let cleared = 0;
  const playback = waitForAudioPlayback(audio, () => true, {
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      cleared += 1;
    },
  });
  tick();
  assert.equal(await playback.ended, "cancel");
  assert.equal(cleared, 1);

  const errorAudio = fakeAudio();
  const errorPlayback = waitForAudioPlayback(errorAudio, () => false, {
    setInterval: () => 1,
    clearInterval: () => {
      cleared += 1;
    },
  });
  (errorAudio.onerror as unknown as (() => void) | null)?.();
  assert.equal(await errorPlayback.ended, "error");
  assert.equal(cleared, 2);
});

test("abgelehntes play wird als Audiofehler abgeschlossen", async () => {
  const audio = {
    ...fakeAudio(),
    play: async () => {
      throw new Error("synthetic play rejection");
    },
  } as unknown as HTMLAudioElement;
  const playback = waitForAudioPlayback(audio, () => false, {
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  assert.equal(await playAudioWithPlayback(audio, playback), "error");
});

test("cancel beendet auch bei offenem play-Promise sofort", async () => {
  let resolvePlay!: () => void;
  const audio = {
    ...fakeAudio(),
    play: () =>
      new Promise<void>((resolve) => {
        resolvePlay = resolve;
      }),
  } as unknown as HTMLAudioElement;
  const playback = waitForAudioPlayback(audio, () => false, {
    setInterval: () => 1,
    clearInterval: () => undefined,
  });
  const pending = playAudioWithPlayback(audio, playback);
  playback.finish("cancel");
  assert.equal(await pending, "cancel");
  resolvePlay();
});
