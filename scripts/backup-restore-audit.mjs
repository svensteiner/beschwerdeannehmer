#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { dumpPgliteAfterCheckpoint } from "../src/lib/pglite-copy-gate.ts";

const PORTABLE_NOW = "2026-09-11T09:00:00.000Z";
const RESTORE_WORKER = join(process.cwd(), "scripts", "backup-restore-subprocess.mjs");

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, toPlain(v)]),
    );
  }
  return value;
}

async function applyMigrations(db, beforeName) {
  const entries = await readdir(join(process.cwd(), "migrations"), { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("auth"))
    .filter((name) => !beforeName || name.localeCompare(beforeName) < 0)
    .sort();
  for (const file of files) {
    const sql = await readFile(join(process.cwd(), "migrations", file), "utf8");
    await db.exec(sql);
  }
}

async function seedSource(db) {
  await db.exec(`insert into practices (id, name, owner_name, email) values ('praxis-01', 'Praxis Anton', 'Anton Praxis', 'anton@example.test');`);
  await db.exec(`insert into practice_facts (id, practice_id, fact) values ('fact-01', 'praxis-01', 'Fact: Impfungen nach Plan prüfen.');`);
  await db.exec(`insert into appointments (id, practice_id, start_at, owner_name, pet, kind)
               values ('term-01', 'praxis-01', timestamptz '${PORTABLE_NOW}', 'Anna', 'Mila', 'Kontrolle');`);
  await db.exec(`insert into hoer_corrections (id, practice_id, heard, corrected, created_at)
               values ('hoer-01', 'praxis-01', 'Rontgen', 'Röntgen', timestamptz '${PORTABLE_NOW}');`);
}

async function seedRestoreTarget(db) {
  await db.exec(`insert into practices (id, name, owner_name, email) values ('praxis-keep', 'Praxis Alt', 'Keep Owner', 'keep@example.test');`);
  await db.exec(`insert into practice_facts (id, practice_id, fact) values ('fact-keep', 'praxis-keep', 'This row belongs to the target baseline.');`);
  await db.exec(`insert into appointments (id, practice_id, start_at, owner_name, pet, kind)
               values ('term-keep', 'praxis-keep', timestamptz '2026-01-01T08:00:00.000Z', 'Legacy', 'Bruno', 'Kontrolle');`);
  await db.exec(`insert into hoer_corrections (id, practice_id, heard, corrected, created_at)
               values ('hoer-keep', 'praxis-keep', 'Alt', 'Fremd', timestamptz '2026-01-01T08:00:00.000Z');`);
}

async function snapshot(db) {
  const [practices, facts, appointments, corrections] = await Promise.all([
    db.query("select id, name, owner_name, email from practices order by id"),
    db.query("select id, practice_id, fact from practice_facts order by id"),
    db.query("select id, practice_id, owner_name, pet, kind, start_at from appointments order by id"),
    db.query("select id, practice_id, heard, corrected, created_at from hoer_corrections order by id"),
  ]);
  return {
    practices: practices.rows.map((row) => toPlain(row)),
    facts: facts.rows.map((row) => toPlain(row)),
    appointments: appointments.rows.map((row) => toPlain(row)),
    corrections: corrections.rows.map((row) => toPlain(row)),
  };
}

async function restoreDbFromDump(dir, dump, root, { fault, waiter, verifyFacts = false } = {}) {
  const dumpPath = join(root, "restore-input.dump.bin");
  await writeFile(dumpPath, Buffer.from(dump));
  const args = [
    "node_modules/tsx/dist/cli.mjs",
    RESTORE_WORKER,
    "--action",
    "restore",
    "--dir",
    dir,
    "--dump",
    dumpPath,
  ];
  if (fault) args.push("--fault", fault);
  if (waiter) args.push("--waiter");
  if (verifyFacts) args.push("--verify-facts");
  try {
    const stdout = execFileSync(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, error: "", stdout };
  } catch (error) {
    const output = error && typeof error === "object"
      ? `${error.stdout ?? ""}\n${error.stderr ?? ""}`
      : String(error);
    return { ok: false, error: output };
  } finally {
    await rm(dumpPath, { force: true });
  }
}

async function bootstrapDb(dir) {
  try {
    execFileSync(process.execPath, [
      "node_modules/tsx/dist/cli.mjs",
      RESTORE_WORKER,
      "--action",
      "bootstrap",
      "--dir",
      dir,
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 60_000,
    });
    return { ok: true, error: "" };
  } catch (error) {
    const output = error && typeof error === "object"
      ? `${error.stdout ?? ""}\n${error.stderr ?? ""}`
      : String(error);
    return { ok: false, error: output };
  }
}

async function run() {
  const root = await mkdtemp(join(tmpdir(), "silvia-backup-audit-"));
  const sourceDir = join(root, "source");
  const targetDir = join(root, "target");
  let source;
  let target;
  let failures = 0;
  try {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });

    source = new PGlite({ dataDir: sourceDir });
    await source.waitReady;
    await applyMigrations(source);
    await seedSource(source);

    const rawDump = await dumpPgliteAfterCheckpoint(source, sourceDir);
    assert.equal(rawDump.size > 32, true, "Ein Dump ist unerwartet zu klein.");
    const backup = new Uint8Array(await rawDump.arrayBuffer());
    assert.equal(backup[0], 0x1f, "Backup ist kein GZIP-Stream.");
    assert.equal(backup[1], 0x8b, "Backup ist kein GZIP-Stream.");

    const sourceSnapshot = await snapshot(source);
    const sourceRows = JSON.parse(JSON.stringify(sourceSnapshot));

    await source.close();
    source = undefined;

    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    await applyMigrations(target);
    await seedRestoreTarget(target);

    const targetSnapshotBefore = await snapshot(target);
    await target.close();
    target = undefined;

    const renameDenied = await restoreDbFromDump(targetDir, backup, root, { fault: "rename-eacces" });
    assert.equal(renameDenied.ok, false, "Restore trotz verweigertem Umbenennen akzeptiert.");
    assert.match(renameDenied.error, /injected rename EACCES/i);
    assert.match(renameDenied.error, /loadStarts=0/);
    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    assert.deepEqual(JSON.stringify(await snapshot(target)), JSON.stringify(targetSnapshotBefore), "Verweigertes Umbenennen hat Ziel-Daten verändert.");
    await target.close();
    target = undefined;

    const mkdirDenied = await restoreDbFromDump(targetDir, backup, root, { fault: "mkdir-eacces" });
    assert.equal(mkdirDenied.ok, false, "Restore trotz verweigertem Anlegen akzeptiert.");
    assert.match(mkdirDenied.error, /injected mkdir EACCES/i);
    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    assert.deepEqual(JSON.stringify(await snapshot(target)), JSON.stringify(targetSnapshotBefore), "Verweigertes Anlegen hat die alte Tafel nicht wiederhergestellt.");
    await target.close();
    target = undefined;

    const previousSentinel = `${targetDir}.prev`;
    await mkdir(previousSentinel, { recursive: true });
    await writeFile(join(previousSentinel, "sentinel"), "keep");
    const blockedByPrevious = await restoreDbFromDump(targetDir, backup, root);
    assert.equal(blockedByPrevious.ok, false, "Restore trotz vorhandener .prev-Sicherung akzeptiert.");
    assert.match(blockedByPrevious.error, /frühere Tafel-Sicherung/i);
    assert.equal(await readFile(join(previousSentinel, "sentinel"), "utf8"), "keep");
    await rm(previousSentinel, { recursive: true, force: true });

    const damaged = new Uint8Array(backup);
    // Preserve the magic bytes: the real upload boundary already checks them.
    // A broken trailer proves the full gzip stream is validated before PGLite.
    damaged[damaged.length - 1] = damaged[damaged.length - 1] ^ 0xff;

    const corrupted = await restoreDbFromDump(targetDir, damaged, root);
    assert.equal(corrupted.ok, false, "Beschädigtes Backup wurde unerwartet akzeptiert.");
    assert.match(corrupted.error, /beschädigt oder keine gültige gzip-datei/i, "Kein fachlicher GZIP-Fehler gemeldet.");
    assert.match(corrupted.error, /loadStarts=0/, "PGLite wurde trotz beschädigter Sicherung gestartet.");

    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    const afterCorrupted = await snapshot(target);
    assert.deepEqual(
      JSON.stringify(afterCorrupted),
      JSON.stringify(targetSnapshotBefore),
      "Beschädigtes Backup hat Ziel-Daten verändert.",
    );
    await target.close();
    target = undefined;

    const partialLoadDenied = await restoreDbFromDump(targetDir, backup, root, { fault: "load-enospc-partial" });
    assert.equal(partialLoadDenied.ok, false, "Teilweiser Restore trotz ENOSPC akzeptiert.");
    assert.match(partialLoadDenied.error, /injected restore load ENOSPC/i);
    assert.match(partialLoadDenied.error, /loadStarts=1/);
    assert.equal(
      await readFile(join(targetDir, "partial-restore-marker"), "utf8").then(() => true).catch(() => false),
      false,
      "Teilweiser Restore-Rest liegt noch im wiederhergestellten Zielordner.",
    );
    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    assert.deepEqual(
      JSON.stringify(await snapshot(target)),
      JSON.stringify(targetSnapshotBefore),
      "ENOSPC nach teilweisem Restore-Schreiben hat die alte Zieltafel verändert.",
    );
    await target.close();
    target = undefined;

    for (const fault of ["rollback-rm-eacces", "rollback-rename-eacces"]) {
      const rollbackBlocked = await restoreDbFromDump(targetDir, backup, root, { fault, waiter: true });
      assert.equal(rollbackBlocked.ok, true, `Wartende Zugriffe wurden bei ${fault} nicht sicher gesperrt: ${rollbackBlocked.error}`);
      assert.equal(await readFile(join(`${targetDir}.prev`, "PG_VERSION"), "utf8").then(() => true).catch(() => false), true, `Alte .prev-Tafel fehlt nach ${fault}.`);
      const restart = await bootstrapDb(targetDir);
      assert.equal(restart.ok, false, `Neustart hat bei ${fault} trotz .prev eine neue Tafel geöffnet.`);
      assert.match(restart.error, /frühere Tafel-Sicherung/i);
      await rm(targetDir, { recursive: true, force: true });
      await rename(`${targetDir}.prev`, targetDir);
      target = new PGlite({ dataDir: targetDir });
      await target.waitReady;
      assert.deepEqual(
        JSON.stringify(await snapshot(target)),
        JSON.stringify(targetSnapshotBefore),
        `Alte Tafel ist nach ${fault} nicht vollständig wiederherstellbar.`,
      );
      await target.close();
      target = undefined;
    }

    const restored = await restoreDbFromDump(targetDir, backup, root, { verifyFacts: true });
    assert.equal(restored.ok, true, `Korrektes Backup konnte nicht eingespielt werden: ${restored.error}`);
    assert.match(restored.stdout, /factsVerified.*createRetryId.*mergeSourceId/s, "Produktive Fact-Prüfung wurde im Restore-Worker nicht protokolliert.");

    target = new PGlite({ dataDir: targetDir });
    await target.waitReady;
    const afterRestore = await snapshot(target);
    const expectedAfterFactRestore = JSON.parse(JSON.stringify(sourceRows));
    expectedAfterFactRestore.facts.push({
      fact: "Restore-Fact Ziel",
      id: "restore-fact-source",
      practice_id: "praxis-01",
    });
    assert.deepEqual(
      JSON.stringify(afterRestore),
      JSON.stringify(expectedAfterFactRestore),
      "Wiederhergestellt entspricht nicht dem Original-Dump plus Produktions-Fact-Prüfung.",
    );

    const legacyDir = join(root, "legacy-source");
    const legacyTarget = join(root, "legacy-target");
    const legacy = new PGlite({ dataDir: legacyDir });
    await legacy.waitReady;
    await applyMigrations(legacy, "0015_");
    await legacy.exec("insert into practices (id, name, owner_name, email) values ('praxis-01', 'Alt', 'Alt', 'alt@example.test')");
    await legacy.exec("insert into practice_facts (id, practice_id, fact) values ('legacy-fact-01', 'praxis-01', 'Legacy-Hinweis bleibt erhalten.')");
    const legacyDump = new Uint8Array(await (await dumpPgliteAfterCheckpoint(legacy, legacyDir)).arrayBuffer());
    await legacy.close();
    const legacyRestored = await restoreDbFromDump(legacyTarget, legacyDump, root, { verifyFacts: true });
    assert.equal(legacyRestored.ok, true, `Altes Backup konnte nicht migriert werden: ${legacyRestored.error}`);
    assert.match(legacyRestored.stdout, /factsVerified.*createRetryId.*mergeSourceId/s, "Produktive Fact-Prüfung wurde beim Legacy-Restore nicht protokolliert.");
    const migratedLegacy = new PGlite({ dataDir: legacyTarget });
    await migratedLegacy.waitReady;
    const legacyPractice = await migratedLegacy.query("select id, name, owner_name, email from practices where id = 'praxis-01'");
    assert.deepEqual(legacyPractice.rows, [{ id: "praxis-01", name: "Alt", owner_name: "Alt", email: "alt@example.test" }], "Alte Praxis wurde beim Restore/Migrationslauf nicht erhalten.");
    const legacyFact = await migratedLegacy.query("select id, fact from practice_facts where id = 'legacy-fact-01'");
    assert.deepEqual(legacyFact.rows, [{ id: "legacy-fact-01", fact: "Legacy-Hinweis bleibt erhalten." }], "Altes Praxis-Fakt wurde beim Restore/Migrationslauf nicht erhalten.");
    const legacyCorrections = await migratedLegacy.query("select count(*)::int as count from hoer_corrections");
    assert.equal(legacyCorrections.rows[0].count, 0, "Altes Backup darf keine Ziel-Hörkorrekturen übernehmen.");
    await migratedLegacy.close();

    console.log(JSON.stringify({ ok: true }, null, 2));
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } finally {
    if (source?.closed === false) {
      await source.close();
    }
    if (target?.closed === false) {
      await target.close();
    }
    await rm(root, { recursive: true, force: true });
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

run();
