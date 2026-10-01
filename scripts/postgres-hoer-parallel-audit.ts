import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  importLegacyHoerKorrekturen,
  saveHoerKorrektur,
} from "../src/lib/alma/hoer-log.ts";
import { safeLocalPostgresAuditUrl } from "./postgres-audit-safety.mjs";

const { Client } = pg;
const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = [
  "0001_silvia.sql",
  "0015_hoer_korrekturen.sql",
  "0016_hoer_korrektur_request_id.sql",
  "0019_hoer_korrektur_atomic.sql",
  "0022_hoer_legacy_cap.sql",
] as const;
const LEGACY_SOURCE_KEY = "silvia-hoer-korrekturen.jsonl:v1";
const LOCK_PROOF_MS = 150;

type HoerSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

function hoerSql(
  client: InstanceType<typeof Client>,
  onQuery?: () => void,
): HoerSql {
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
  if (result !== "pending") {
    throw new Error(
      `${description} war nicht an der PostgreSQL-Sperre blockiert.`,
    );
  }
}

async function runScenario(connectionString: string, importFirst: boolean) {
  const schema = `hoer_audit_${randomUUID().replaceAll("-", "")}`;
  const practiceA = `audit-a-${randomUUID()}`;
  const practiceB = `audit-b-${randomUUID()}`;
  const primary = new Client({ connectionString });
  const secondary = new Client({ connectionString });
  let fixtureDir: string | undefined;
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
      `insert into practices (id, name, owner_name, email)
       values ($1, 'Audit A', 'Audit', 'audit-a@example.invalid'),
              ($2, 'Audit B', 'Audit', 'audit-b@example.invalid')`,
      [practiceA, practiceB],
    );
    await primary.query(
      `insert into hoer_corrections (id, practice_id, heard, corrected, created_at, legacy_key)
       select $1 || '-seed-' || n, $1, 'heard-' || n, 'corrected-' || n, now(), $1 || '-legacy-' || n
       from generate_series(1, 1999) as n`,
      [practiceA],
    );

    fixtureDir = await mkdtemp(join(tmpdir(), "silvia-hoer-postgres-audit-"));
    const legacyPath = join(fixtureDir, "silvia-hoer-korrekturen.jsonl");
    const legacyLine = JSON.stringify({
      ts: "2026-09-14T09:00:00.000Z",
      heard: "Röntgen",
      corrected: "Röntgenbild",
      practiceId: practiceA,
    });
    await writeFile(legacyPath, `${legacyLine}\n`, "utf8");
    const sourceBefore = await readFile(legacyPath, "utf8");

    // The row lock stays held on the first real PostgreSQL connection while
    // the second product call reaches its own SQL boundary.
    await primary.query("begin");
    transactionOpen = true;
    await primary.query("select id from practices where id = $1 for update", [
      practiceA,
    ]);

    const firstSql = hoerSql(primary);
    const secondReachedSql = deferred();
    const secondSql = hoerSql(secondary, secondReachedSql.resolve);
    const saveEntry = {
      ts: "2026-09-14T09:01:00.000Z",
      heard: "Rontgen",
      corrected: "Röntgen",
      practiceId: practiceA,
      requestId: randomUUID(),
    };

    const first = importFirst
      ? importLegacyHoerKorrekturen(firstSql, legacyPath)
      : saveHoerKorrektur(firstSql, saveEntry);
    const firstResult = await first;

    const second = importFirst
      ? saveHoerKorrektur(secondSql, { ...saveEntry, requestId: randomUUID() })
      : importLegacyHoerKorrekturen(secondSql, legacyPath);
    await secondReachedSql.promise;
    await assertStillPending(second, importFirst ? "Speichern" : "Import");

    await primary.query("commit");
    transactionOpen = false;

    if (importFirst) {
      const secondResult = await second;
      if (firstResult !== 1 || secondResult !== false) {
        throw new Error(
          "Import-zuerst lieferte nicht 1 Import und ein abgelehntes Speichern.",
        );
      }
    } else {
      if (firstResult !== true) {
        throw new Error("Speichern-zuerst wurde unerwartet abgelehnt.");
      }
      const outcome = await second.then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason }),
      );
      const message =
        outcome.status === "rejected"
          ? outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason)
          : "";
      if (
        outcome.status !== "rejected" ||
        !message.includes("Grenze von 2000")
      ) {
        throw new Error(
          "Speichern-zuerst ließ keinen atomar abgelehnten Überlauf erkennen.",
        );
      }
    }

    const [countRows, markerRows, practiceBRows] = await Promise.all([
      primary.query<{ count: number }>(
        "select count(*)::int as count from hoer_corrections where practice_id = $1",
        [practiceA],
      ),
      primary.query<{ count: number }>(
        "select count(*)::int as count from hoer_legacy_imports where source_key = $1",
        [LEGACY_SOURCE_KEY],
      ),
      primary.query<{ count: number }>(
        "select count(*)::int as count from hoer_corrections where practice_id = $1",
        [practiceB],
      ),
    ]);
    const markerCount = markerRows.rows[0]?.count ?? 0;
    if (
      countRows.rows[0]?.count !== 2000 ||
      practiceBRows.rows[0]?.count !== 0 ||
      markerCount !== (importFirst ? 1 : 0) ||
      (await readFile(legacyPath, "utf8")) !== sourceBefore
    ) {
      throw new Error(
        "Cap, Import-Marker, Praxis-Trennung oder Quelldatei ist nicht korrekt.",
      );
    }
  } finally {
    if (transactionOpen) await primary.query("rollback").catch(() => {});
    await Promise.allSettled([primary.end(), secondary.end()]);
    if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });

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

const rawUrl = process.env.HOER_AUDIT_DATABASE_URL;
const connectionString = safeLocalPostgresAuditUrl(rawUrl);
const required = process.env.HOER_AUDIT_REQUIRED === "1";

if (!rawUrl) {
  const message = "HOER_AUDIT_DATABASE_URL fehlt; keine Datenbank wurde kontaktiert.";
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
    await runScenario(connectionString, true);
    await runScenario(connectionString, false);
    console.log(
      "PASS: PostgreSQL-Hörkorrekturen parallel, Cap, Marker und Praxis-Trennung geprüft.",
    );
  } catch (error) {
    console.error(
      `FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
