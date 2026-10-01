import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
assert.ok(base, "AUDIT_URL muss auf den isolierten Audit-Server zeigen");
const target = new URL(base);
assert.equal(target.protocol, "http:", "Nur isolierte lokale HTTP-Testserver erlaubt");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Nur lokale Testserver erlaubt");
assert.notEqual(target.port, "8092", "Die bestehende Installation auf 8092 bleibt unberührt");
const origin = target.origin;
const audioPaths = [
  "/sounds/voices/silvia-premium-ramona.wav",
  "/sounds/voices/silvia-live-marin.wav",
];
const evidence = await mkdtemp(join(tmpdir(), "silvia-home-audio-error-"));
let failInitialAudio = true;
let failures = 0;
let blockedScripts = 0;
let releaseScripts;
const scriptsReleased = new Promise((resolve) => { releaseScripts = resolve; });
let delaySecondMetadata = false;
let delayedSecondMetadataRequests = 0;
let releaseSecondMetadata;
const secondMetadataReleased = new Promise((resolve) => { releaseSecondMetadata = resolve; });
let markSecondMetadataDelayed;
const secondMetadataDelayed = new Promise((resolve) => { markSecondMetadataDelayed = resolve; });
const browserErrors = [];
const browserConsoleErrors = [];
const expectedAudio404Console = "Failed to load resource: the server responded with a status of 404 (Not Found)";
let expectedAudio404ConsoleCount = 0;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const watchdog = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, timeout: true, browserErrors, evidence }));
  process.exit(124);
}, 90_000);
context.setDefaultTimeout(10_000);
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin || request.method() !== "GET") return route.abort();
  if (failInitialAudio && audioPaths.includes(url.pathname)) {
    failures += 1;
    return route.fulfill({ status: 404, contentType: "audio/wav", body: "" });
  }
  if (delaySecondMetadata && url.pathname === audioPaths[1] && url.searchParams.has("audit-delay")) {
    delayedSecondMetadataRequests += 1;
    markSecondMetadataDelayed?.();
    markSecondMetadataDelayed = null;
    await secondMetadataReleased;
    return route.continue();
  }
  if (request.resourceType() === "script" && releaseScripts) {
    blockedScripts += 1;
    await scriptsReleased;
  }
  return route.continue();
});
try {
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (message.text() === expectedAudio404Console) {
      expectedAudio404ConsoleCount += 1;
      return;
    }
    browserConsoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "commit" });
  const audioSelector = 'audio[aria-label$="Hörprobe"]';
  await page.waitForFunction((count) => document.querySelectorAll('audio[aria-label$="Hörprobe"]').length === count, audioPaths.length);
  await page.waitForFunction((count) => [...document.querySelectorAll('audio[aria-label$="Hörprobe"]')]
    .filter((audio) => audio.error !== null).length === count, audioPaths.length, { timeout: 10_000 });
  const nativeFailures = await page.locator(audioSelector).evaluateAll((audios) => audios.map((audio) => ({
    label: audio.getAttribute("aria-label"), currentSrc: audio.currentSrc,
    errorCode: audio.error?.code ?? null, readyState: audio.readyState, networkState: audio.networkState,
  })));
  assert.equal(failures, audioPaths.length, "Nicht beide nativen Audioquellen antworteten mit 404.");
  assert.equal(expectedAudio404ConsoleCount, audioPaths.length, "Nicht exakt die zwei erwarteten Audio-404-Consolelogs wurden erzeugt.");
  assert(blockedScripts > 0, "JavaScript wurde nicht vor den nativen Audiofehlern angehalten.");
  releaseScripts();
  releaseScripts = null;
  // Erst jetzt darf React hydratisieren und den beim Mount vorhandenen Fehler übernehmen.
  await page.waitForFunction(() => {
    const button = document.querySelector("#desk-home-testen");
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  }, null, { timeout: 10_000 });
  await page.locator("#desk-home-testen").click();
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  const alert = page.getByRole("alert").filter({ hasText: "Die Hörprobe konnte nicht geladen werden." });
  await page.waitForFunction(() => document.querySelectorAll('[role="alert"]').length === 2, null, { timeout: 10_000 });
  assert.equal(await alert.count(), 2, "Beide anfänglichen Audiofehler müssen sichtbar sein.");
  assert.equal(await alert.first().isVisible(), true, "Der Audiofehler muss für die Nutzer sichtbar sein.");
  assert.equal(await alert.last().isVisible(), true, "Auch der zweite Audiofehler muss für die Nutzer sichtbar sein.");
  await alert.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, "audio-404-visible.png"), fullPage: false });
  failInitialAudio = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction((count) => [...document.querySelectorAll('audio[aria-label$="Hörprobe"]')]
    .filter((audio) => audio.readyState >= 1 && audio.error === null).length === count, audioPaths.length, { timeout: 10_000 });
  assert.equal(await page.getByRole("alert").count(), 0);
  // Die nativen Audio-Metadaten können vor der React-Hydration eintreffen.
  // Erst dann ist der CTA nach dem Reload wirklich bedienbar.
  await page.waitForFunction(() => {
    const button = document.querySelector("#desk-home-testen");
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  }, null, { timeout: 10_000 });
  await page.locator("#desk-home-testen").click();
  await page.getByRole("dialog").waitFor({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
  const samples = page.locator(audioSelector);
  // Der Metadaten-Handler der zweiten Probe löst einen React-Render aus. Die
  // bereits spielende erste Probe darf dadurch nicht wie beim alten Cleanup
  // pausiert werden.
  await samples.nth(0).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play timeout")), 2_000))]); });
  await page.waitForFunction((selector) => !document.querySelectorAll(selector)[0]?.paused, audioSelector);
  delaySecondMetadata = true;
  await samples.nth(1).evaluate((el) => {
    const url = new URL(el.currentSrc || el.src, location.href);
    url.searchParams.set("audit-delay", "1");
    el.src = url.href;
    el.load();
  });
  await secondMetadataDelayed;
  assert.equal(delayedSecondMetadataRequests, 1, "Die zweite Hörprobe wurde nicht gezielt verzögert.");
  assert.equal(await samples.nth(0).evaluate((el) => el.paused), false, "Ein Render beim Laden der zweiten Probe pausiert die erste Probe.");
  releaseSecondMetadata();
  releaseSecondMetadata = null;
  delaySecondMetadata = false;
  await page.waitForFunction((selector) => {
    const audio = document.querySelectorAll(selector)[1];
    return audio?.readyState >= 1 && audio.error === null;
  }, audioSelector, { timeout: 10_000 });
  assert.equal(await samples.nth(0).evaluate((el) => el.paused), false, "Die erste Probe wurde nach den Metadaten der zweiten pausiert.");
  await samples.nth(0).evaluate((el) => el.pause());
  await samples.nth(0).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play timeout")), 2_000))]); });
  await samples.nth(1).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play timeout")), 2_000))]); });
  await page.waitForFunction((selector) => document.querySelectorAll(selector)[0]?.paused === true, audioSelector);
  assert.equal(await samples.nth(0).evaluate((el) => el.paused), true, "erste Hörprobe stoppt nicht");
  assert.equal(await samples.nth(1).evaluate((el) => el.paused), false, "zweite Hörprobe spielt nicht");
  await samples.nth(0).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play timeout")), 2_000))]); });
  await page.waitForFunction((selector) => document.querySelectorAll(selector)[1]?.paused === true, audioSelector);
  assert.equal(await samples.nth(1).evaluate((el) => el.paused), true, "zweite Hörprobe stoppt nicht");
  assert.equal(await samples.nth(0).evaluate((el) => el.paused), false, "erste Hörprobe spielt nicht");
  await samples.nth(0).evaluate((el) => el.pause());
  await page.waitForFunction((selector) => document.querySelectorAll(selector)[0]?.paused === true, audioSelector);
  await samples.nth(0).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("replay timeout")), 2_000))]); });
  await page.waitForFunction((selector) => document.querySelectorAll(selector)[0]?.paused === false, audioSelector);
  assert.equal(await samples.nth(0).evaluate((el) => el.paused), false, "Die Hörprobe startet nach dem Stop nicht erneut.");
  await samples.nth(0).evaluate((el) => el.pause());
  await samples.nth(0).scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(evidence, "audio-recovered.png"), fullPage: false });
  await page.locator("#sprechen-mode-trainieren").click();
  await page.locator("#sprechen-training-wissen").waitFor({ timeout: 10_000 });
  assert.equal(await page.locator("#sprechen-training-wissen").getAttribute("aria-pressed"), "true");
  await page.locator("#sprechen-training-sprache").click();
  assert.equal(await page.locator("#sprechen-training-sprache").getAttribute("aria-pressed"), "true");
  await page.locator("#sprechen-mode-anrufen").click();
  await page.locator("#sprechen-mode-trainieren").waitFor({ timeout: 10_000 });
  // Echte Routenänderung, kein Full-Page-Reload: Das gehaltene, bereits
  // spielende Element muss durch den Unmount-Cleanup pausiert werden.
  await samples.nth(0).evaluate(async (el) => { await Promise.race([el.play(), new Promise((_, reject) => setTimeout(() => reject(new Error("play timeout")), 2_000))]); });
  const heldFirstSample = await samples.nth(0).elementHandle();
  assert(heldFirstSample, "Die erste Hörprobe ist vor dem Routenwechsel nicht vorhanden.");
  assert.equal(await heldFirstSample.evaluate((audio) => audio.paused), false, "Die erste Hörprobe startet vor dem Routenwechsel nicht.");
  const pauseAfterRoute = heldFirstSample.evaluate((audio) => new Promise((resolve) => {
    audio.addEventListener("pause", () => resolve(true), { once: true });
  }));
  await page.setViewportSize({ width: 1280, height: 900 });
  let fullPageNavigation = false;
  const observeNavigation = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) fullPageNavigation = true;
  };
  page.on("request", observeNavigation);
  await page.getByRole("link", { name: "Preise", exact: true }).first().click();
  await page.waitForURL(/\/preise(?:\?.*)?$/, { timeout: 10_000 });
  page.off("request", observeNavigation);
  let spaUnmount = "not_checked_full_page_navigation";
  if (!fullPageNavigation) {
    await Promise.race([
      pauseAfterRoute,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Die abgehängte Hörprobe wurde beim SPA-Routenwechsel nicht pausiert.")), 2_000)),
    ]);
    assert.equal(await heldFirstSample.evaluate((audio) => audio.paused), true, "Die abgehängte Hörprobe läuft nach dem SPA-Routenwechsel weiter.");
    spaUnmount = "passed";
  }
  await heldFirstSample.dispose();
  assert.equal(browserErrors.length, 0, `Unerwartete Browserfehler: ${browserErrors.join(" | ")}`);
  assert.equal(browserConsoleErrors.length, 0, `Unerwartete Browser-Consolefehler: ${browserConsoleErrors.join(" | ")}`);
  const result = { ok: true, failures, expectedAudio404ConsoleCount, blockedScripts, delayedSecondMetadataRequests, nativeFailures, spaUnmount, browserErrors, browserConsoleErrors, evidence };
  await writeFile(join(evidence, "audit.json"), `${JSON.stringify(result)}\n`, "utf8");
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    browserErrors,
    browserConsoleErrors,
    evidence,
  };
  await writeFile(join(evidence, "audit.json"), `${JSON.stringify(result)}\n`, "utf8");
  console.error(JSON.stringify(result));
  throw error;
} finally {
  releaseScripts?.();
  releaseSecondMetadata?.();
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
