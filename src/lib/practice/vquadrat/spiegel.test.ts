import assert from "node:assert/strict";
import { test } from "node:test";
import type { Sql } from "../../db.ts";
import { notConnected, VQUADRAT_LABEL } from "../praxissoftware.ts";
import {
  flattenPraxissoftwareOffer,
  spiegelRowLine,
  spiegelRowWorthKeeping,
  spiegelSlotKurz,
} from "./spiegel-row.ts";
import { offerTafelToSpiegel } from "./spiegel.ts";

test("flatten keeps Tafel names and leaves the vendor ref empty", () => {
  const row = flattenPraxissoftwareOffer({
    akte: { pet: "Bella", owner: "Frau Wallner", phone: "0316 73 59 40", chip: "123" },
    slot: {
      start: "2026-09-02T08:00:00+02:00",
      pet: "Bella",
      owner: "Frau Wallner",
      reason: "Kontrolle",
      status: "gelegt",
    },
    kontakt: { owner: "Frau Wallner", email: "wallner@example.com" },
  });
  assert.equal(row.pet, "Bella");
  assert.equal(row.owner_name, "Frau Wallner");
  assert.equal(row.phone, "0316 73 59 40");
  assert.equal(row.email, "wallner@example.com");
  assert.equal(row.chip, "123");
  assert.equal(row.slot_start, "2026-09-02T08:00:00+02:00");
  assert.equal(row.slot_reason, "Kontrolle");
  assert.equal(row.slot_status, "gelegt");
  assert.equal(row.vquadrat_ref, "");
  assert.equal(spiegelRowWorthKeeping(row), true);
  assert.equal(spiegelRowWorthKeeping(flattenPraxissoftwareOffer({})), false);
  assert.match(spiegelSlotKurz("2026-09-02T08:00:00+02:00"), /2\.9/);
  assert.equal(spiegelSlotKurz(""), "");
  assert.match(spiegelRowLine(row), /Bella/);
  assert.match(spiegelRowLine(row), /Frau Wallner/);
  assert.match(spiegelRowLine(row), /gelegt/);
  assert.doesNotMatch(JSON.stringify(row), /PatientID|BesitzerTelefon|github/i);
});

function mockSql(onInsert?: (values: unknown[]) => void): Sql {
  const tag = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    onInsert?.(values);
    return [];
  };
  return Object.assign(tag, { query: async () => [] });
}

test("offerTafelToSpiegel writes only when Vquadrat is the adapter", async () => {
  const inserts: unknown[][] = [];
  const sql = mockSql((values) => inserts.push(values));
  assert.deepEqual(await offerTafelToSpiegel(sql, "p1", "vetera", { akte: { pet: "Bella" } }), {
    skipped: true,
  });
  assert.equal(inserts.length, 0);

  const result = await offerTafelToSpiegel(sql, "p1", VQUADRAT_LABEL, {
    akte: { pet: "Bella", owner: "Frau Wallner" },
    slot: { start: "2026-09-02T08:00:00+02:00", reason: "Kontrolle", status: "gelegt" },
  });
  assert.deepEqual(result, notConnected());
  assert.equal(inserts.length, 1);
  assert.ok(inserts[0].includes("p1"));
  assert.ok(inserts[0].includes("Bella"));
  assert.ok(inserts[0].includes("Frau Wallner"));
  assert.ok(inserts[0].includes("Kontrolle"));
  assert.ok(inserts[0].includes("gelegt"));
  assert.equal(inserts[0][inserts[0].length - 1], "");
});

test("a Spiegel write miss does not fail the Tafel offer", async () => {
  const sql = Object.assign(async () => {
    throw new Error("db down");
  }, { query: async () => [] }) as Sql;
  assert.deepEqual(
    await offerTafelToSpiegel(sql, "p1", VQUADRAT_LABEL, { akte: { pet: "Bella" } }),
    notConnected(),
  );
});
