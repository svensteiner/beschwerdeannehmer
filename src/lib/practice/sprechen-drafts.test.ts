import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAST_SPRECHEN_DRAFTS_KEY,
  draftsAfterNewCall,
  mergeSprechenDraftIds,
  parseSprechenDraftIds,
  readSprechenDraftIds,
  writeSprechenDraftIds,
} from "./sprechen-drafts.ts";

function memory() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    store,
  };
}

test("sprechen draft ids persist confirm and intern, and empty writes clear", () => {
  assert.equal(parseSprechenDraftIds(null), null);
  assert.equal(parseSprechenDraftIds({ confirmId: "", internId: "" }), null);
  assert.equal(parseSprechenDraftIds({ confirmId: "b-1" })?.confirmId, "b-1");
  const ids = parseSprechenDraftIds({ confirmId: "b-lissi", internId: "th-intern" });
  assert.deepEqual(ids, { confirmId: "b-lissi", internId: "th-intern", reachId: "", kassaId: "" });
  const store = memory();
  writeSprechenDraftIds(store, ids);
  assert.equal(store.store[LAST_SPRECHEN_DRAFTS_KEY]?.includes("b-lissi"), true);
  assert.deepEqual(readSprechenDraftIds(store), ids);
  writeSprechenDraftIds(store, { confirmId: "", internId: "", reachId: "", kassaId: "" });
  assert.equal(readSprechenDraftIds(store), null);
  assert.equal(store.store[LAST_SPRECHEN_DRAFTS_KEY], undefined);
});

test("merge keeps the intern id when a later persist only returns confirm", () => {
  const prev = { confirmId: "b-old", internId: "th-intern", reachId: "", kassaId: "" };
  assert.deepEqual(mergeSprechenDraftIds(prev, { confirmId: "b-new" }), {
    confirmId: "b-new",
    internId: "th-intern",
    reachId: "",
    kassaId: "",
  });
  assert.deepEqual(mergeSprechenDraftIds(prev, { internId: "th-2" }), {
    confirmId: "b-old",
    internId: "th-2",
    reachId: "",
    kassaId: "",
  });
  assert.equal(mergeSprechenDraftIds(prev, { confirmId: "", internId: "" }), null);
  assert.deepEqual(mergeSprechenDraftIds(null, { internId: "th-only" }), {
    confirmId: "",
    internId: "th-only",
    reachId: "",
    kassaId: "",
  });
});

test("merge keeps a Rückruf reach id next to intern", () => {
  const prev = { confirmId: "", internId: "th-intern", reachId: "c-old", kassaId: "" };
  assert.deepEqual(mergeSprechenDraftIds(prev, { internId: "th-2" }), {
    confirmId: "",
    internId: "th-2",
    reachId: "c-old",
    kassaId: "",
  });
  assert.deepEqual(mergeSprechenDraftIds(prev, { reachId: "c-new" }), {
    confirmId: "",
    internId: "th-intern",
    reachId: "c-new",
    kassaId: "",
  });
  assert.deepEqual(mergeSprechenDraftIds(null, { reachId: "c-only" }), {
    confirmId: "",
    internId: "",
    reachId: "c-only",
    kassaId: "",
  });
});

test("merge keeps a Kassa takeover id next to intern", () => {
  const prev = { confirmId: "", internId: "th-intern", reachId: "", kassaId: "c-kassa" };
  assert.deepEqual(mergeSprechenDraftIds(prev, { internId: "th-2" }), {
    confirmId: "",
    internId: "th-2",
    reachId: "",
    kassaId: "c-kassa",
  });
  assert.deepEqual(mergeSprechenDraftIds(prev, { kassaId: "c-new" }), {
    confirmId: "",
    internId: "th-intern",
    reachId: "",
    kassaId: "c-new",
  });
  assert.deepEqual(mergeSprechenDraftIds(null, { kassaId: "c-only" }), {
    confirmId: "",
    internId: "",
    reachId: "",
    kassaId: "c-only",
  });
  assert.equal(mergeSprechenDraftIds(prev, { internId: "", kassaId: "" }), null);
});

test("new call keeps Slot and Rückruf ids for later Handy, drops intern and Kassa", () => {
  assert.deepEqual(
    draftsAfterNewCall({
      confirmId: "b-holzer",
      internId: "th-intern",
      reachId: "c-rueck",
      kassaId: "c-kassa",
    }),
    { confirmId: "b-holzer", internId: "", reachId: "c-rueck", kassaId: "" },
  );
  assert.equal(draftsAfterNewCall({ confirmId: "", internId: "th-intern", reachId: "", kassaId: "c-kassa" }), null);
  assert.equal(draftsAfterNewCall(null), null);
});

test("draft storage never invents Huber ids", () => {
  assert.equal(parseSprechenDraftIds({ href: "https://wa.me/4314051288" }), null);
  assert.equal(readSprechenDraftIds(null), null);
  const store = memory();
  writeSprechenDraftIds(store, null);
  assert.equal(readSprechenDraftIds(store), null);
});
