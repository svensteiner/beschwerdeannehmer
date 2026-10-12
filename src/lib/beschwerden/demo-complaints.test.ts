import assert from "node:assert/strict";
import test from "node:test";
import { demoComplaints } from "./demo-complaints.js";

test("Demo-Vorgänge sind ohne ausdrücklich aktivierten Demo-Modus unsichtbar", () => {
  const previous = process.env.GARAGEN_DEMO_MODE;
  delete process.env.GARAGEN_DEMO_MODE;
  assert.deepEqual(demoComplaints(), []);
  if (previous === undefined) delete process.env.GARAGEN_DEMO_MODE;
  else process.env.GARAGEN_DEMO_MODE = previous;
});

test("Demo-Modus liefert nur vielfältige, synthetische Vorgänge", () => {
  const previous = process.env.GARAGEN_DEMO_MODE;
  process.env.GARAGEN_DEMO_MODE = "1";
  const complaints = demoComplaints();

  assert.equal(complaints.length, 8);
  assert.deepEqual(new Set(complaints.map((complaint) => complaint.location)), new Set(["Hauptbahnhof", "Stadtpark"]));
  assert.ok(new Set(complaints.map((complaint) => complaint.priority)).size >= 3);
  assert.ok(new Set(complaints.map((complaint) => complaint.status)).size >= 4);
  assert.ok(complaints.some((complaint) => /überfällig/i.test(complaint.description)));
  assert.ok(complaints.every((complaint) => complaint.email.endsWith("@example.invalid")));

  complaints[0].location = "Verändert";
  assert.notEqual(demoComplaints()[0].location, "Verändert");
  if (previous === undefined) delete process.env.GARAGEN_DEMO_MODE;
  else process.env.GARAGEN_DEMO_MODE = previous;
});
