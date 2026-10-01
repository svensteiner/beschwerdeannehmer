// AP 21 — Gesprächs-Eval. Läuft gegen den echten Stack (C:\silvia-ops\start-all.cmd:
// Silvia 8080, Ollama 11434 compat) und ruft /sprechen genauso wie ein Mensch bzw.
// tests/e2e/local.spec.ts: Browser -> Anrufen -> Text tippen -> Senden -> Antwortblase
// abwarten. Kein direkter RPC-Aufruf: TanStack Start serialisiert createServerFn-Bodies
// mit einem eigenen ("seroval") Framing, kein simples JSON — der Browser-Weg ist robust
// gegen Änderungen daran und deckt denselben Codepfad ab wie eine echte Anruferin.
//
// AP 27 — --api: seit AP 27 gibt es POST /api/telefon/antwort (dieselbe askAlma-Logik
// serverseitig direkt aufgerufen, kein seroval), gedacht für das Telefon-Gateway und
// für einen schnelleren Eval-Lauf ohne Playwright/Browser. --api ruft dieselben
// Szenarien per fetch() gegen die Route auf (Bearer SILVIA_PHONE_TOKEN aus der Silvia-
// .env-Prozessumgebung bzw. --token). Ohne --api bleibt der bisherige Browser-Weg
// Standard (deckt zusätzlich UI/Anzeige-Pfad ab, den --api nicht prüft).
//
// Aufruf: node scripts/eval-run.mjs [--model qwen2.5:3b] [--provider compat] [--base http://127.0.0.1:8080]
//         node scripts/eval-run.mjs --api [--token <SILVIA_PHONE_TOKEN>] [--base ...]
// Ohne --model/--provider: aus der laufenden .env (Server-Prozess) übernommen — das Skript
// wechselt das Modell/den Provider NICHT selbst (server-seitig fix pro Prozessstart: SILVIA_LLM_MODEL
// / SILVIA_LLM_PROVIDER werden beim Start aus .env gelesen). Für einen Lauf mit einem anderen
// Modell oder Provider: .env anpassen (z. B. SILVIA_LLM_PROVIDER=openai, SILVIA_LLM_MODEL=gpt-4o-mini,
// OPENAI_API_KEY=...) und den Silvia-Prozess (npm start / start-all.cmd) neu starten — WICHTIG: dabei
// .output/silvia-src.stamp löschen oder committen, sonst überspringt npm start den Rebuild bei
// unveränderter git-HEAD (Stale-Build-Falle, siehe scripts/start-desk.mjs sourceFingerprint()).
// --provider dient nur der Report-Beschriftung/als Prüfhinweis, ruft KEIN eigenes HTTP an
// den Provider auf (der Aufruf läuft serverseitig in C:\silvia über /sprechen).
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://127.0.0.1:8080");
const MODEL_LABEL = arg("model", process.env.SILVIA_LLM_MODEL || "unbekannt");
const PROVIDER = arg("provider", process.env.SILVIA_LLM_PROVIDER || "compat");
const API_MODE = process.argv.includes("--api");
const API_TOKEN = arg("token", process.env.SILVIA_PHONE_TOKEN || "");
if (API_MODE && !API_TOKEN) {
  console.error(
    "[eval-run] --api braucht ein Token: --token <SILVIA_PHONE_TOKEN> oder SILVIA_PHONE_TOKEN in dieser Shell " +
      "(muss dem Wert aus C:\\silvia\\.env entsprechen).",
  );
  process.exit(1);
}
if (PROVIDER === "openai" && !process.env.OPENAI_API_KEY) {
  console.warn(
    "[eval-run] --provider openai: kein OPENAI_API_KEY in dieser Shell gesetzt. " +
      "Das ist nur eine Erinnerung — der eigentliche Key muss in C:\\silvia\\.env stehen " +
      "(SILVIA_LLM_PROVIDER=openai, SILVIA_LLM_MODEL=gpt-4o-mini), dann npm start NEU " +
      "(inkl. Rebuild, siehe Kopfkommentar) — dieses Skript liest/setzt ihn nicht selbst.",
  );
}

function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function checkPatterns(patterns, text) {
  const t = String(text ?? "");
  return (patterns ?? []).map((p) => ({ pattern: p, hit: new RegExp(p, "i").test(t) }));
}

async function runScenario(page, scenario) {
  const start = Date.now();
  await page.goto(`${BASE}/sprechen`, { waitUntil: "commit" });
  await page.locator("#sprechen-anrufen").click();
  const input = page.getByPlaceholder(/Fragen Sie etwas|Mikrofon gesperrt/);
  await input.waitFor({ state: "visible", timeout: 15_000 });

  let lastReply = "";
  let turnLatencyMs = 0;
  for (const message of scenario.verlauf) {
    const before = await page.locator(".bg-ok\\/20").count();
    const turnStart = Date.now();
    await input.fill(message);
    await page.getByRole("button", { name: "Senden" }).click();
    await page
      .locator(".bg-ok\\/20")
      .nth(before)
      .waitFor({ state: "visible", timeout: 150_000 });
    turnLatencyMs = Date.now() - turnStart;
    lastReply = (await page.locator(".bg-ok\\/20").nth(before).innerText()).trim();
  }
  const totalMs = Date.now() - start;

  const mussChecks = checkPatterns(scenario.muss, lastReply);
  const verbotenChecks = checkPatterns(scenario.verboten, lastReply);
  const mussOk = mussChecks.every((c) => c.hit);
  const verbotenOk = verbotenChecks.every((c) => !c.hit);
  const words = wordCount(lastReply);
  const laengeOk = !scenario.maxWoerter || words <= scenario.maxWoerter;
  const pass = mussOk && verbotenOk && laengeOk;

  return {
    id: scenario.id,
    pass,
    reply: lastReply,
    words,
    latencyMs: turnLatencyMs,
    totalMs,
    mussChecks,
    verbotenChecks,
    laengeOk,
  };
}

