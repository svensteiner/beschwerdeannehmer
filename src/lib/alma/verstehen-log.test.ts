import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { localReply } from "./ask-alma.ts";
import { demoDesk } from "./desk.ts";
import {
  VERSTEHEN_LOG_CAP,
  MEMORY_VERSTEHEN_LOG,
  appendVerstehenLog,
  isWeakReply,
  readVerstehenLog,
  verstehenLogPath,
  type VerstehenLogEntry,
} from "./verstehen-log.ts";

const desk = demoDesk();

test("isWeakReply: true for the generic Begrüßungs-Fallback (localReply, kein Treffer erkannt)", () => {
  const result = localReply(
    "brabbel unverständliches zeugs xyz",
    [],
    "standard",
    desk,
  );
  assert.match(result.text, /Gerne helfe ich mit Termin/);
  assert.equal(isWeakReply(result.text), true);
});

test("isWeakReply: true for the unclear reply branch", () => {
  const result = localReply("Wie bitte?", [], "standard", desk);
  assert.equal(
    result.text,
    "Das habe ich nicht verstanden, sagen Sie es bitte noch einmal.",
  );
  assert.equal(isWeakReply(result.text), true);
});

test("isWeakReply: false for a real, specific local reply (hours)", () => {
  const result = localReply("Wann habt ihr offen?", [], "standard", desk);
  assert.equal(isWeakReply(result.text), false);
});

test("isWeakReply: false for a real, specific local reply (Termin)", () => {
  const result = localReply(
    "Ich hätte gern einen Termin für meinen Hund.",
    [],
    "standard",
    desk,
  );
  assert.equal(isWeakReply(result.text), false);
});

test("isWeakReply: empty text is not weak", () => {
  assert.equal(isWeakReply(""), false);
});

test("verstehenLogPath: SILVIA_DATA_DIR or the .silvia-data default", () => {
  assert.equal(
    verstehenLogPath({ SILVIA_DATA_DIR: "/tmp/foo" }),
    "/tmp/foo/verstehen-log.jsonl",
  );
  assert.equal(
    verstehenLogPath({ SILVIA_DATA_DIR: "/tmp/foo/" }),
    "/tmp/foo/verstehen-log.jsonl",
  );
  assert.equal(verstehenLogPath({}), ".silvia-data/verstehen-log.jsonl");
  for (const value of ["memory", "memory://", ":memory:", " MEMORY:// "]) {
    assert.equal(verstehenLogPath({ SILVIA_DATA_DIR: value }), MEMORY_VERSTEHEN_LOG);
  }
});

test("memory log retains bounded entries without sharing mutable objects", async () => {
  const entry = makeEntry("Synthetic memory test");
  const before = await readVerstehenLog(MEMORY_VERSTEHEN_LOG);
  await appendVerstehenLog(entry, MEMORY_VERSTEHEN_LOG);
  entry.sagt = "changed by caller";
  const first = await readVerstehenLog(MEMORY_VERSTEHEN_LOG);
  assert.equal(first[before.length].sagt, "Synthetic memory test");
  first[before.length].sagt = "changed by reader";
  assert.equal((await readVerstehenLog(MEMORY_VERSTEHEN_LOG))[before.length].sagt, "Synthetic memory test");
  for (let i = first.length; i < VERSTEHEN_LOG_CAP + 1; i++) {
    await appendVerstehenLog(makeEntry("Synthetic cap test"), MEMORY_VERSTEHEN_LOG);
  }
  assert.equal((await readVerstehenLog(MEMORY_VERSTEHEN_LOG)).length, VERSTEHEN_LOG_CAP);
});

function makeEntry(sagt: string): VerstehenLogEntry {
  return {
    ts: new Date().toISOString(),
    sagt,
    antwort: "Das habe ich nicht verstanden, sagen Sie es bitte noch einmal.",
    quelle: "local",
    identified: false,
  };
}

test("appendVerstehenLog + readVerstehenLog: round trip, creates the dir, skips bad lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-verstehen-log-"));
  try {
    const path = join(dir, "nested", "verstehen-log.jsonl");
    await appendVerstehenLog(makeEntry("Hä was moanst?"), path);
    await appendVerstehenLog(makeEntry("Servas, is wer do?"), path);

    const raw = await readFile(path, "utf8");
    await appendFile(path, "not json at all\n");

    const entries = await readVerstehenLog(path);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].sagt, "Hä was moanst?");
    assert.equal(entries[1].sagt, "Servas, is wer do?");
    assert.ok(raw.trim().length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("appendVerstehenLog: never throws on an unwritable path", async () => {
  await assert.doesNotReject(() =>
    appendVerstehenLog(
      makeEntry("egal"),
      "\0invalid\0path/verstehen-log.jsonl",
    ),
  );
});

test("readVerstehenLog: missing file returns an empty array", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-verstehen-log-missing-"));
  try {
    const entries = await readVerstehenLog(join(dir, "does-not-exist.jsonl"));
    assert.deepEqual(entries, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("appendVerstehenLog: caps at VERSTEHEN_LOG_CAP entries, ignores appends beyond that", async () => {
  const dir = await mkdtemp(join(tmpdir(), "silvia-verstehen-log-cap-"));
  try {
    const path = join(dir, "verstehen-log.jsonl");
    const lines = Array.from({ length: VERSTEHEN_LOG_CAP }, (_, i) =>
      JSON.stringify(makeEntry(`Zeile ${i}`)),
    ).join("\n");
    await writeFile(path, `${lines}\n`, "utf8");

    await appendVerstehenLog(makeEntry("sollte verworfen werden"), path);

    const entries = await readVerstehenLog(path);
    assert.equal(entries.length, VERSTEHEN_LOG_CAP);
    assert.ok(!entries.some((e) => e.sagt === "sollte verworfen werden"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
