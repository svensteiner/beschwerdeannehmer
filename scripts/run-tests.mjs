#!/usr/bin/env node
// Windows-/Node-20-taugliche Test-Runner: kein Shell-Glob (bricht unter cmd.exe
// wegen der einfachen Anführungszeichen), kein --experimental-strip-types
// (existiert erst ab Node 22.6) — stattdessen tsx als Fallback für die
// TypeScript-Testdateien. Läuft unverändert auch unter Node 22+.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function findTests(dir, extensions, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) findTests(full, extensions, out);
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(full);
  }
  return out;
}

const scriptsTests = findTests(path.join(root, "scripts"), [".test.mjs"]).sort();
// Alle TypeScript-Tests im Quellbaum werden automatisch aufgenommen — auch
// `.test.tsx`, damit Komponententests nicht still fehlen.
const tsTests = findTests(path.join(root, "src"), [".test.ts", ".test.tsx"]).sort();

/** Jede entdeckte Datei, die auch wirklich gelaufen ist. */
const executed = new Set();

/**
 * Tests, die eine PGlite-Datenbank anlegen.
 *
 * PGlite ist ein WASM-Postgres: Jede Datei belegt Speicher ausserhalb des
 * JS-Heaps. Liefen alle 133 Dateien in einem Prozess, brach Node mitten im
 * Lauf mit "Zone Allocation failed" ab — dann fehlten Tests still, statt rot
 * zu werden, und die Gesamtzahl schwankte (738 bis 866).
 *
 * Die Datenbanktests laufen deshalb in einer eigenen Gruppe. Danach gibt der
 * Prozess den WASM-Speicher frei, und die uebrigen Tests laufen unbeeinflusst.
 */
function usesDatabase(file) {
  const source = readFileSync(file, "utf8");
  return /\bPGlite\b|pglite|\bgetSql\b|createPglite/.test(source);
}

function run(cmd, prefixArgs, files, extraEnv = {}) {
  if (files.length === 0) return;
  const res = spawnSync(cmd, [...prefixArgs, "--test", ...files], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, ...extraEnv },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
  for (const file of files) executed.add(file);
}

run(process.execPath, [], scriptsTests);

// tsx resolves TypeScript path aliases (for example @/...) and .tsx files;
// Node's native strip-types mode only strips syntax and cannot do either.
//
// Heap: `tsx` startet einen eigenen Kindprozess und reicht
// `--max-old-space-size` als Argument NICHT weiter. Der Wert muss ueber
// NODE_OPTIONS kommen, sonst behaelt der Kindprozess den Standard-Heap.
const tsxBin = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const heapOptions = {
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"].filter(Boolean).join(" "),
};

const dbTests = tsTests.filter(usesDatabase);
const plainTests = tsTests.filter((file) => !usesDatabase(file));
run(process.execPath, [tsxBin], plainTests, heapOptions);

// PGlite ist ein WASM-Postgres. Jede Testdatei belegt Speicher ausserhalb des
// JS-Heaps, und der wird zwischen Dateien im selben Prozess nicht zuverlaessig
// freigegeben. 23 Dateien in einer Gruppe erschöpften weiterhin die Zone.
// Deshalb laeuft jede Datenbankdatei in einem EIGENEN Prozess: danach ist der
// WASM-Speicher vollstaendig frei. Das kostet Startzeit, macht die Gesamtzahl
// aber reproduzierbar.
for (const file of dbTests) {
  run(process.execPath, [tsxBin], [file], heapOptions);
}

// Nachweis der Vollstaendigkeit: jede entdeckte Datei muss auch gelaufen sein.
// Die Aufteilung in Gruppen und eigene Prozesse darf keine Datei still
// verschlucken — sonst sinkt die Testzahl, ohne dass etwas rot wird.
const discovered = [...scriptsTests, ...tsTests];
const missing = discovered.filter((file) => !executed.has(file));
console.info("");
console.info(
  `[tests] entdeckt: ${discovered.length} Dateien ` +
    `(${scriptsTests.length} Skript-Tests, ${tsTests.length} Quellbaum-Tests)`,
);
console.info(`[tests] ausgefuehrt: ${executed.size} Dateien`);
if (missing.length > 0 || executed.size !== discovered.length) {
  console.error(`[tests] FEHLER: ${missing.length} Datei(en) wurden nicht ausgefuehrt:`);
  for (const file of missing) console.error(`  - ${path.relative(root, file)}`);
  process.exit(1);
}
console.info("[tests] vollstaendig: jede entdeckte Datei wurde ausgefuehrt.");