/** --api: derselbe Szenario-Ablauf wie runScenario(), aber per fetch() gegen
 * POST /api/telefon/antwort (AP 27) statt Playwright/Browser. */
async function runScenarioApi(scenario) {
  const start = Date.now();
  const history = [];
  const callId = `eval-${scenario.id}-${Date.now()}`;
  let lastReply = "";
  let turnLatencyMs = 0;
  for (const message of scenario.verlauf) {
    history.push({ role: "user", content: message });
    const turnStart = Date.now();
    const res = await fetch(`${BASE}/api/telefon/antwort`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_TOKEN}` },
      body: JSON.stringify({ callId, messages: history }),
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    turnLatencyMs = Date.now() - turnStart;
    lastReply = String(data.reply ?? "");
    history.push({ role: "assistant", content: lastReply });
  }
  const totalMs = Date.now() - start;

  const mussChecks = checkPatterns(scenario.muss, lastReply);
  const verbotenChecks = checkPatterns(scenario.verboten, lastReply);
  const mussOk = mussChecks.every((c) => c.hit);
  const verbotenOk = verbotenChecks.every((c) => !c.hit);
  const words = wordCount(lastReply);
  const laengeOk = !scenario.maxWoerter || words <= scenario.maxWoerter;
  const pass = mussOk && verbotenOk && laengeOk;

  return {
    id: scenario.id,
    pass,
    reply: lastReply,
    words,
    latencyMs: turnLatencyMs,
    totalMs,
    mussChecks,
    verbotenChecks,
    laengeOk,
  };
}

async function main() {
  const scenariosPath = arg("scenarios", "tests/eval/szenarien.json");
  const scenarios = JSON.parse(await readFile(path.join(ROOT, scenariosPath), "utf8"));
  const browser = API_MODE ? null : await chromium.launch();
  const page = browser ? await browser.newPage() : null;
  const results = [];
  for (const scenario of scenarios) {
    try {
      const r = API_MODE ? await runScenarioApi(scenario) : await runScenario(page, scenario);
      results.push(r);
      console.log(`${r.pass ? "PASS" : "FAIL"} ${scenario.id} (${r.latencyMs}ms)`);
    } catch (err) {
      results.push({ id: scenario.id, pass: false, error: String(err?.message ?? err), latencyMs: null });
      console.log(`FAIL ${scenario.id} — ${String(err?.message ?? err).slice(0, 160)}`);
    }
  }
  if (browser) await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const rate = ((passed / results.length) * 100).toFixed(1);
  const latencies = results.map((r) => r.latencyMs).filter((n) => typeof n === "number");
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  const date = new Date().toISOString().slice(0, 10);
  const safeModel = MODEL_LABEL.replace(/[^a-z0-9.-]/gi, "_");
  const reportPath = path.join(ROOT, `tests/eval/report-${date}-${safeModel}.md`);

  const lines = [];
  lines.push(`# Gesprächs-Eval — ${MODEL_LABEL} (${PROVIDER}) — ${date}`);
  lines.push("");
  lines.push(`Pass-Quote: **${passed}/${results.length} (${rate} %)**. Ø Latenz: ${avgLatency ?? "n/a"} ms.`);
  lines.push("");
  lines.push("| Szenario | Ergebnis | Latenz (ms) | Wörter |");
  lines.push("|---|---|---|---|");
  for (const r of results) {
    const last = r.latencyMs != null && r.latencyMs > 20_000 ? `${r.latencyMs} (unter Last)` : (r.latencyMs ?? "n/a");
    lines.push(`| ${r.id} | ${r.pass ? "PASS" : "FAIL"} | ${last} | ${r.words ?? "n/a"} |`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    lines.push("");
    lines.push("## Fehlerliste");
    for (const r of failed) {
      lines.push("");
      lines.push(`### ${r.id}`);
      if (r.error) {
        lines.push(`Fehler: ${r.error}`);
        continue;
      }
      lines.push(`Antwort: "${r.reply}"`);
      const missedMuss = (r.mussChecks ?? []).filter((c) => !c.hit).map((c) => c.pattern);
      const hitVerboten = (r.verbotenChecks ?? []).filter((c) => c.hit).map((c) => c.pattern);
      if (missedMuss.length) lines.push(`Fehlende Muss-Inhalte: ${missedMuss.join(", ")}`);
      if (hitVerboten.length) lines.push(`Verbotenes getroffen: ${hitVerboten.join(", ")}`);
      if (!r.laengeOk) lines.push(`Zu lang: ${r.words} Wörter`);
    }
  }

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, lines.join("\n") + "\n", "utf8");
  console.log(`\nReport: ${reportPath}`);
  console.log(`Pass-Quote ${MODEL_LABEL}: ${passed}/${results.length} (${rate} %), Ø ${avgLatency ?? "n/a"} ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
