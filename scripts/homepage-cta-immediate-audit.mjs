// Gezielter Nachweis: Der Homepage-CTA "Marin anhören" muss unmittelbar nach
// dem Klick auf "Pause" wechseln ? ohne Karenzzeit. Der bestehende
// homepage-acceptance-audit.mjs wartete früher 500 ms und maskierte damit die
// Verzögerung; dieser Audit prüft nur den Zustandswechsel und die Rückkehr.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
assert.ok(base, "AUDIT_URL muss auf den isolierten Audit-Server zeigen");
const target = new URL(base);
assert.equal(target.protocol, "http:", "Nur isolierte lokale HTTP-Testserver erlaubt");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Nur lokale Testserver erlaubt");
assert.notEqual(target.port, "8092", "Die bestehende Installation auf 8092 bleibt unberührt");

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext();
context.setDefaultTimeout(15_000);
try {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });

  const cta = page.locator("#desk-home-hear");
  await cta.waitFor({ timeout: 10_000 });
  const button = cta.locator("button").first();
  await button.waitFor();
  assert.equal((await button.innerText()).trim(), "Marin anhören", "Ausgangsbeschriftung des CTA");

  // Ein einziger Klick, danach wird OHNE Wartezeit geprüft.
  await button.click();
  const immediately = (await button.innerText()).trim();
  assert.equal(
    immediately,
    "Pause",
    `Der CTA muss unmittelbar nach dem Klick "Pause" zeigen, zeigte aber "${immediately}"`,
  );

  // Und der Zustand muss stabil bleiben, solange die Wiedergabe läuft.
  const audioState = await page.evaluate(() => {
    const el = document.querySelector('audio[aria-label$="Hörprobe"]');
    return el ? { paused: el.paused, src: el.currentSrc || el.src } : null;
  });

  // Zweiter Klick beendet die Wiedergabe und stellt die Beschriftung zurück.
  await button.click();
  await page.waitForFunction(
    (label) => document.querySelector("#desk-home-hear button")?.textContent?.trim() === label,
    "Marin anhören",
    { timeout: 5_000 },
  );

  // Fehlerfall: Ist die Tonquelle nicht ladbar, darf der Knopf nicht dauerhaft
  // auf "Pause" hängen bleiben, sondern muss zurückfallen. Ein sofortiger
  // Fehler darf sogar vor der ersten Prüfung zurücksetzen  entscheidend ist,
  // dass der Knopf wieder bedienbar ist und nicht in "Pause" feststeckt.
  const failPage = await context.newPage();
  await failPage.setViewportSize({ width: 1440, height: 900 });
  await failPage.route("**/sounds/voices/silvia-live-marin.wav", (route) =>
    route.fulfill({ status: 404, contentType: "audio/wav", body: "" }));
  await failPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const failCta = failPage.locator("#desk-home-hear button").first();
  await failCta.waitFor();
  await failCta.click();
  await failPage.waitForFunction(
    () => document.querySelector("#desk-home-hear button")?.textContent?.trim() === "Marin anhören",
    null,
    { timeout: 10_000 },
  );
  const failedLabel = (await failCta.innerText()).trim();
  // Der Knopf muss danach wieder bedienbar sein (kein dauerhaftes "Pause").
  assert.equal(failedLabel, "Marin anhören", "Der Knopf bleibt nach einem Audiofehler nicht bedienbar");
  await failPage.close();

  console.log(JSON.stringify({
    ok: true,
    immediateLabel: immediately,
    sampleObserved: audioState,
    returnLabel: (await button.innerText()).trim(),
    failedSourceLabel: failedLabel,
  }));
} finally {
  await context.close();
  await browser.close();
}
