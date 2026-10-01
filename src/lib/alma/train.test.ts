import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractTrainFact,
  factsMatchingQuery,
  hasLearnedFactConflict,
  formatLearnedFacts,
  heuteFactChipId,
  heuteTrainPrompts,
  isSpeechRecognitionTrainingInput,
  learnedFactsFrom,
  learnedFactsSkipsLlm,
  learnedPromptBlock,
  replyFromLearnedFacts,
  trainGreetingFor,
  trainPromptsFor,
  trainingGreetingFor,
  trainingKindFromSearch,
} from "./train.ts";
import { notesIncomplete, notesSystemRule } from "./desk.ts";
import type { PracticeProfile } from "../practice/profile.ts";

test("strips Schulungs-Anreden from facts", () => {
  assert.equal(
    extractTrainFact("Merk dir: Mittwoch nur Kastrationen."),
    "Mittwoch nur Kastrationen.",
  );
  assert.equal(
    extractTrainFact("Silvia, lerne: keine neuen Katzen vor 14:30"),
    "keine neuen Katzen vor 14:30",
  );
  assert.equal(
    extractTrainFact("Fritz nur in der Box."),
    "Fritz nur in der Box.",
  );
});

test("dedicated speech training keeps even long spoken terms out of practice facts", () => {
  assert.equal(
    isSpeechRecognitionTrainingInput("sprache", "speech"),
    true,
  );
  assert.equal(
    isSpeechRecognitionTrainingInput("wissen", "speech"),
    false,
  );
  assert.equal(
    isSpeechRecognitionTrainingInput("sprache", "typed"),
    false,
  );
});

test("learned facts become a prompt block", () => {
  assert.equal(formatLearnedFacts([]), "");
  assert.match(
    formatLearnedFacts(["Mittwoch nur Kastrationen"]),
    /Mittwoch nur Kastrationen/,
  );
});

test("query matches trained weekday facts", () => {
  const facts = [
    "Mittwoch nur Kastrationen.",
    "Fritz nur in der Transportbox.",
  ];
  assert.deepEqual(factsMatchingQuery("Was gilt mittwochs?", facts), [
    "Mittwoch nur Kastrationen.",
  ]);
  assert.match(
    replyFromLearnedFacts("Was gilt mittwochs?", facts) ?? "",
    /Kastrationen/,
  );
  assert.equal(replyFromLearnedFacts("Wann habt ihr offen?", facts), null);
});

test("ignores generic function words when matching practice knowledge", () => {
  const facts = ["Wir haben Parkplätze hinter dem Haus."];
  assert.equal(replyFromLearnedFacts("Haben Sie heute geöffnet?", facts), null);
  assert.match(
    replyFromLearnedFacts("Wo sind die Parkplätze?", facts) ?? "",
    /Parkplätze hinter dem Haus/,
  );
});

test("answers neutrally when matching practice facts explicitly conflict", () => {
  const facts = [
    "Mittwoch nur Kastrationen.",
    "Mittwoch keine Kastrationen.",
  ];
  assert.equal(hasLearnedFactConflict(facts), true);
  assert.match(replyFromLearnedFacts("Was gilt mittwochs?", facts) ?? "", /widersprüchliche Hinweise/);
  assert.doesNotMatch(replyFromLearnedFacts("Was gilt mittwochs?", facts) ?? "", /Kastrationen.*Kastrationen/);
});

test("recognizes allowed versus forbidden rules without negating allowed", () => {
  assert.equal(
    hasLearnedFactConflict([
      "Mittwoch Kastrationen erlaubt.",
      "Mittwoch Kastrationen verboten.",
    ]),
    true,
  );
  assert.equal(
    hasLearnedFactConflict([
      "Mittwoch Kastrationen erlaubt.",
      "Mittwoch Kastrationen erlaubt.",
    ]),
    false,
  );
});

test("keeps conflicting practice facts out of the model prompt", () => {
  const prompt = learnedPromptBlock([
    "Mittwoch nur Kastrationen.",
    "Mittwoch keine Kastrationen.",
  ]);
  assert.match(prompt, /widersprüchliche Hinweise/);
  assert.doesNotMatch(prompt, /Kastrationen/);
});

test("does not invent conflicts for independent rules", () => {
  const facts = ["Mittwoch nur Kastrationen.", "Parken hinter dem Haus."];
  assert.equal(hasLearnedFactConflict(facts), false);
  assert.match(replyFromLearnedFacts("Was gilt mittwochs?", facts) ?? "", /Kastrationen/);
});

test("keeps compatible restrictions and different time contexts separate", () => {
  assert.equal(
    hasLearnedFactConflict([
      "Mittwoch keine Kastrationen.",
      "Mittwoch keine Kastrationen ohne Termin.",
    ]),
    false,
  );
  assert.equal(
    hasLearnedFactConflict([
      "Mittwoch nur Kastrationen.",
      "Mittwoch Kastrationen nur mit Termin.",
    ]),
    false,
  );
  assert.equal(
    hasLearnedFactConflict(["Montag keine Kastrationen.", "Mittwoch nur Kastrationen."]),
    false,
  );
  assert.equal(
    hasLearnedFactConflict([
      "Mittwoch 8 Uhr keine Kastrationen.",
      "Mittwoch 10 Uhr nur Kastrationen.",
    ]),
    false,
  );
});

