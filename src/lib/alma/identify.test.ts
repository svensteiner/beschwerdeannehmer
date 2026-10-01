import assert from "node:assert/strict";
import { test } from "node:test";
import { PATIENTS } from "./patients.ts";
import {
  IDENT_GREETING_SUFFIX,
  identificationPrompt,
  identifyCaller,
} from "./identify.ts";

test("identifyCaller matches by name + street name", () => {
  const result = identifyCaller(
    [{ role: "user", content: "Hier spricht Frau Berger, Lange Gasse 8." }],
    PATIENTS,
  );
  assert.equal(result.identified, true);
  assert.equal(result.how, "address");
  assert.equal(result.owner, "Mag. Eva Berger");
  assert.equal(result.patient?.name, "Fritz");
});

test("identifyCaller matches by name + house number and zip, diacritics/case-insensitive", () => {
  const result = identifyCaller(
    [
      {
        role: "user",
        content:
          "hallo hier ist frau BERGER, ich wohne auf nummer 8, 1080 wien",
      },
    ],
    PATIENTS,
  );
  assert.equal(result.identified, true);
  assert.equal(result.how, "address");
  assert.equal(result.owner, "Mag. Eva Berger");
});

test("identifyCaller matches by name + phone digits suffix (>=6 consecutive digits)", () => {
  const result = identifyCaller(
    [{ role: "user", content: "Leitner hier, meine Nummer ist 664 512 88 21" }],
    PATIENTS,
  );
  assert.equal(result.identified, true);
  assert.equal(result.how, "phone");
  assert.equal(result.owner, "Frau Leitner");
});

test("identifyCaller stays unidentified without a matching address/phone", () => {
  const result = identifyCaller(
    [
      {
        role: "user",
        content: "Hier spricht Frau Berger, wie geht es meiner Katze?",
      },
    ],
    PATIENTS,
  );
  assert.equal(result.identified, false);
  assert.equal(result.owner, undefined);
});

test("identifyCaller stays unidentified when only the address is given, no matching name", () => {
  const result = identifyCaller(
    [{ role: "user", content: "Ich wohne in der Lange Gasse 8, 1080 Wien." }],
    PATIENTS,
  );
  assert.equal(result.identified, false);
});

test("identifyCaller ignores assistant turns for the caller's own claims", () => {
  const result = identifyCaller(
    [
      { role: "assistant", content: "Frau Berger, Lange Gasse 8?" },
      { role: "user", content: "Nein, das ist nicht meine Adresse." },
    ],
    PATIENTS,
  );
  assert.equal(result.identified, false);
});

test("identifyCaller is whitespace-tolerant on the street name", () => {
  const result = identifyCaller(
    [{ role: "user", content: "Berger,   Lange   Gasse   8" }],
    PATIENTS,
  );
  assert.equal(result.identified, true);
});

test("identifyCaller does not falsely match a different owner on file", () => {
  const result = identifyCaller(
    [{ role: "user", content: "Pichler hier, Lange Gasse 8, 1080 Wien" }],
    PATIENTS,
  );
  assert.equal(result.identified, false);
});

test("identificationPrompt asks for name and address/handy, Austrian tone, no exclamation", () => {
  const prompt = identificationPrompt();
  assert.match(prompt, /Datenabgleich/);
  assert.match(prompt, /Namen/);
  assert.match(prompt, /Adresse/);
  assert.match(prompt, /Handynummer/);
  assert.doesNotMatch(prompt, /!/);
  assert.doesNotMatch(prompt, /gerne!/i);
});

test("identificationPrompt personalizes with a known name, still asks for the address", () => {
  const prompt = identificationPrompt("Frau Berger");
  assert.match(prompt, /Frau Berger/);
  assert.match(prompt, /Datenabgleich/);
  assert.doesNotMatch(prompt, /!/);
});

test("IDENT_GREETING_SUFFIX asks only for the address, Austrian tone", () => {
  assert.match(IDENT_GREETING_SUFFIX, /Datenabgleich/);
  assert.match(IDENT_GREETING_SUFFIX, /nur noch Ihre Adresse/);
  assert.doesNotMatch(IDENT_GREETING_SUFFIX, /heißen Sie/);
  assert.match(IDENT_GREETING_SUFFIX, /Adresse/);
  assert.doesNotMatch(IDENT_GREETING_SUFFIX, /!/);
});
