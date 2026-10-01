#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { action: "restore", dir: undefined, dump: undefined, fault: undefined, waiter: false, verifyFacts: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dir") {
      out.dir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--dump") {
      out.dump = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--action") {
      out.action = args[i + 1] || out.action;
      i += 1;
      continue;
    }
    if (arg === "--fault") {
      out.fault = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--waiter") {
      out.waiter = true;
      continue;
    }
    if (arg === "--verify-facts") {
      out.verifyFacts = true;
    }
  }
  return out;
}

async function main() {
  const parsed = parseArgs();
  if (!parsed.dir || (parsed.action !== "restore" && parsed.action !== "bootstrap") || (parsed.action === "restore" && !parsed.dump)) {
    console.error("usage: backup-restore-subprocess.mjs --action <restore|bootstrap> --dir <path> [--dump <file>]");
    process.exitCode = 2;
    return;
  }

  process.env.SILVIA_DATA_DIR = String(parsed.dir);
  process.env.DATABASE_URL = "";

  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    resolve: { tsconfigPaths: true },
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    // SSR loading keeps Vite's literal import.meta.glob migration macro intact.
    const restoreTest = await vite.ssrLoadModule("/src/lib/pglite-restore-fs.ts");
    let renameCalls = 0;
    let releaseRestoreLoad;
    let markRestoreLoadEntered;
    const restoreLoadEntered = new Promise((resolve) => { markRestoreLoadEntered = resolve; });
    const rollbackFault = parsed.fault === "rollback-rm-eacces" || parsed.fault === "rollback-rename-eacces";
    const partialLoadFault = parsed.fault === "load-enospc-partial";
    restoreTest.setPgliteRestoreTestHooks(parsed.fault ? {
      fs: {
        ...(parsed.fault === "rename-eacces" || parsed.fault === "rollback-rename-eacces" ? {
          rename: async (...args) => {
            renameCalls += 1;
            if ((parsed.fault === "rename-eacces" && renameCalls === 1) ||
                (parsed.fault === "rollback-rename-eacces" && renameCalls === 2)) {
              const error = new Error("injected rename EACCES");
              error.code = "EACCES";
              throw error;
            }
            return rename(...args);
          },
        } : {}),
        ...(parsed.fault === "mkdir-eacces" ? {
          mkdir: async (..._args) => {
            const error = new Error("injected mkdir EACCES");
            error.code = "EACCES";
            throw error;
          },
        } : {}),
      },
      ...(parsed.fault === "rollback-rm-eacces" ? {
        removeDir: async () => {
            const error = new Error("injected rollback rm EACCES");
            error.code = "EACCES";
            throw error;
        },
      } : {}),
      ...(rollbackFault || partialLoadFault ? {
        beforeLoad: async () => {
          markRestoreLoadEntered();
          if (partialLoadFault) {
            // Simulate a loader that already consumed disk space inside the
            // freshly-created replacement folder before ENOSPC is reported.
            await mkdir(parsed.dir, { recursive: true });
            await writeFile(join(parsed.dir, "partial-restore-marker"), "synthetic partial restore");
            const error = new Error("injected restore load ENOSPC after partial write");
            error.code = "ENOSPC";
            throw error;
          }
          if (parsed.waiter) await new Promise((resolve) => { releaseRestoreLoad = resolve; });
          throw new Error("injected restore load failure");
        },
      } : {}),
    } : undefined);
    const { ensureDbReady, getSql, replacePgliteFromDump } = await vite.ssrLoadModule("/src/lib/db.server.ts");
    // db.ts starts its production bootstrap eagerly. Wait for that same
    // migration promise before replacePgliteFromDump renames the data dir;
    // otherwise bootstrap can race the rename and lose silvia.lock.
    await ensureDbReady();
    if (parsed.action === "bootstrap") {
      process.exitCode = 0;
      return;
    }
    const bytes = await readFile(parsed.dump);
    if (parsed.waiter) {
      const restore = replacePgliteFromDump(new Blob([bytes], { type: "application/gzip" }));
      await restoreLoadEntered;
      const waiting = getSql();
      releaseRestoreLoad();
      const [restoreResult, waitingResult] = await Promise.allSettled([restore, waiting]);
      assert.equal(restoreResult.status, "rejected");
      assert.equal(waitingResult.status, "rejected");
      await assert.rejects(getSql(), /nicht sicher wiederhergestellt/i);
    } else {
      await replacePgliteFromDump(new Blob([bytes], { type: "application/gzip" }));
      const { parsePgliteLock, pgliteLockPath } = await vite.ssrLoadModule("/src/lib/pglite-lock.ts");
      const rawLock = await readFile(pgliteLockPath(parsed.dir), "utf8");
      assert.equal(parsePgliteLock(rawLock)?.pid, process.pid, "Restore hält keinen eigenen Schreiblock.");
    }
    if (parsed.verifyFacts) {
      const { rememberPracticeFactAtomically } = await vite.ssrLoadModule("/src/lib/practice/facts-create.ts");
      const { replaceFactAtomically } = await vite.ssrLoadModule("/src/lib/practice/facts-replace.ts");
      const sql = await getSql();
      const practiceId = "praxis-01";
      const sourceId = "restore-fact-source";
      const duplicateId = "restore-fact-retry";
      const created = await rememberPracticeFactAtomically(sql, practiceId, "Restore-Fact Quelle", sourceId);
      const retried = await rememberPracticeFactAtomically(sql, practiceId, "Restore-Fact Quelle", duplicateId);
      assert.equal(created.ok, true, "Produktiver Fact-Create konnte nach Restore nicht schreiben.");
      assert.equal(created.duplicate, false, "Produktiver Fact-Create meldete den Erstaufruf als Duplikat.");
      assert.deepEqual(retried, { ok: true, id: sourceId, fact: "Restore-Fact Quelle", duplicate: true }, "Fact-Create Retry verwendet nicht die bestehende ID.");
      const mergeTarget = await rememberPracticeFactAtomically(sql, practiceId, "Restore-Fact Ziel", "restore-fact-target");
      assert.equal(mergeTarget.ok, true, "Produktiver Fact-Create konnte den Merge-Kandidaten nicht anlegen.");
      const merged = await replaceFactAtomically(sql, sourceId, practiceId, "Restore-Fact Ziel");
      assert.deepEqual(merged, { id: sourceId, fact: "Restore-Fact Ziel", duplicate: true }, "Produktiver Fact-Replace hat Quelle/Ziel nicht zusammengeführt.");
      const rows = await sql.query("select id, fact from practice_facts where practice_id = $1 order by id", [practiceId]);
      assert.equal(rows.some((row) => row.id === sourceId && row.fact === "Restore-Fact Ziel"), true, "Quell-ID blieb beim Merge nicht erhalten.");
      assert.equal(rows.some((row) => row.id === "restore-fact-target"), false, "Doppeltes Zielfakt wurde nicht entfernt.");
      console.log(JSON.stringify({ factsVerified: true, createRetryId: retried.id, mergeSourceId: merged.id }));
    }
    process.exitCode = 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
  } finally {
    try {
      const restoreTest = await vite.ssrLoadModule("/src/lib/pglite-restore-fs.ts");
      console.error(`[restore-audit] loadStarts=${restoreTest.pgliteRestoreLoadStartsForTest()}`);
    } catch {
      // Preserve the primary worker error.
    }
    // The app's long-lived maintenance timers are irrelevant to this one-shot
    // worker; do not let them keep the parent test blocked after restore.
    void vite.close().catch(() => undefined);
  }
}

await main();
// Vite's SSR server may leave application timers (retention schedule) alive;
// this is a one-shot maintenance worker, so return its explicit result.
process.exit(process.exitCode ?? 0);
