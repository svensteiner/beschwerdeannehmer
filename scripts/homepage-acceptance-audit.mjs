// Isolierte Homepage-Abnahme: Layout und lokale Audio-Metadaten, ohne POST/API-Aufrufe.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL || "http://127.0.0.1:8092";
const baseOrigin = new URL(base).origin;

const network = {
  allowed: new Map(),
  blocked: new Map(),
};

const bump = (bucket, key) => {
  bucket.set(key, (bucket.get(key) ?? 0) + 1);
};

const sum = (bucket) => [...bucket.values()].reduce((acc, v) => acc + v, 0);

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext();

await context.route("**/*", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const key = `${req.method()} ${u.origin}`;

  if (u.origin === baseOrigin && req.method() === "GET") {
    bump(network.allowed, key);
    return route.continue();
  }

  bump(network.blocked, key);
  return route.abort();
});

const readSamples = async (page) =>
  page.locator('audio[aria-label$="Hörprobe"]').evaluateAll((els) =>
    els.map((el) => ({
      ariaLabel: el.getAttribute("aria-label"),
      paused: el.paused,
      currentTime: el.currentTime,
      duration: el.duration,
    })),
  );

const ensureCtaToggle = async (page, ctaButton) => {
  const initialLabel = (await ctaButton.innerText()).trim();
  const before = await readSamples(page);
  assert.ok(before.length > 0, "No Hörprobe samples available for CTA toggle check");
  await ctaButton.click();

  // Der Knopf muss sofort auf "Pause" wechseln. Früher hing das an einem
  // aufgelösten audio.play()-Promise der vorbereiteten WAV-Datei und der
  // Audit wartete deshalb 500 ms — genau das maskierte die Verzögerung.
  // Jetzt wird der Zustandswechsel ohne Karenzzeit geprüft.
  const labelAfterClick = (await ctaButton.innerText()).trim();
  assert.equal(
    labelAfterClick,
    "Pause",
    `CTA must enter playback state immediately after the click (saw "${labelAfterClick}")`,
  );
  const during = await readSamples(page);
  assert.ok(during.length === before.length, "CTA changed Hörprobe sample count unexpectedly");

  await ctaButton.click();
  await page.waitForTimeout(300);
  assert.equal((await ctaButton.innerText()).trim(), initialLabel, "CTA must return to its original state");

  const after = await readSamples(page);
  assert.ok(before.length === after.length, "CTA changed Hörprobe sample count unexpectedly");
  assert.ok(after.every((sample) => sample.paused), "CTA stop did not leave any Hörprobe in playing state");
};

const checkSamplePlayability = async (page, label) => {
  const samples = page.locator('audio[aria-label$="Hörprobe"]');
  const count = await samples.count();
  assert.equal(count > 0, true, `no Hörprobe sample found for sample-playability check at ${label}`);

  for (let i = 0; i < count; i += 1) {
    const sample = samples.nth(i);
    const canPlay = await sample.evaluate(async (el) => {
      try {
        await el.play();
        return true;
      } catch {
        return false;
      }
    });

    assert.equal(canPlay, true, `Hörprobe sample not play-capable at ${label}`);

    const t0 = await sample.evaluate((el) => el.currentTime);
    await page.waitForTimeout(500);
    const t1 = await sample.evaluate((el) => el.currentTime);
    assert.ok(t1 > t0, `Hörprobe sample did not advance at ${label}`);

    await sample.evaluate((el) => el.pause());
  }
};

try {
  for (const width of [320, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate((expected) => window.innerWidth === expected, width), true);

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `horizontal overflow at ${width}px`);

    const cta = page.locator("#desk-home-hear");
    assert.equal(await cta.count(), 1, `main CTA at ${width}px`);

    const ctaButton = cta.getByRole("button");
    await ctaButton.waitFor({ timeout: 5000 });

    const sampleLabels = await page.locator('audio[aria-label$="Hörprobe"]').evaluateAll((els) =>
      els.map((e) => e.getAttribute("aria-label")),
    );
    assert.equal(sampleLabels.length, 2, `exactly 2 Hörprobe samples at ${width}px`);

    await ensureCtaToggle(page, ctaButton);
    await checkSamplePlayability(page, `${width}px`);
    if (width === 1440) {
      const sample = page.locator('audio[aria-label$="Hörprobe"]').first();
      await sample.evaluate(async (el) => { await el.play(); });
      await page.waitForFunction(() => !document.querySelector('audio[aria-label$="Hörprobe"]')?.paused);
      const trainMode = page.locator("#sprechen-mode-trainieren");
      await trainMode.click();
      await page.locator("#sprechen-anrufen").click();
      await page.waitForFunction(() => [...document.querySelectorAll('audio[aria-label$="Hörprobe"]')].every((el) => el.paused));
      assert.equal(await sample.evaluate((el) => el.paused), true, "Training muss laufende Homepage-Hörproben stoppen.");
    }
    const samplesAfter = await readSamples(page);
    assert.equal(samplesAfter.length, 2, `exactly 2 Hörprobe samples at ${width}px`);
    await page.close();
  }

  const speaking = await context.newPage();
  await speaking.setViewportSize({ width: 1440, height: 900 });
  await speaking.goto(`${base}/sprechen`, { waitUntil: "networkidle" });

  const labels = await speaking.locator('audio[aria-label$="Hörprobe"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  assert.deepEqual(labels.sort(), ["Silvia Live Hörprobe", "Silvia Premium Hörprobe"].sort());

  await speaking.waitForFunction(
    () => [...document.querySelectorAll('audio[aria-label$="Hörprobe"]')].every((e) => Number.isFinite(e.duration) && e.duration > 0),
    null,
    { timeout: 10000 },
  );

  assert.ok(sum(network.allowed) > 0, `no allowed requests captured: ${sum(network.allowed)}`);

  console.log(
    `PASS: Homepage 320/1440 ohne Overflow, CTA ändert Hörprobe-Zustand (Play/Pause), Hörprobe-Sample-Fähigkeit separat geprüft, genau zwei Hörproben, Audio-Metadaten geladen; GET-only lokale Requests erlaubt, blockierte Requests: ${sum(network.blocked)}.`,
  );
} finally {
  await context.close();
  await browser.close();
}
