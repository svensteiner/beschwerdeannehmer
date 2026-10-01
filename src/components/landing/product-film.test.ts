import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./product-film.tsx", import.meta.url), "utf8");

test("Produktfilm meldet Film-Cues global an und gibt sie beim Aufräumen frei", () => {
  assert.match(source, /startAudioPreview\(audio\);\s*void audio\.play/);
  assert.match(source, /clearAudioPreview\(audio\);\s*audio\.pause/);
});
