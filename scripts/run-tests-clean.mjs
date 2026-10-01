// Führt den Testbefehl in einer bereinigten Umgebung aus.
// Entfernt Überreste aus Audit-Läufen (SILVIA_*, AUDIT_*, PORT, NITRO_*),
// damit die normale Testsuite dieselbe Umgebung wie auf einem frischen
// Terminal sieht. Zugangsdaten werden nicht gelesen oder ausgegeben.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env };
const cleared = [];
// Zeigt PLAYWRIGHT_BROWSERS_PATH auf einen Ordner, den es nicht mehr gibt
// (z. B. einen aufgeraeumten Sandbox-Zwischenspeicher), scheitert JEDER
// Browsertest mit "Executable doesn't exist" — obwohl die Browser im
// Standardordner liegen. Dann lieber die Variable fallen lassen, damit
// Playwright den Standardordner findet.
if (env.PLAYWRIGHT_BROWSERS_PATH && !existsSync(env.PLAYWRIGHT_BROWSERS_PATH)) {
  delete env.PLAYWRIGHT_BROWSERS_PATH;
  console.log("PLAYWRIGHT_BROWSERS_PATH zeigte auf einen fehlenden Ordner — entfernt.");
}
for (const name of Object.keys(env)) {
  if (/^(SILVIA_|AUDIT_|GROK_|NITRO_|REAL_LOCAL_TTS|SPEECH_BODY_AUDIT|FILM_AUDIO_AUDIT)/i.test(name)
      || ["PORT", "HOST", "DATABASE_URL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
          "XAI_API_KEY", "GEMINI_API_KEY", "KIMI_API_KEY", "OLLAMA_HOST",
          "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NODE_USE_ENV_PROXY",
          "VITE_AUTH_ENABLED", "VITE_OPENAI_API_KEY"].includes(name)) {
    delete env[name];
    cleared.push(name);
  }
}
console.log(`Bereinigt: ${cleared.length} Variablen`);

const result = spawnSync(process.execPath, [join(root, "scripts", "run-tests.mjs")], {
  cwd: root,
  env,
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
