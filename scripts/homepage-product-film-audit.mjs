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
const filmAudioPaths = new Set(["/film-audio/ring", "/film-audio/ara"]);
const evidence = await mkdtemp(join(tmpdir(), "silvia-home-product-film-"));
const browserErrors = [];
const requests = [];
const audioResponses = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
context.on("response", (response) => {
  const path = new URL(response.url()).pathname;
  if (filmAudioPaths.has(path)) {
    const headers = response.headers();
    audioResponses.push({ path, status: response.status(), acceptRanges: headers["accept-ranges"] ?? null, contentRange: headers["content-range"] ?? null });
  }
});
const watchdog = setTimeout(() => {
  console.error(JSON.stringify({ ok: false, timeout: true, browserErrors, evidence }));
  process.exit(124);
}, 90_000);
context.setDefaultTimeout(10_000);
await context.addInitScript(() => {
  const NativeAudio = window.Audio;
  window.__productFilmAudios = [];
  window.__holdProductFilmAraMetadata = false;
  window.__heldProductFilmAraMetadata = [];
  function TrackedAudio(...args) {
    const audio = new NativeAudio(...args);
    const nativeCurrentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
    const nativeReadyState = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "readyState")?.get;
    const nativePlay = audio.play.bind(audio);
    audio.__productFilmTrace = [];
    Object.defineProperty(audio, "currentTime", {
      configurable: true,
      get() { return nativeCurrentTime?.get?.call(audio) ?? 0; },
      set(value) {
        audio.__productFilmTrace.push({ kind: "currentTime", value, stack: new Error().stack?.split("\n").slice(1, 4) });
        nativeCurrentTime?.set?.call(audio, value);
      },
    });
    audio.play = () => {
      audio.__productFilmTrace.push({ kind: "play", currentTime: audio.currentTime, stack: new Error().stack?.split("\n").slice(1, 4) });
      return nativePlay();
    };
    audio.addEventListener("seeked", () => {
      audio.__productFilmTrace.push({ kind: "seeked", currentTime: audio.currentTime });
    });
    Object.defineProperty(audio, "readyState", {
      configurable: true,
      get() {
        if (window.__holdProductFilmAraMetadata && audio.src.endsWith("/film-audio/ara")) return HTMLMediaElement.HAVE_NOTHING;
        return nativeReadyState?.call(audio) ?? HTMLMediaElement.HAVE_NOTHING;
      },
    });
    audio.__productFilmActualReadyState = () => nativeReadyState?.call(audio) ?? HTMLMediaElement.HAVE_NOTHING;
    const addEventListener = audio.addEventListener.bind(audio);
    audio.addEventListener = (type, listener, options) => {
      if (
        type === "loadedmetadata" &&
        window.__holdProductFilmAraMetadata &&
        audio.src.endsWith("/film-audio/ara")
      ) {
        window.__heldProductFilmAraMetadata.push({ audio, listener });
        return;
      }
      addEventListener(type, listener, options);
    };
    window.__productFilmAudios.push(audio);
    return audio;
  }
  TrackedAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(TrackedAudio, NativeAudio);
  window.Audio = TrackedAudio;
});
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== origin || request.method() !== "GET") return route.abort();
  requests.push({ path: `${url.pathname}${url.search}`, type: request.resourceType() });
  return route.continue();
});
try {
  const fullAudio = await fetch(`${origin}/film-audio/ara`);
  assert.equal(fullAudio.status, 200, "Die feste Ara-Audiodatei muss vollständig erreichbar sein.");
  assert.equal(fullAudio.headers.get("accept-ranges"), "bytes");
  const fullBytes = new Uint8Array(await fullAudio.arrayBuffer());
  assert(fullBytes.length > 20, "Die feste Ara-Audiodatei ist unerwartet leer.");
  const partialAudio = await fetch(`${origin}/film-audio/ara`, { headers: { Range: "bytes=10-19" } });
  assert.equal(partialAudio.status, 206);
  assert.equal(partialAudio.headers.get("content-range"), `bytes 10-19/${fullBytes.length}`);
  assert.deepEqual(new Uint8Array(await partialAudio.arrayBuffer()), fullBytes.slice(10, 20));
  const fullRange = await fetch(`${origin}/film-audio/ara`, { headers: { Range: "bytes=0-" } });
  assert.equal(fullRange.status, 206);
  assert.equal(fullRange.headers.get("content-range"), `bytes 0-${fullBytes.length - 1}/${fullBytes.length}`);
  assert.equal((await fullRange.arrayBuffer()).byteLength, fullBytes.length);
  const invalidRange = await fetch(`${origin}/film-audio/ara`, { headers: { Range: `bytes=${fullBytes.length}-` } });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("content-range"), `bytes */${fullBytes.length}`);
  const audioHead = await fetch(`${origin}/film-audio/ara`, { method: "HEAD", headers: { Range: "bytes=10-19" } });
  assert.equal(audioHead.status, 206);
  assert.equal(audioHead.headers.get("content-range"), `bytes 10-19/${fullBytes.length}`);
  assert.equal(audioHead.headers.get("content-length"), "10");
  assert.equal(await audioHead.text(), "", "HEAD darf keinen Audiobody liefern.");
  const disallowedMethod = await fetch(`${origin}/film-audio/ara`, { method: "POST" });
  assert.equal(disallowedMethod.status, 405, "Der Audio-Endpunkt darf keine anderen Methoden lesen.");
  assert.equal(disallowedMethod.headers.get("allow"), "GET, HEAD");
  const outsideAudio = await fetch(`${origin}/film-audio/%2e%2e%2fserver`);
  assert.equal(outsideAudio.status, 404, "Der feste Audio-Endpunkt darf keine Pfade außerhalb seiner Whitelist lesen.");
  const audioTransport = {
    fullBytes: fullBytes.length,
    partial: { status: partialAudio.status, contentRange: partialAudio.headers.get("content-range") },
    fullRange: { status: fullRange.status, contentRange: fullRange.headers.get("content-range") },
    invalid: { status: invalidRange.status, contentRange: invalidRange.headers.get("content-range") },
    head: { status: audioHead.status, contentLength: audioHead.headers.get("content-length") },
    disallowedMethod: disallowedMethod.status,
    outsideStatus: outsideAudio.status,
  };
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const film = page.getByRole("region", { name: "Produktfilm: Silvia hebt ab" });
  const start = film.getByRole("button", { name: "Produktfilm abspielen, 32 Sekunden mit Ton" });
  await page.waitForFunction(() => {
    const button = document.querySelector('[aria-label="Produktfilm abspielen, 32 Sekunden mit Ton"]');
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  }, null, { timeout: 10_000 });
  await start.scrollIntoViewIfNeeded();
  await start.click();
  const progress = film.getByRole("slider", { name: "Filmfortschritt" });
  await page.waitForFunction((element) => Number(element.getAttribute("aria-valuenow")) >= 1, await progress.elementHandle());
  const progressedAt = Number(await progress.getAttribute("aria-valuenow"));
  assert(progressedAt >= 1, "Der Film startet nicht mit sichtbarem Zeitfortschritt.");
  await page.waitForFunction(() => window.__productFilmAudios.some((audio) => audio.src.endsWith("/film-audio/ring")), null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__productFilmAudios
    .some((audio) => audio.src.endsWith("/film-audio/ara") && !audio.paused && audio.currentTime > 0.1), null, { timeout: 10_000 });
  const pause = film.getByRole("button", { name: "Pause" });
  await pause.click();
  const pausedAt = Number(await progress.getAttribute("aria-valuenow"));
  await page.waitForTimeout(1_100);
  assert.equal(Number(await progress.getAttribute("aria-valuenow")), pausedAt, "Der Filmfortschritt läuft nach Pause weiter.");
  const audioAtPause = await page.evaluate(() => window.__productFilmAudios
    .filter((audio) => audio.src.endsWith("/film-audio/ara"))
    .map((audio) => ({ paused: audio.paused, currentTime: audio.currentTime })));
  assert(audioAtPause.some((audio) => audio.paused), "Die laufende Sprachaufnahme pausiert nicht.");
  await film.getByRole("button", { name: "Abspielen" }).click();
  await page.waitForFunction(() => window.__productFilmAudios
    .some((audio) => audio.src.endsWith("/film-audio/ara") && !audio.paused && audio.currentTime > 0), null, { timeout: 5_000 });
  const resumedAudioBeforeJump = await page.evaluate(() => window.__productFilmAudios
    .filter((audio) => audio.src.endsWith("/film-audio/ara"))
    .map((audio) => audio.currentTime));
  assert(resumedAudioBeforeJump.some((currentTime) => currentTime > 0), "Fortsetzen startet die pausierte Sprachaufnahme nicht.");
  await page.waitForFunction((oldValue) => Number(document.querySelector('[aria-label="Filmfortschritt"]')?.getAttribute("aria-valuenow")) > oldValue, pausedAt, { timeout: 5_000 });
  await film.getByRole("button", { name: "Pause" }).click();
  const pausedForJumpAt = Number(await progress.getAttribute("aria-valuenow"));
  const warmProgressBox = await progress.boundingBox();
  assert(warmProgressBox, "Der sichtbare Filmfortschritt hat keine Klickfläche.");
  await page.mouse.click(warmProgressBox.x + warmProgressBox.width * 0.1, warmProgressBox.y + warmProgressBox.height / 2);
  await page.waitForFunction((previous) => Number(document.querySelector('[aria-label="Filmfortschritt"]')?.getAttribute("aria-valuenow")) < previous, pausedForJumpAt);
  const jumpedBackAt = Number(await progress.getAttribute("aria-valuenow"));
  assert(jumpedBackAt < pausedForJumpAt, "Rückwärtsspringen bewegt den sichtbaren Filmfortschritt nicht.");
  assert.equal(await film.getByRole("button", { name: "Abspielen" }).count(), 1, "Springen darf einen pausierten Film nicht wieder starten.");
  await page.mouse.click(warmProgressBox.x + warmProgressBox.width * 0.15, warmProgressBox.y + warmProgressBox.height / 2);
  await page.waitForFunction((previous) => Number(document.querySelector('[aria-label="Filmfortschritt"]')?.getAttribute("aria-valuenow")) > previous, jumpedBackAt);
  const jumpedForwardAt = Number(await progress.getAttribute("aria-valuenow"));
  assert(jumpedForwardAt > jumpedBackAt, "Vorwärtsspringen bewegt den sichtbaren Filmfortschritt nicht.");
  const audioAfterJump = await page.evaluate(() => window.__productFilmAudios
    .filter((audio) => audio.src.endsWith("/film-audio/ara"))
    .map((audio) => ({ paused: audio.paused, currentTime: audio.currentTime })));
  assert(audioAfterJump.every((audio) => audio.paused), "Springen darf Ton bei pausiertem Film nicht wiedergeben.");
  await progress.press("Home");
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Filmfortschritt"]')?.getAttribute("aria-valuenow")) === 0);
  await film.getByRole("button", { name: "Abspielen" }).click();
  await page.waitForFunction(() => window.__productFilmAudios
    .some((audio) => audio.src.endsWith("/film-audio/ara") && !audio.paused), null, { timeout: 5_000 });
  const mute = film.getByRole("button", { name: "Ton ausschalten" });
  await mute.click();
  await page.waitForFunction(() => window.__productFilmAudios.length > 0 && window.__productFilmAudios.every((audio) => audio.muted));
  const mutedAudio = await page.evaluate(() => window.__productFilmAudios.map((audio) => ({
    src: audio.src,
    muted: audio.muted,
    paused: audio.paused,
  })));
  await film.getByRole("button", { name: "Ton einschalten" }).click();
  await page.waitForFunction(() => window.__productFilmAudios.length > 0 && window.__productFilmAudios.every((audio) => !audio.muted));
  const unmutedAudio = await page.evaluate(() => window.__productFilmAudios.map((audio) => ({
    src: audio.src,
    muted: audio.muted,
    paused: audio.paused,
  })));
  await film.getByRole("button", { name: "Pause" }).click();
  const progressBox = await progress.boundingBox();
  assert(progressBox, "Der sichtbare Filmfortschritt hat keine Klickfläche.");
  await page.mouse.click(progressBox.x + progressBox.width * 0.625, progressBox.y + progressBox.height / 2);
  const jumpedPastCueAt = Number(await progress.getAttribute("aria-valuenow"));
  assert(jumpedPastCueAt >= 19, "Der Sprung hinter die Sprachaufnahme ist nicht angekommen.");
  await film.getByRole("button", { name: "Abspielen" }).click();
  await page.waitForTimeout(700);
  const audioAfterPastCue = await page.evaluate(() => window.__productFilmAudios
    .filter((audio) => audio.src.endsWith("/film-audio/ara"))
    .map((audio) => ({ paused: audio.paused, currentTime: audio.currentTime })));
  assert(audioAfterPastCue.every((audio) => audio.paused), "Ein Sprung nach Ende der Sprachaufnahme startet sie erneut.");
  await film.getByRole("button", { name: "Nochmal ansehen" }).waitFor({ timeout: 20_000 });
  assert.equal(await progress.getAttribute("aria-valuenow"), "32", "Der Film endet nicht exakt bei 0:32.");
  assert.equal(await film.getByRole("button", { name: "Abspielen" }).count(), 1, "Nach Filmende muss der Film angehalten sein.");
  await film.getByRole("button", { name: "Nochmal ansehen" }).click();
  await page.waitForFunction((element) => Number(element.getAttribute("aria-valuenow")) < 3, await progress.elementHandle(), { timeout: 5_000 });
  await page.waitForFunction(() => window.__productFilmAudios.some((audio) => audio.src.endsWith("/film-audio/ring") && !audio.paused && audio.currentTime > 0), null, { timeout: 5_000 });
  const audioBeforeNavigation = await page.evaluate(() => window.__productFilmAudios.map((audio) => ({ src: audio.src, paused: audio.paused })));
  await page.getByRole("link", { name: "Preise" }).first().click();
  await page.waitForURL(/\/preise$/);
  await page.waitForFunction(() => window.__productFilmAudios.every((audio) => audio.paused), null, { timeout: 2_000 });
  const audioAfterNavigation = await page.evaluate(() => window.__productFilmAudios.map((audio) => ({ src: audio.src, paused: audio.paused })));
  assert(audioBeforeNavigation.some((audio) => !audio.paused), "Vor dem Seitenwechsel lief keine Filmtonspur.");
  assert(
    audioAfterNavigation.every((audio) => audio.paused),
    `Der Seitenwechsel stoppt laufende Filmtonspuren nicht: ${JSON.stringify(audioAfterNavigation)}`,
  );
  const directPage = await context.newPage();
  directPage.on("pageerror", (error) => browserErrors.push(error.message));
  await directPage.setViewportSize({ width: 1280, height: 900 });
  await directPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const directFilm = directPage.getByRole("region", { name: "Produktfilm: Silvia hebt ab" });
  await directPage.waitForFunction(() => {
    const button = document.querySelector('[aria-label="Produktfilm abspielen, 32 Sekunden mit Ton"]');
    const props = Object.keys(button ?? {}).find((key) => key.startsWith("__reactProps$"));
    return Boolean(props && typeof button[props]?.onClick === "function");
  });
  await directPage.evaluate(() => { window.__holdProductFilmAraMetadata = true; });
  await directFilm.getByRole("button", { name: "Produktfilm abspielen, 32 Sekunden mit Ton" }).click();
  const directProgress = directFilm.getByRole("slider", { name: "Filmfortschritt" });
  await directProgress.waitFor();
  await directFilm.getByRole("button", { name: "Pause" }).click();
  await directProgress.focus();
  await directProgress.press("Home");
  for (let step = 0; step < 6; step += 1) await directProgress.press("ArrowRight");
  await directPage.waitForFunction(() => Number(document.querySelector('[aria-label="Filmfortschritt"]')?.getAttribute("aria-valuenow")) === 6);
  const directJumpedAt = Number(await directProgress.getAttribute("aria-valuenow"));
  await directPage.waitForFunction(() => window.__heldProductFilmAraMetadata.length > 0 && window.__heldProductFilmAraMetadata.at(-1).audio.__productFilmActualReadyState() >= HTMLMediaElement.HAVE_FUTURE_DATA);
  await directFilm.getByRole("button", { name: "Ton ausschalten" }).click();
  await directFilm.getByRole("button", { name: "Abspielen" }).click();
  const directReleaseAudio = await directPage.evaluate(() => {
    window.__holdProductFilmAraMetadata = false;
    for (const { audio, listener } of window.__heldProductFilmAraMetadata.splice(0)) {
      listener.call(audio, new Event("loadedmetadata"));
    }
    return window.__productFilmAudios
      .filter((audio) => audio.src.endsWith("/film-audio/ara"))
      .map((audio) => ({ paused: audio.paused, muted: audio.muted, currentTime: audio.currentTime, duration: audio.duration, seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]), trace: audio.__productFilmTrace }));
  });
  await directPage.waitForFunction(() => window.__productFilmAudios
    .some((audio) => audio.src.endsWith("/film-audio/ara") && !audio.paused && audio.currentTime > 0), null, { timeout: 5_000 });
  const directSeekAudio = await directPage.evaluate(() => window.__productFilmAudios
    .filter((audio) => audio.src.endsWith("/film-audio/ara"))
    .map((audio) => ({ paused: audio.paused, muted: audio.muted, currentTime: audio.currentTime, duration: audio.duration, seekable: Array.from({ length: audio.seekable.length }, (_, i) => [audio.seekable.start(i), audio.seekable.end(i)]), volume: audio.volume, trace: audio.__productFilmTrace })));
  assert(
    directSeekAudio.some((audio) => audio.volume === 1 && audio.muted && !audio.paused && audio.currentTime >= 2.5 && audio.currentTime < 3.6),
    `Der verzögerte Direktsprung bei ${directJumpedAt}s übernimmt weder Tonzustand noch korrekte Sprachposition: responses=${JSON.stringify(audioResponses)}, release=${JSON.stringify(directReleaseAudio)}, später=${JSON.stringify(directSeekAudio)}`,
  );
  await directPage.close();
  assert.equal(browserErrors.length, 0, `Unerwartete Browserfehler: ${browserErrors.join(" | ")}`);
  const audioRequests = requests.filter((request) => filmAudioPaths.has(request.path));
  assert(audioRequests.some((request) => request.path === "/film-audio/ring"), "Der lokale Klingelton wurde nicht geladen.");
  assert(audioRequests.some((request) => request.path === "/film-audio/ara"), "Die lokale Silvia-Stimme wurde nicht geladen.");
  const result = {
    ok: true,
    progressedAt,
    pausedAt,
    jumpedForwardAt,
    jumpedBackAt,
    audioAtPause,
    audioAfterJump,
    resumedAudioBeforeJump,
    mutedAudio,
    unmutedAudio,
    jumpedPastCueAt,
    audioAfterPastCue,
    audioBeforeNavigation,
    audioAfterNavigation,
    directSeekAudio,
    directReleaseAudio,
    directJumpedAt,
    audioTransport,
    audioRequests,
    audioResponses,
    browserErrors,
    evidence,
  };
  await writeFile(join(evidence, "audit.json"), `${JSON.stringify(result)}\n`, "utf8");
  console.log(JSON.stringify(result));
} catch (error) {
  const result = { ok: false, error: error instanceof Error ? error.message : String(error), browserErrors, evidence };
  await writeFile(join(evidence, "audit.json"), `${JSON.stringify(result)}\n`, "utf8");
  console.error(JSON.stringify(result));
  throw error;
} finally {
  clearTimeout(watchdog);
  await context.close();
  await browser.close();
}
