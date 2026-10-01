import { defineConfig, devices } from "playwright/test";

// AP 15 — Browser-E2E gegen den lokalen Stack (silvia-ops start-all.cmd).
// Kein eigener webServer: Silvia/Connector/Voice/Ollama laufen schon
// (start-all.cmd), dieselben Prozesse wie im echten Praxisbetrieb.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  // Screenshots bei Fehler landen unter C:\silvia-ops\logs\e2e (outputDir),
  // nicht im Repo — silvia-ops sammelt dort schon die anderen Betriebs-Logs.
  outputDir: "C:/silvia-ops/logs/e2e",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
