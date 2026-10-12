import assert from "node:assert/strict";
import test from "node:test";
import { complaintsByStatus } from "./complaint-board.js";

test("Beschwerde-Tafel gruppiert jeden Vorgang in genau eine Statusspalte", () => {
  const columns = complaintsByStatus([{ status: "neu" }, { status: "neu" }, { status: "in_pruefung" }, { status: "geschlossen" }]);
  assert.equal(columns.neu.length, 2);
  assert.equal(columns.in_pruefung.length, 1);
  assert.equal(columns.beantwortet.length, 0);
  assert.equal(columns.geschlossen.length, 1);
});
