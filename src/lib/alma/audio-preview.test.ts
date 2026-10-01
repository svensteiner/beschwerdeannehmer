import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUDIO_PREVIEW_START_EVENT,
  beginAudioPreview,
  startAudioPreview,
} from "./audio-preview.ts";

function audio() {
  const item = {
    currentTime: 12,
    pauses: 0,
    pause() {
      item.pauses += 1;
    },
  };
  return item as unknown as HTMLAudioElement & { pauses: number };
}

test("der jüngste Audio-Klick beendet die vorherige Hörprobe", () => {
  const first = audio();
  const firstGeneration = beginAudioPreview();
  assert.equal(startAudioPreview(first, firstGeneration), true);

  const secondGeneration = beginAudioPreview();
  assert.equal(first.pauses, 1);
  assert.equal(first.currentTime, 0);
  assert.equal(startAudioPreview(audio(), firstGeneration), false);
  assert.equal(startAudioPreview(audio(), secondGeneration), true);
});

test("ein neuer Tonstart meldet der Live-Hörprobe den Vorrang", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fakeWindow = new EventTarget();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  });
  let starts = 0;
  fakeWindow.addEventListener(AUDIO_PREVIEW_START_EVENT, () => { starts += 1; });
  try {
    const generation = beginAudioPreview();
    assert.equal(startAudioPreview(audio(), generation), true);
    assert.equal(starts, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
