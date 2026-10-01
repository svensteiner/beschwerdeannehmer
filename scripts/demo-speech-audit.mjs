// Isolated browser regression. No microphone, practice writes or paid API calls.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.env.AUDIT_URL || "http://127.0.0.1:8092";
// Spec: Im Sprachtraining beendet „Schulung beenden“ auch während des Klingelns die Sitzung dauerhaft, ohne Mikrofon- oder POST-Aufruf.
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
await context.addInitScript(() => {
  const mediaDevices = navigator.mediaDevices ?? {};
  Object.defineProperty(mediaDevices, "getUserMedia", {
    configurable: true,
    value: async () => {
      throw new Error("test microphone denied");
    },
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
});
await context.route("**/*", async route => {
  const request = route.request();
  if (!request.url().startsWith(base) || request.method() === "POST") {
    console.log('Blocked test request:', request.method(), new URL(request.url()).pathname);
    return route.abort();
  }
  return route.continue();
});
try {
  const page = await context.newPage();
  await page.goto(`${base}/sprechen?training=sprache`);
  await page.locator('#sprechen-training-sprache').waitFor({timeout:10000}).catch(async error => {
    console.log((await page.locator('body').innerText()).slice(0,1600));
    throw error;
  });
  const comparison = page.getByRole('region', {name:'Welche Silvia möchten Sie?'});
  assert.equal(await comparison.locator('audio').count(), 2);
  const premium = comparison.locator('audio[aria-label="Silvia Premium Hörprobe"]');
  const live = comparison.locator('audio[aria-label="Silvia Live Hörprobe"]');
  await page.waitForFunction(() => [...document.querySelectorAll('audio[aria-label$="Hörprobe"]')].every(audio => Number.isFinite(audio.duration) && audio.duration > 0));
  await premium.evaluate(audio => audio.play());
  await live.evaluate(audio => audio.play());
  assert.equal(await premium.evaluate(audio => audio.paused), true);
  assert.equal(await live.evaluate(audio => audio.paused), false);
  await live.evaluate(audio => audio.pause());
  await page.evaluate(() => localStorage.setItem('silvia.demo-speech-terms.v1', JSON.stringify(['Röntgenübung'])));
  await page.reload();
  const terms = page.getByRole('region', {name:'Demo-Fachbegriffe'});
  await terms.getByText('Röntgenübung', {exact:true}).waitFor();
  assert.equal(await page.locator('#sprechen-training-sprache').getAttribute('aria-pressed'), 'true');
  await page.locator('#sprechen-training-wissen').click();
  await terms.waitFor({state:'hidden'});
  await page.locator('#sprechen-training-sprache').click();
  await terms.getByRole('button', {name:'Röntgenübung löschen',exact:true}).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('silvia.demo-speech-terms.v1'))), []);
  await page.reload();
  await page.getByText('Demo-Fachbegriffe: 0/20',{exact:true}).waitFor();
  await page.locator('#sprechen-anrufen').click();
  await page.locator('#sprechen-training-beenden').click();
  await page.getByText(/Gespräch beendet ·/).waitFor();
  assert.equal(await page.locator('#sprechen-training-wissen').isEnabled(), true);
  assert.equal(await page.locator('#sprechen-training-sprache').isEnabled(), true);
  await page.waitForTimeout(2200);
  await page.getByText(/Gespräch beendet ·/).waitFor();
  const other = await browser.newContext();
  await other.route('**/*', route => {
    const req = route.request();
    return !req.url().startsWith(base) || req.method() === 'POST' ? route.abort() : route.continue();
  });
  const isolated = await other.newPage();
  await isolated.goto(`${base}/sprechen?training=sprache`);
  await isolated.getByText('Demo-Fachbegriffe: 0/20',{exact:true}).waitFor();
  await other.close();
  console.log('PASS: two packages, playable audio metadata, mutually exclusive playback, speech route, reload, training selection, deletion, ringing abort and isolated browser. No microphone or paid requests.');
} finally {
  await context.close();
  await browser.close();
}
