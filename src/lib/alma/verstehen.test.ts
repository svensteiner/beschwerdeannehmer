import assert from "node:assert/strict";
import { test } from "node:test";
import { localReply } from "./ask-alma.ts";
import { demoDesk } from "./desk.ts";
import { VERSTEHEN_KORPUS, type VerstehenFall } from "./verstehen.corpus.ts";

/**
 * Verständnis-Korpus gegen den lokalen Regelpfad (localReply, kein Modell-Key
 * auf dieser Maschine). Jeder Fall: Silvias Antwort muss mindestens eines der
 * erwarteten Wörter enthalten und keines der verbotenen (case-insensitive).
 * Für "identifikation"-Fälle und den Termin-Fall danach steht der Datenabgleich
 * schon aus einer vorigen Anruferin-Zeile.
 */

const desk = demoDesk();
/** Neutrale Vorzeile: der Datenabgleich passiert erst in der geprüften Zeile. */
const IDENT_PRIOR = "Grüß Gott, ich hätte eine Frage.";

type Ausgang = {
  fall: VerstehenFall;
  text: string;
  ok: boolean;
  grund: string;
};

function priorFor(fall: VerstehenFall): string {
  return fall.absicht === "identifikation" ? IDENT_PRIOR : "";
}

function pruefeFall(fall: VerstehenFall): Ausgang {
  const result = localReply(
    fall.sagt,
    [],
    "akte",
    desk,
    true,
    false,
    [],
    priorFor(fall),
  );
  const lower = result.text.toLowerCase();
  const erwartetHit = fall.erwartet.some((wort) =>
    lower.includes(wort.toLowerCase()),
  );
  if (!erwartetHit) {
    return {
      fall,
      text: result.text,
      ok: false,
      grund: `keines von [${fall.erwartet.join(", ")}] gefunden`,
    };
  }
  const verbotenHit = (fall.verboten ?? []).find((wort) =>
    lower.includes(wort.toLowerCase()),
  );
  if (verbotenHit) {
    return {
      fall,
      text: result.text,
      ok: false,
      grund: `verbotenes Wort "${verbotenHit}" enthalten`,
    };
  }
  return { fall, text: result.text, ok: true, grund: "" };
}

function failureTable(fails: Ausgang[]): string {
  return fails
    .map(
      (a) =>
        `  [${a.fall.absicht}] "${a.fall.sagt}" -> "${a.text}" (${a.grund})`,
    )
    .join("\n");
}

test("Verständnis-Korpus: lokaler Regelpfad trifft mindestens 32 von 34 Fällen", () => {
  const ausgaenge = VERSTEHEN_KORPUS.map(pruefeFall);
  const fails = ausgaenge.filter((a) => !a.ok);
  const bestanden = ausgaenge.length - fails.length;
  console.log(
    `Verständnis-Korpus: ${bestanden}/${ausgaenge.length} bestanden.`,
  );
  if (fails.length) console.log(failureTable(fails));
  assert.ok(
    bestanden >= 32,
    `Nur ${bestanden} von ${ausgaenge.length} bestanden (mindestens 32 gefordert):\n${failureTable(fails)}`,
  );
});

test("jeder einzelne Verständnis-Fall besteht (kein Rückschritt, sobald er einmal grün ist)", () => {
  const fails = VERSTEHEN_KORPUS.map(pruefeFall).filter((a) => !a.ok);
  assert.deepEqual(
    fails.map((a) => a.fall.sagt),
    [],
    failureTable(fails),
  );
});

test("Termin-Anfrage nach Datenabgleich (Berger/Fritz) bekommt sofort die Bestätigung", () => {
  const result = localReply(
    "Berger, Lange Gasse 8, ich hätte gern einen Termin für den Kater Fritz.",
    [],
    "akte",
    desk,
    true,
    false,
    [],
    IDENT_PRIOR,
  );
  assert.match(result.text, /^Danke, Frau Berger, ich hab Sie\./);
  assert.equal(result.action.owner, "Mag. Eva Berger");
  assert.equal(result.action.pet, "Fritz");
});
