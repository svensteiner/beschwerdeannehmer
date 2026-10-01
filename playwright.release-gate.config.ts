import { defineConfig, devices } from "playwright/test";

// Exklusiver Loopback-Port für diesen Gate; bewusst nie der Benutzer-Port 8092.
// Ein belegter Port lässt den Gate fehlschlagen, statt einen fremden Server zu verwenden.
const port = 8185;
// Der Gate muss dieselbe geprüfte Node-Laufzeit verwenden, die ihn startet.
// Ein bloßes `node` würde auf Windows leicht eine ältere Systeminstallation
// aus PATH wählen und den isolierten Produktionsnachweis verfälschen.
const node = JSON.stringify(process.execPath);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "release-gate.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `${node} scripts/release-gate-server.mjs ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_AUTH_ENABLED: "false",
      SILVIA_DATA_DIR: "memory",
      DATABASE_URL: "",
      SILVIA_LLM_PROVIDER: "local",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      KIMI_API_KEY: "",
      GEMINI_API_KEY: "",
      XAI_API_KEY: "",
      SILVIA_LLM_BASE_URL: "",
      SILVIA_LIVE_DEMO_ENABLED: "0",
      SILVIA_BOOKING: "",
      SILVIA_STT_URL: "",
      SILVIA_TTS_URL: "",
      OLLAMA_HOST: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      ALL_PROXY: "",
      NODE_USE_ENV_PROXY: "0",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
