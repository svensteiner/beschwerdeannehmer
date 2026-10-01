#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

// This is intentionally a static check: it never starts Vite, the app server, or an API.
const FORBIDDEN = [
  { label: "node:crypto", pattern: /node:crypto/gi },
  { label: "node:fs", pattern: /node:fs(?:\/promises)?/gi },
  { label: "@electric-sql/pglite", pattern: /@electric-sql[\\/]pglite/gi },
  { label: "Vite externalisation stub", pattern: /__vite-browser-external|vite-browser-external/gi },
];
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".html", ".map", ".json"]);

function usage() {
  console.error("usage: client-bundle-audit.mjs --client-dir <dir> [--public-dir <dir>] [--ssr-dir <dir>]");
  process.exitCode = 2;
}

function parseArgs() {
  const result = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!["--client-dir", "--public-dir", "--ssr-dir"].includes(arg)) return null;
    result[arg.slice(2)] = process.argv[++i];
  }
  return result;
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function scan(label, directory, enforce) {
  const root = resolve(directory);
  const files = await filesUnder(root);
  const findings = [];
  for (const file of files) {
    const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const text = await readFile(file, "utf8");
    for (const forbidden of FORBIDDEN) {
      if (forbidden.pattern.test(text)) findings.push({ file: relative(root, file), label: forbidden.label });
      forbidden.pattern.lastIndex = 0;
    }
  }
  const scope = enforce ? "client/public" : "SSR (informational)";
  for (const finding of findings) console.log(`${enforce ? "FAIL" : "INFO"} ${scope}: ${finding.label} in ${finding.file}`);
  return enforce ? findings : [];
}

const args = parseArgs();
if (!args?.["client-dir"]) {
  usage();
} else {
  try {
    const clientFindings = await scan("client", args["client-dir"], true);
    let publicFindings = [];
    if (args["public-dir"]) publicFindings = await scan("public", args["public-dir"], true);
    if (args["ssr-dir"]) await scan("ssr", args["ssr-dir"], false);
    const total = clientFindings.length + publicFindings.length;
    if (total) {
      console.error(`Client-Bundle-Audit fehlgeschlagen: ${total} Fundstelle(n).`);
      process.exitCode = 1;
    } else {
      console.log("Client-Bundle-Audit bestanden: Client/Public-Ausgaben enthalten keine verbotenen Server-Abhängigkeiten.");
    }
  } catch (error) {
    console.error(`Client-Bundle-Audit konnte nicht ausgeführt werden: ${error.message}`);
    process.exitCode = 2;
  }
}
