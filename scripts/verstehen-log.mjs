#!/usr/bin/env node
/**
 * Trainingskorpus anzeigen (Owner-Wunsch: Silvia am Telefon trainieren).
 *
 * Druckt src/lib/alma/verstehen-log.ts' verstehen-log.jsonl (jede lokale
 * Antwort, die nur der generische Fallback oder "nicht verstanden" war) als
 * kompakte Tabelle, damit man echte Anrufe sieht, die verstehen.corpus.ts /
 * verstehen.ts / localReply (ask-alma.ts) noch nicht abdecken.
 *
 * Usage: npm run verstehen:log
 *        npm run verstehen:log -- --clear   (Datei leeren, nicht löschen)
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

// Gleiche Konvention wie verstehenLogPath() in src/lib/alma/verstehen-log.ts
// und resolvePgliteDataDir() in src/lib/pglite-data-dir.ts: SILVIA_DATA_DIR
// oder .silvia-data, cwd-relativ.
function verstehenLogPath(env = process.env) {
  const dir = (env.SILVIA_DATA_DIR?.trim() || ".silvia-data").replace(
    /[/\\]+$/,
    "",
  );
  return `${dir}/verstehen-log.jsonl`;
}

function truncate(text, max) {
  const flat = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

async function readEntries(path) {
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      /* kaputte Zeile überspringen */
    }
  }
  return out;
}

async function clearLog(path) {
  if (!existsSync(path)) {
    console.log(`[verstehen-log] nichts zu leeren, keine Datei: ${path}`);
    return;
  }
  await writeFile(path, "", "utf8");
  console.log(`[verstehen-log] geleert: ${path}`);
}

function printTable(entries, path) {
  if (!entries.length) {
    console.log(`[verstehen-log] leer oder nicht vorhanden: ${path}`);
    return;
  }
  const header = `${"ts".padEnd(22)}| ${"sagt".padEnd(60)}| antwort`;
  console.log(header);
  console.log("-".repeat(header.length + 40));
  for (const entry of entries) {
    console.log(
      `${String(entry.ts ?? "").padEnd(22)}| ${truncate(entry.sagt, 60).padEnd(60)}| ${truncate(entry.antwort, 60)}`,
    );
  }
  const distinct = new Set(
    entries.map((entry) => truncate(entry.sagt, 200).toLowerCase()),
  ).size;
  console.log("-".repeat(header.length + 40));
  console.log(
    `${entries.length} Zeilen, ${distinct} unterschiedliche Äußerungen. Datei: ${path}`,
  );
}

async function main() {
  const path = verstehenLogPath();
  if (process.argv.includes("--clear")) {
    await clearLog(path);
    return;
  }
  printTable(await readEntries(path), path);
}

main();
