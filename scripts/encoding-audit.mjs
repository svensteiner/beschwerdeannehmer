// Durchsucht den Quellbaum nach Latin-1-kodierten Umlauten und Ersatzzeichen.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const roots = ["src", "scripts", "tests", "docs", "public"];
const exts = new Set([".ts", ".tsx", ".mjs", ".mts", ".md", ".json", ".css", ".html"]);
const skipDirs = new Set(["node_modules", ".git", ".output", "artifacts", "test-results", ".silvia-data"]);

const PAIRS = /[\u00C2-\u00C3][\u0080-\u00BF]/g;
const broken = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!exts.has(extname(entry.name))) continue;
    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const pairs = (text.match(PAIRS) ?? []).length;
    const repl = (text.match(/\uFFFD/g) ?? []).length;
    if (pairs > 0 || repl > 0) broken.push({ file: full, pairs, repl });
  }
}

for (const root of roots) {
  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch {
    /* fehlt */
  }
}

broken.sort((a, b) => b.pairs + b.repl - (a.pairs + a.repl));
console.log(`Geprueft: ${roots.join(", ")}`);
console.log(`Betroffene Dateien: ${broken.length}`);
for (const item of broken) {
  console.log(`  ${item.file}  latin1-Paare:${item.pairs}  ersatz:${item.repl}`);
}
process.exitCode = broken.length === 0 ? 0 : 1;
