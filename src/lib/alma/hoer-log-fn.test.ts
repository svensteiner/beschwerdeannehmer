import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_HOER_KORREKTUR_LEN,
  validateHoerKorrekturInput,
} from "./hoer-log-fn.ts";

const uuid = "11111111-1111-4111-8111-111111111111";

test("Hörkorrektur-Validierung bewahrt gültige Texte, UUID und Demo", () => {
  const heard = "h".repeat(MAX_HOER_KORREKTUR_LEN);
  const corrected = "c".repeat(MAX_HOER_KORREKTUR_LEN);
  assert.deepEqual(validateHoerKorrekturInput({
    heard,
    corrected,
    demo: true,
    requestId: ` ${uuid} `,
  }), { heard, corrected, demo: true, requestId: uuid });
  assert.deepEqual(validateHoerKorrekturInput({ heard: "FIP", corrected: "Fiep", demo: false }), {
    heard: "FIP", corrected: "Fiep", demo: false, requestId: undefined,
  });
});

test("Hörkorrektur-Validierung lehnt gekürzte, leere und nicht-textliche Werte vor jedem Schreiben ab", () => {
  const valid = { heard: "FIP", corrected: "Fiep" };
  for (const input of [
    { ...valid, heard: "h".repeat(MAX_HOER_KORREKTUR_LEN + 1) },
    { ...valid, corrected: "c".repeat(MAX_HOER_KORREKTUR_LEN + 1) },
    { ...valid, heard: "   " },
    { ...valid, corrected: "   " },
    { corrected: "Fiep" },
    { heard: "FIP" },
    { ...valid, heard: { text: "FIP" } },
    { ...valid, corrected: ["Fiep"] },
    { ...valid, requestId: { uuid } },
    { ...valid, requestId: "not-a-uuid" },
    null,
    [valid],
  ]) {
    assert.equal(validateHoerKorrekturInput(input), null);
  }
});
