import { expect, test } from "playwright/test";

// AP 15 — Browser-E2E gegen den lokalen Stack (C:\silvia-ops\start-all.cmd:
// Silvia 8080, Connector 8765, Voice 8178/8179, Ollama). Headless chromium,
// kein Netz, keine echten Vquadrat-Schreibzugriffe (Connector bleibt read-only).
//
// Registriert eine Testpraxis über /registrieren. Silvia ohne DATABASE_URL
// ist PGLite — EIN Tenant pro .silvia-data (AGENTS.md: "PGLite-Registrieren
// legt keine zweite Ordination in denselben Ordner an"); /registrieren
// blendet das Formular aus, sobald schon eine Tafel existiert. Für einen
// grünen Lauf braucht `.silvia-data` daher noch keine Praxis — bei einem
// frisch aufgesetzten oder zurückgesetzten lokalen Stack (start-all.cmd) ist
// das gegeben. Existiert schon eine Tafel (z. B. ein vorheriger E2E-Lauf),
// bricht der Test unten mit einer klaren Fehlermeldung ab statt endlos auf
// eine Weiterleitung zu warten.

test("Login/Registrierung, Tafel, Einstellungen, Sprechen", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.silvia.test`;

  await test.step("Registrierung mit Testpraxis", async () => {
    await page.goto("/registrieren");
    const form = page.locator("#desk-register-form");
    if (!(await form.isVisible().catch(() => false))) {
      throw new Error(
        "Auf diesem Rechner liegt schon eine Tafel (.silvia-data hat schon eine Ordination) — " +
          "/registrieren blendet das Formular deshalb aus. PGLite ist Single-Tenant: für einen " +
          "erneuten e2e:local-Lauf C:\\silvia\\.silvia-data leeren (start-all.cmd danach neu starten) " +
          "oder testen, ob sich die vorhandene Testpraxis noch manuell anmelden lässt.",
      );
    }

    await page.locator("#practice").fill("E2E Testpraxis");
    await page.locator("#name").fill("Dr. E2E Test");
    await page.locator("#city").fill("Graz");
    await page.locator("#bundesland").selectOption("Steiermark");
    // #pms bleibt Standard (Vquadrat Veterinär, PMS_DEFAULT).
    await page.locator("#street").fill("Testgasse 1");
    await page.locator("#zip").fill("8010");
    await page.locator("#parkplatz").fill("Parkplatz vor dem Haus");
    await page.locator("#email").fill(email);
    // Inbox muss laut App eine andere Adresse als Anmelden sein.
    await page.locator("#inbox").fill(`inbox-${email}`);
    await page.locator("#password").fill("e2e-test-passwort-1");
    await page.locator("#phone").fill("0316 1234567");
    await page.locator("#nachtdienst").fill("0664 1234567");

    await form.locator('button[type="submit"]').click();
    // Client-seitige Navigation (TanStack Router) — kein "load"-Event, daher waitUntil "commit".
    await page.waitForURL("**/app", { timeout: 30_000, waitUntil: "commit" });
  });

  await test.step("Tafel lädt", async () => {
    await expect(page.locator("#heute-zeiten")).toBeVisible({ timeout: 30_000 });
  });

  // AP 15 Nebenbefund (STATUS.md Zeile 15): eine frisch registrierte Praxis
  // konnte sich angeblich "in einem späteren Prozess-Request" nicht mehr per
  // Passwort anmelden ("unbekannt"). Reproduktion gegen den echten
  // node-server-Stack (C:\silvia-ops\start-all.cmd) — auch über einen vollen
  // Prozess-Neustart hinweg (PGLite überlebt Restart) — zeigt einen
  // funktionierenden Login; die Ursache war vermutlich ein Testartefakt: ein
  // zweiter e2e-Lauf ohne geleertes .silvia-data generiert eine neue E-Mail,
  // deren Registrierung PGLite (Single-Tenant) stumm ablehnt (Formular
  // ausgeblendet) — ein Login mit dieser nie angelegten E-Mail meldet dann
  // zurecht "unbekannt". Dieser Schritt hält den echten Login-Weg (Abmelden
  // → mit Passwort neu anmelden) als Regressionstest fest.
  await test.step("Abmelden und mit Passwort erneut anmelden", async () => {
    await page.locator('[aria-label="Abmelden"]').click();
    await page.waitForURL("**/", { timeout: 15_000, waitUntil: "commit" });

    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill("e2e-test-passwort-1");
    await page.locator("#desk-login-submit").click();
    await page.waitForURL("**/app*", { timeout: 30_000, waitUntil: "commit" });
    await expect(page.locator("#heute-zeiten")).toBeVisible({ timeout: 30_000 });
  });

  await test.step("Einstellungen zeigen Vquadrat Veterinär, verbunden (nur lesen)", async () => {
    await page.goto("/app/einstellungen");
    const pmsStatus = page.locator("#pms-status");
    await expect(pmsStatus).toBeVisible({ timeout: 30_000 });
    await expect(pmsStatus).toContainText("Vquadrat Veterinär");
    await expect(pmsStatus).toContainText("verbunden (nur lesen)");
  });

  await test.step("Status-Seite zeigt Ampeln für Ollama, STT, TTS, Connector, Speicher, Aufbewahrung", async () => {
    await page.goto("/app/status");
    await expect(page.locator("#status-ollama")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#status-stt")).toBeVisible();
    await expect(page.locator("#status-tts")).toBeVisible();
    await expect(page.locator("#status-connector")).toBeVisible();
    await expect(page.locator("#status-storage")).toBeVisible();
    await expect(page.locator("#status-retention")).toBeVisible();
    await expect(page.locator("#status-connector")).toContainText("In Ordnung");
  });

  await test.step("Sprechen: Frage tippen, Antwort erscheint", async () => {
    await page.goto("/sprechen");
    await page.locator("#sprechen-anrufen").click();

    const input = page.getByPlaceholder(/Fragen Sie etwas|Mikrofon gesperrt/);
    await expect(input).toBeVisible({ timeout: 15_000 });

    const initialAssistantBubbles = await page.locator(".bg-ok\\/20").count();

    await input.fill("Wann habt ihr geöffnet?");
    await page.getByRole("button", { name: "Senden" }).click();

    // Ollama-CPU (compat-Pfad) kann langsam sein — großzügiges Timeout.
    await expect
      .poll(async () => page.locator(".bg-ok\\/20").count(), { timeout: 60_000, message: "keine Antwort erschienen" })
      .toBeGreaterThan(initialAssistantBubbles);
  });
});
