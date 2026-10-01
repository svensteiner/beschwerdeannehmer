import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearSetupProgress,
  isSetupWizardStep,
  markSetupComplete,
  practiceNeedsSetup,
  readSetupSkipped,
  readSetupStep,
  setupBannerVisible,
  writeSetupSkipped,
  writeSetupStep,
} from "./setup-wizard.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test("practiceNeedsSetup is true only when both vets and resources are empty", () => {
  assert.equal(practiceNeedsSetup({ vets: "", resources: "" }), true);
  assert.equal(practiceNeedsSetup({ vets: "  ", resources: null }), true);
  assert.equal(practiceNeedsSetup({ vets: "Dr. Berger", resources: "" }), false);
  assert.equal(practiceNeedsSetup({ vets: "", resources: "OP 1" }), false);
});

test("isSetupWizardStep bounds to 1..4", () => {
  assert.equal(isSetupWizardStep(1), true);
  assert.equal(isSetupWizardStep(4), true);
  assert.equal(isSetupWizardStep(0), false);
  assert.equal(isSetupWizardStep(5), false);
  assert.equal(isSetupWizardStep(2.5), false);
});

test("setup step and skip state round-trip per practice, missing storage stays safe", () => {
  const store = fakeStorage();
  assert.equal(readSetupStep(store, "p1"), 1);
  assert.equal(readSetupSkipped(store, "p1"), false);

  writeSetupStep(store, "p1", 3);
  assert.equal(readSetupStep(store, "p1"), 3);
  assert.equal(readSetupStep(store, "p2"), 1, "different practice stays untouched");

  writeSetupSkipped(store, "p1");
  assert.equal(readSetupSkipped(store, "p1"), true);
  assert.equal(readSetupSkipped(store, "p2"), false);

  clearSetupProgress(store, "p1");
  assert.equal(readSetupStep(store, "p1"), 1);
  assert.equal(readSetupSkipped(store, "p1"), false);

  // No storage (private mode / SSR) never throws and always falls back conservatively.
  assert.equal(readSetupStep(null, "p1"), 1);
  assert.equal(readSetupSkipped(null, "p1"), false);
  writeSetupStep(null, "p1", 2);
  writeSetupSkipped(null, "p1");
  clearSetupProgress(null, "p1");
});

test("markSetupComplete keeps the banner away even if vets/resources stay empty (no Praxissoftware)", () => {
  const store = fakeStorage();
  writeSetupStep(store, "p1", 2);
  markSetupComplete(store, "p1");
  assert.equal(readSetupSkipped(store, "p1"), true, "banner must not come back after Einrichtung abschließen");
  assert.equal(readSetupStep(store, "p1"), 1, "step resets so a later manual visit starts over");
  // Never throws without storage (private mode / SSR).
  markSetupComplete(null, "p1");
});

test("setupBannerVisible only shows to the Inhaberin, when needed and not skipped", () => {
  assert.equal(setupBannerVisible({ needsSetup: true, skipped: false, isInhaberin: true }), true);
  assert.equal(setupBannerVisible({ needsSetup: false, skipped: false, isInhaberin: true }), false);
  assert.equal(setupBannerVisible({ needsSetup: true, skipped: true, isInhaberin: true }), false);
  assert.equal(setupBannerVisible({ needsSetup: true, skipped: false, isInhaberin: false }), false);
});
