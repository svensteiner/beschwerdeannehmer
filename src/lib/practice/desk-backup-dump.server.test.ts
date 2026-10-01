import assert from "node:assert/strict";
import test from "node:test";
import { finalizeDeskBackupStamp } from "./desk-backup-dump.server.ts";

test("voller Datenträger beim finalen Sicherungsstempel liefert keinen Erfolg", () => {
  const rollbacks: Array<[string | undefined, string | null | undefined]> = [];
  const result = finalizeDeskBackupStamp(
    "C:/synthetic/tafel",
    { previous: "2026-09-13T08:00:00.000Z", iso: "2026-09-13T09:00:00.000Z" },
    {
      write: () => { throw Object.assign(new Error("disk full"), { code: "ENOSPC" }); },
      rollback: (dir, previous) => { rollbacks.push([dir, previous]); },
    },
  );
  assert.equal(result, null);
  assert.deepEqual(rollbacks, [["C:/synthetic/tafel", "2026-09-13T08:00:00.000Z"]]);
});

test("finaler Sicherungsstempel bestätigt erst den auslieferbaren Download", () => {
  const result = finalizeDeskBackupStamp(
    "C:/synthetic/tafel",
    { previous: null, iso: "2026-09-13T09:00:00.000Z" },
    {
      write: (_dir, at) => String(at),
      rollback: () => { throw new Error("darf bei Erfolg nicht laufen"); },
    },
  );
  assert.equal(result, "2026-09-13T09:00:00.000Z");
});

test("fehlgeschlagene Rücknahme bleibt ohne Sicherungserfolg", () => {
  const result = finalizeDeskBackupStamp(
    "C:/synthetic/tafel",
    { previous: "2026-09-13T08:00:00.000Z", iso: "2026-09-13T09:00:00.000Z" },
    {
      write: () => { throw new Error("synthetic ENOSPC"); },
      rollback: () => { throw new Error("synthetic rollback ENOSPC"); },
    },
  );
  assert.equal(result, null);
});
