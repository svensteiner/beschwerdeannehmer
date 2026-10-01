#!/usr/bin/env node
/** Read-only Firebird schema audit against the configured Vquadrat test copy. */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const Firebird = require("C:\\silvia-connector\\node_modules\\node-firebird");
const root = "C:\\silvia-connector-test";
const parseEnv = (raw) => Object.fromEntries(raw.replace(/^\uFEFF/, "").split(/\r?\n/).flatMap((line) => { const i = line.indexOf("="); return i > 0 ? [[line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]] : []; }));
const query = (db, sql, params = []) => new Promise((resolve, reject) => db.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
const attach = (opts) => new Promise((resolve, reject) => Firebird.attach(opts, (err, db) => err ? reject(err) : resolve(db)));
const typeName = (f) => { const len = f.CHAR_LEN ?? f.FIELD_LENGTH; return ({7:"SMALLINT",8:"INTEGER",9:"QUAD",10:"FLOAT",12:"DATE",13:"TIME",27:"DOUBLE PRECISION",35:"TIMESTAMP",261:"BLOB"}[f.FIELD_TYPE] ?? (f.FIELD_TYPE === 14 ? `CHAR(${len})` : f.FIELD_TYPE === 16 ? (f.FIELD_SUB_TYPE ? `NUMERIC/DECIMAL(${len})` : "BIGINT") : f.FIELD_TYPE === 37 ? `VARCHAR(${len})` : `UNKNOWN(${f.FIELD_TYPE})`)); };
const tableExists = async (db, name) => (await query(db, "SELECT 1 FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = ?", [name])).length > 0;
const columns = async (db, name) => query(db, `SELECT rf.RDB$FIELD_NAME AS NAME, f.RDB$FIELD_TYPE AS FIELD_TYPE, f.RDB$FIELD_SUB_TYPE AS FIELD_SUB_TYPE, f.RDB$FIELD_LENGTH AS FIELD_LENGTH, f.RDB$CHARACTER_LENGTH AS CHAR_LEN FROM RDB$RELATION_FIELDS rf JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME WHERE rf.RDB$RELATION_NAME = ? ORDER BY rf.RDB$FIELD_POSITION`, [name]);
const main = async () => {
  const env = parseEnv(await readFile(path.join(root, ".env"), "utf8"));
  const config = JSON.parse((await readFile(path.join(root, "connector.json"), "utf8")).replace(/^\uFEFF/, ""));
  if (config.adapter !== "vquadrat" || config.options?.testDatabase !== true) throw new Error("Testkonfiguration ist nicht vquadrat/testDatabase=true.");
  if (!["127.0.0.1", "localhost", "::1"].includes(env.FIREBIRD_HOST || "127.0.0.1")) throw new Error("local_test_database_required");
  if (!env.FIREBIRD_TEST_DATABASE || path.resolve(env.FIREBIRD_TEST_DATABASE).toLowerCase() !== "c:\\silvia-connector\\test\\daten_test.fdb") throw new Error("unexpected_test_database");
  const db = await attach({ host: env.FIREBIRD_HOST || "127.0.0.1", port: Number(env.FIREBIRD_PORT || 3050), database: env.FIREBIRD_TEST_DATABASE, user: env.FIREBIRD_USER, password: env.FIREBIRD_PASSWORD, lowercase_keys: false, role: null, pageSize: 4096, encoding: "ISO8859_1" });
  try {
    const expected = JSON.parse(await readFile("C:\\silvia-connector\\pruefen\\erwartetes-schema.json", "utf8"));
    const result = { connected: true, testCopy: true, tables: {}, totals: { tables: 0, compatible: 0 } };
    await query(db, "SELECT 1 FROM RDB$DATABASE");
    for (const [name, spec] of Object.entries(expected.tables)) {
      const exists = await tableExists(db, name); let mismatches = [];
      if (!exists) mismatches.push("missing_table");
      else {
        const actual = new Map((await columns(db, name)).map((f) => [String(f.NAME).trim(), typeName(f)]));
        for (const [col, typ] of Object.entries(spec.columns)) { if (!actual.has(col)) mismatches.push(`missing_column:${col}`); else if (actual.get(col) !== typ) mismatches.push(`type:${col}`); }
      }
      result.tables[name] = { exists, expectedColumns: Object.keys(spec.columns).length, mismatches };
      result.totals.tables += 1; if (mismatches.length === 0) result.totals.compatible += 1;
    }
    const compatible = result.totals.tables === result.totals.compatible;
    console.log(JSON.stringify({ ok: compatible, connected: true, testCopy: true, compatibleTables: result.totals.compatible, totalTables: result.totals.tables, tables: result.tables }, null, 2));
    process.exitCode = compatible ? 0 : 1;
  } finally { await new Promise((resolve) => db.detach(resolve)); }
};
const timeout = setTimeout(() => { console.error(JSON.stringify({ ok: false, error: "timeout" })); process.exit(2); }, 30_000);
main().catch(() => { console.error(JSON.stringify({ ok: false, error: "read_only_audit_failed" })); process.exitCode = 1; }).finally(() => clearTimeout(timeout));
