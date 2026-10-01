import test from "node:test";
import assert from "node:assert/strict";
import { sortComplaintsForInbox } from "./inbox";
import type { Complaint } from "./store.server";

const complaint = (reference: string, priority: Complaint["priority"], createdAt: string): Complaint => ({
  reference, priority, createdAt, location: "Testgarage", category: "Sonstiges",
  description: "Eine ausreichend lange synthetische Beschwerde.", name: "Test",
  email: "test@example.invalid", occurredAt: "", contactPhone: "", status: "neu",
  history: [{ at: createdAt, status: "neu" }],
});

test("Betreiber-Inbox sortiert Sicherheit, Dringend, Normal und dann neueste zuerst", () => {
  const sorted = sortComplaintsForInbox([
    complaint("normal-alt", "normal", "2026-10-01T08:00:00.000Z"),
    complaint("dringend", "dringend", "2026-10-01T07:00:00.000Z"),
    complaint("sicherheit", "sicherheit", "2026-10-01T06:00:00.000Z"),
    complaint("normal-neu", "normal", "2026-10-01T09:00:00.000Z"),
  ]);
  assert.deepEqual(sorted.map((item) => item.reference), ["sicherheit", "dringend", "normal-neu", "normal-alt"]);
});
