import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Telefonroute loggt weder callId noch gespeicherte Antworten oder rohe Fehler", () => {
  const source = readFileSync(new URL("./antwort.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /console\.error\([^\n]*callId/);
  assert.doesNotMatch(source, /console\.error\([^\n]*(?:saved|result|err)\b/);
  assert.doesNotMatch(source, /JSON\.stringify\(saved\)/);
  assert.match(source, /console\.error\("\[telefon-antwort\] askAlma fehlgeschlagen"\)/);
});
