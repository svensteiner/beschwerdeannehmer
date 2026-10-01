import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { rememberPracticeFactAtomically } from "../src/lib/practice/facts-create.ts";
import { replaceFactGuarded } from "../src/lib/practice/facts-replace.ts";
import { safeLocalPostgresAuditUrl } from "./postgres-audit-safety.mjs";

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = [
  "0001_silvia.sql",
  "0004_practice_facts.sql",
  "0017_practice_fact_create_atomic.sql",
  "0018_practice_fact_merge_atomic.sql",
  "0021_practice_fact_replace_guard.sql",
] as const;
const LOCK_PROOF_MS = 150;

type FactSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

function factSql(
  client: InstanceType<typeof Client>,
  onQuery?: () => void,
): FactSql {
  let signalled = false;
  return {
    async query<T = Record<string, unknown>>(
      text: string,
      params?: unknown[],
    ): Promise<T[]> {
      if (!signalled) {
        signalled = true;
        onQuery?.();
      }
      const result = await client.query(text, params);
      return result.rows as T[];
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function assertStillPending(
  promise: Promise<unknown>,
  description: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    new Promise<"pending">((resolve) => {
      timeout = setTimeout(() => resolve("pending"), LOCK_PROOF_MS);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  assert.equal(result, "pending", `${description} war nicht an der PostgreSQL-Sperre blockiert.`);
}

async function runScenario(connectionString: string) {
  const schema = `facts_audit_${randomUUID().replaceAll("-", "")}`;
  const practiceId = `facts-audit-${randomUUID()}`;
  const primary = new Client({ connectionString });
  const secondary = new Client({ connectionString });
  let schemaCreated = false;
  let transactionOpen = false;

  try {
    await Promise.all([primary.connect(), secondary.connect()]);
    await primary.query(`create schema "${schema}"`);
    schemaCreated = true;
    await Promise.all([
      primary.query(`set search_path to "${schema}"`),
      secondary.query(`set search_path to "${schema}"`),
    ]);
    for (const migration of MIGRATIONS) {
      await primary.query(
        await readFile(join(PROJECT_ROOT, "migrations", migration), "utf8"),
      );
    }
    await primary.query(
      "insert into practices (id, name, owner_name, email) values ($1, 'Audit', 'Audit', 'audit@example.invalid')",
      [practiceId],
    );
    await primary.query(
      `insert into practice_facts (id, practice_id, fact)
       select $1 || '-seed-' || n, $1, 'Audit-Regel ' || n || ': nur Testdaten.'
       from generate_series(1, 39) as n`,
      [practiceId],
    );

    // A real first connection retains the practice lock while the second
    // product call reaches an independent PostgreSQL boundary.
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [
      practiceId,
    ]);
    const first = await rememberPracticeFactAtomically(
      factSql(primary),
      practiceId,
      "Audit-Zusatzregel eins: nur Testdaten.",
      `${practiceId}-first`,
    );
    const secondReachedSql = deferred();
    const second = rememberPracticeFactAtomically(
      factSql(secondary, secondReachedSql.resolve),
      practiceId,
      "Audit-Zusatzregel zwei: nur Testdaten.",
      `${practiceId}-second`,
    );
    await secondReachedSql.promise;
    await assertStillPending(second, "Zweite Faktenanlage");
    await primary.query("commit");
    transactionOpen = false;
    const secondResult = await second;

    assert(first.ok && !first.duplicate, "Erste Faktenanlage muss den letzten Platz belegen.");
    assert(!secondResult.ok && secondResult.error.includes("Vierzig Hinweise"), "Zweite Faktenanlage muss an der 40er-Grenze scheitern.");
    const [countRows] = await primary.query<{ count: number }>(
      "select count(*)::int as count from practice_facts where practice_id = $1",
      [practiceId],
    );
    assert.equal(countRows.count, 40, "Die Faktenobergrenze darf nicht überschritten werden.");
    const duplicate = await rememberPracticeFactAtomically(
      factSql(secondary),
      practiceId,
      "Audit-Regel 1: nur Testdaten.",
      `${practiceId}-duplicate`,
    );
    assert(duplicate.ok && duplicate.duplicate, "Ein vorhandener Hinweis muss auch am Limit wiederholbar sein.");

    const expectedFact = "Audit-Regel 2: nur Testdaten.";
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [
      practiceId,
    ]);
    const firstUpdate = await replaceFactGuarded(
      factSql(primary),
      `${practiceId}-seed-2`,
      practiceId,
      "Audit-Änderung A: nur Testdaten.",
      expectedFact,
    );
    const secondUpdateReachedSql = deferred();
    const secondUpdate = replaceFactGuarded(
      factSql(secondary, secondUpdateReachedSql.resolve),
      `${practiceId}-seed-2`,
      practiceId,
      "Audit-Änderung B: nur Testdaten.",
      expectedFact,
    );
    await secondUpdateReachedSql.promise;
    await assertStillPending(secondUpdate, "Zweite Faktenänderung");
    await primary.query("commit");
    transactionOpen = false;
    const updates = [firstUpdate, await secondUpdate];
    assert(updates.every(Boolean), "Beide parallelen Faktenänderungen müssen eine Quellzeile sehen.");
    const settled = updates.filter((row): row is NonNullable<typeof row> => Boolean(row));
    assert.equal(settled.filter((row) => !row.conflict).length, 1, "Genau eine Faktenänderung darf gewinnen.");
    assert.equal(settled.filter((row) => row.conflict).length, 1, "Die zweite Faktenänderung muss als Konflikt zurückkommen.");
    const [source] = await primary.query<{ id: string; fact: string }>(
      "select id, fact from practice_facts where id = $1 and practice_id = $2",
      [`${practiceId}-seed-2`, practiceId],
    );
    assert.equal(source.id, `${practiceId}-seed-2`, "Die Fakten-Quell-ID muss erhalten bleiben.");
    assert(["Audit-Änderung A: nur Testdaten.", "Audit-Änderung B: nur Testdaten."].includes(source.fact), "Die Faktenänderung fehlt.");
  } finally {
    if (transactionOpen) await primary.query("rollback").catch(() => {});
    await Promise.allSettled([primary.end(), secondary.end()]);
    if (schemaCreated) {
      const cleanup = new Client({ connectionString });
      try {
        await cleanup.connect();
        await cleanup.query(`drop schema if exists "${schema}" cascade`);
      } finally {
        await cleanup.end().catch(() => {});
      }
    }
  }
}

const rawUrl = process.env.FACTS_AUDIT_DATABASE_URL;
const connectionString = safeLocalPostgresAuditUrl(rawUrl);
const required = process.env.FACTS_AUDIT_REQUIRED === "1";

if (!rawUrl) {
  const message = "FACTS_AUDIT_DATABASE_URL fehlt; keine Datenbank wurde kontaktiert.";
  if (required) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`SKIP: ${message}`);
  }
} else if (!connectionString) {
  console.error(
    "REFUSE: Nur lokale PostgreSQL-Testdatenbanken silvia_audit_* sind erlaubt.",
  );
  process.exitCode = 1;
} else {
  try {
    await runScenario(connectionString);
    console.log(
      "PASS: PostgreSQL-Praxiswissen parallel, 40er-Grenze und Konflikt geprüft.",
    );
  } catch (error) {
    console.error(
      `FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