test("settings notes count as a Hausregel", () => {
  assert.deepEqual(learnedFactsFrom([], ""), []);
  assert.deepEqual(learnedFactsFrom([], "  Mittwoch nur Kastrationen.  "), [
    "Mittwoch nur Kastrationen.",
  ]);
  assert.deepEqual(
    learnedFactsFrom(
      ["Impfungen nur vormittags."],
      "Mittwoch nur Kastrationen.",
    ),
    ["Mittwoch nur Kastrationen.", "Impfungen nur vormittags."],
  );
  assert.deepEqual(
    learnedFactsFrom(
      ["Mittwoch nur Kastrationen."],
      "mittwoch nur kastrationen.",
    ),
    ["Mittwoch nur Kastrationen."],
  );
  assert.match(
    replyFromLearnedFacts(
      "Was gilt mittwochs?",
      learnedFactsFrom([], "Mittwoch nur Kastrationen."),
    ) ?? "",
    /Kastrationen/,
  );
  assert.doesNotMatch(
    replyFromLearnedFacts(
      "Was gilt mittwochs?",
      learnedFactsFrom([], "Mittwoch nur Kastrationen."),
    ) ?? "",
    /Fritz|Josefstadt|Vetmeduni/,
  );
  assert.match(
    learnedPromptBlock([], "Mittwoch nur Kastrationen."),
    /Gelerntes der Ordination[\s\S]*Mittwoch nur Kastrationen/,
  );
  assert.match(
    learnedPromptBlock(
      ["Impfungen nur vormittags."],
      "Mittwoch nur Kastrationen.",
    ),
    /Kastrationen[\s\S]*Impfungen nur vormittags/,
  );
  assert.equal(learnedPromptBlock([], ""), "");
  assert.doesNotMatch(
    learnedPromptBlock([], "Mittwoch nur Kastrationen."),
    /Fritz|Josefstadt|Vetmeduni/,
  );
  assert.equal(notesIncomplete("", []), true);
  assert.equal(notesIncomplete("", learnedFactsFrom([], "")), true);
  assert.equal(
    notesIncomplete("", learnedFactsFrom([], "Mittwoch nur Kastrationen.")),
    false,
  );
  const liveEmpty: Pick<PracticeProfile, "notes"> & { isDemo: boolean } = {
    notes: "",
    isDemo: false,
  };
  assert.match(
    notesSystemRule(liveEmpty, learnedFactsFrom([], "")),
    /HAUSREGEL OHNE NOTIZ/,
  );
  assert.equal(
    notesSystemRule(
      liveEmpty,
      learnedFactsFrom([], "Mittwoch nur Kastrationen."),
    ),
    "",
  );
  assert.equal(
    learnedFactsSkipsLlm({
      message: "Was gilt mittwochs?",
      notes: "Mittwoch nur Kastrationen.",
    }),
    true,
  );
  assert.equal(
    learnedFactsSkipsLlm({
      message: "Wann habt ihr offen?",
      notes: "Mittwoch nur Kastrationen.",
    }),
    false,
  );
  assert.equal(
    learnedFactsSkipsLlm({
      message: "Was gilt mittwochs?",
      notes: "Mittwoch nur Kastrationen.",
      train: true,
    }),
    false,
  );
  assert.equal(
    learnedFactsSkipsLlm({ message: "Was gilt mittwochs?", notes: "" }),
    false,
  );
});

test("train greeting names the Ordination", () => {
  assert.match(trainGreetingFor("Huber"), /Huber/);
  assert.match(trainGreetingFor(), /schulen Sie mich/);
});

test("training search selects only the dedicated speech mode", () => {
  assert.equal(trainingKindFromSearch("sprache"), "sprache");
  assert.equal(trainingKindFromSearch("wissen"), "wissen");
  assert.equal(trainingKindFromSearch(undefined), "wissen");
});

test("training greetings distinguish practice knowledge from speech recognition", () => {
  assert.match(trainingGreetingFor("wissen"), /Was soll ich wissen/);
  assert.match(trainingGreetingFor("sprache"), /Fachbegriff/);
  assert.match(trainingGreetingFor("sprache", "Huber"), /^Grüß Gott, Huber/);
});

test("speech training offers spoken term examples instead of typed knowledge prompts", () => {
  assert.deepEqual(trainPromptsFor(false, "sprache"), [
    "FIP",
    "MRT",
    "Kastration",
    "Ovariohysterektomie",
  ]);
  assert.equal(
    trainPromptsFor(true, "sprache").some((prompt) => /Mittwoch|Parken/i.test(prompt)),
    false,
  );
});

test("live Schulung chips never seed Fritz or an invented Nachtdienst", () => {
  const live = trainPromptsFor(true);
  assert.equal(
    live.some((p) => /fritz|tierspital|vetmeduni|25077/i.test(p)),
    false,
  );
  assert.equal(live.includes("Mittwoch nur Kastrationen."), true);
  const demo = trainPromptsFor(false);
  assert.equal(
    demo.some((p) => /fritz/i.test(p)),
    true,
  );
  assert.equal(
    demo.some((p) => /bei der begrüßung/i.test(p)),
    true,
  );
  const heute = heuteTrainPrompts();
  assert.equal(heute.includes("Mittwoch nur Kastrationen."), true);
  assert.equal(
    heute.some((p) => /^Parken /i.test(p)),
    false,
  );
  assert.equal(
    heuteFactChipId("Mittwoch nur Kastrationen."),
    "heute-fakt-kastrationen",
  );
  assert.equal(
    heuteFactChipId("Keine neuen Katzen vor 14:30."),
    "heute-fakt-katzen",
  );
  assert.equal(
    heuteFactChipId("Impfungen nur vormittags."),
    "heute-fakt-impfungen",
  );
});
