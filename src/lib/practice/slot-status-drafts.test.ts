import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SLOT_MORE_CHANNELS_LABEL,
  slotMoreChannelsId,
  slotStatusDraftDomIds,
  slotStatusDraftPlan,
} from "./slot-status-drafts.ts";

const phone = {
  confirmWa: "https://wa.me/43664",
  confirmSms: "sms:+43664",
  confirmMail: "mailto:a@b.at",
  cancelWa: "https://wa.me/43664?c=1",
  cancelSms: "sms:+43664?c=1",
  cancelMail: "mailto:a@b.at?c=1",
};

test("with Handy, Bestätigen and Absagen stay out; SMS and mail fold", () => {
  const plan = slotStatusDraftPlan({ status: "gelegt", ...phone });
  assert.deepEqual(plan.primary.map((b) => b.label), ["Bestätigen", "Absagen"]);
  assert.deepEqual(plan.folded.map((b) => b.label), [
    "SMS-Bestätigung",
    "E-Mail-Bestätigung",
    "SMS-Absage",
    "E-Mail-Absage",
  ]);
  assert.equal(SLOT_MORE_CHANNELS_LABEL, "SMS und E-Mail");
  assert.equal(slotMoreChannelsId("heute", "slot-1"), "heute-channels-slot-1");
  assert.equal(slotMoreChannelsId("kalender-", "ab12"), "kalender-channels-ab12");
  assert.deepEqual(slotStatusDraftDomIds("heute-channels-slot-1"), {
    "confirm-wa": "heute-channels-slot-1-confirm-wa",
    "confirm-sms": "heute-channels-slot-1-confirm-sms",
    "confirm-mail": "heute-channels-slot-1-confirm-mail",
    "cancel-wa": "heute-channels-slot-1-cancel-wa",
    "cancel-sms": "heute-channels-slot-1-cancel-sms",
    "cancel-mail": "heute-channels-slot-1-cancel-mail",
    close: "heute-channels-slot-1-schliessen",
  });
  assert.deepEqual(slotStatusDraftDomIds(""), {});
  assert.equal(JSON.stringify(slotStatusDraftDomIds("heute-channels-x")).includes("014051288"), false);
});

test("without Handy, E-Mail stays on the card — the only path", () => {
  const plan = slotStatusDraftPlan({
    status: "gelegt",
    confirmMail: "mailto:?subject=Termin",
    cancelMail: "mailto:?subject=Absage",
  });
  assert.deepEqual(plan.primary.map((b) => b.label), ["E-Mail-Bestätigung", "E-Mail-Absage"]);
  assert.equal(plan.folded.length, 0);
});

test("bestätigt hides confirm; Absagen stays, SMS/mail absage fold when Handy exists", () => {
  const plan = slotStatusDraftPlan({ status: "bestätigt", ...phone });
  assert.deepEqual(plan.primary.map((b) => b.label), ["Absagen"]);
  assert.deepEqual(plan.folded.map((b) => b.label), ["SMS-Absage", "E-Mail-Absage"]);
});

test("abgesagt has no confirm or cancel drafts", () => {
  const plan = slotStatusDraftPlan({ status: "abgesagt", ...phone });
  assert.equal(plan.primary.length, 0);
  assert.equal(plan.folded.length, 0);
});
