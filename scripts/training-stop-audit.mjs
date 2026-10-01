// Isolated fake-native browser regression. No external request or POST is allowed.
// Spec: Aktiver Schulungsabbruch mit nativer Chromium-Fake-Audioquelle ist geprüft; ein echter österreichischer Hörtest bleibt unbewiesen.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL || "http://127.0.0.1:8092";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const context = await browser.newContext({ permissions: ["microphone"] });
let blockedPosts = 0;
let passedPosts = 0;

await context.addInitScript(() => {
  window.__silviaTestTracks = [];
  const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await nativeGetUserMedia(...args);
    for (const track of stream.getTracks()) {
      window.__silviaTestTracks.push(track);
    }
    return stream;
  };
});

await context.route("**/*", async (route) => {
  const request = route.request();
  if (!request.url().startsWith(base) || request.method() === "POST") {
    if (request.method() === "POST") blockedPosts += 1;
    return route.abort();
  }
  if (request.method() === "POST") passedPosts += 1;
  return route.continue();
});

try {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(`${base}/sprechen?training=sprache`);
  await page.locator("#sprechen-anrufen").click();
  await page.getByRole("button", { name: "Stimme aus" }).waitFor();
  await page.getByRole("button", { name: "Stimme aus" }).click();
  const speakButton = page.getByRole("button", { name: "Sprechen", exact: true });
  if (await speakButton.count()) await speakButton.click();
  await page.getByRole("button", { name: "Fertig", exact: true }).waitFor();

  const beforeEnd = await page.evaluate(() =>
    window.__silviaTestTracks.map((track) => track.readyState),
  );
  assert.ok(beforeEnd.length > 0, "kein nativer Fake-Mikrofon-Track erhalten");
  assert.ok(beforeEnd.some((state) => state === "live"), `kein Live-Track: ${beforeEnd}`);

  await page.locator("#sprechen-training-beenden").click();
  await page.getByText(/Gespräch beendet ·/).waitFor();
  assert.equal(await page.locator("#sprechen-training-wissen").isEnabled(), true);
  assert.equal(await page.locator("#sprechen-training-sprache").isEnabled(), true);
  const afterEnd = await page.evaluate(() =>
    window.__silviaTestTracks.map((track) => track.readyState),
  );
  assert.ok(afterEnd.every((state) => state === "ended"), `Tracks nicht beendet: ${afterEnd}`);
  assert.equal(passedPosts, 0, `POST wurde durchgelassen: ${passedPosts}`);
  console.log(
    `PASS: aktiver Fake-Mic-Abbruch, ${afterEnd.length} Track(s) ended, Trainingsarten aktiv, ${blockedPosts} POST(s) blockiert, 0 durchgelassen.`,
  );
} finally {
  await context.close();
  await browser.close();
}
