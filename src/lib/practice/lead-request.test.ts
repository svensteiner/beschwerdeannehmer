import assert from "node:assert/strict";
import test from "node:test";
import { leadRequestForSnapshot, leadRequestSignature } from "./lead-request.ts";

const form = { practice: "A", contact: "B", email: "b@example.test", phone: "", bundesland: "Wien", pms: "Vquadrat Veterinär", message: "M" };
test("gleicher Snapshot behält Vorgangs-ID, geänderter Snapshot erhält neue", () => {
  const first = leadRequestForSnapshot(null, form, () => "id-1");
  assert.equal(first.requestId, "id-1");
  assert.deepEqual(leadRequestForSnapshot(first, { ...form }, () => "id-2"), first);
  const changed = leadRequestForSnapshot(first, { ...form, message: "neu" }, () => "id-3");
  assert.equal(changed.requestId, "id-3");
  assert.equal(leadRequestSignature(form), leadRequestSignature({ ...form }));
});
