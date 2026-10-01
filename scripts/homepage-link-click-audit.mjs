// Echte Benutzerklicks auf zentrale Homepage-Header-/Footer-Links.
// Nur lokale Ziel-URLs; keine Praxisdaten und keine API-Schreibzugriffe.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL || "http://127.0.0.1:8092";
const origin = new URL(base).origin;
const tested = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  // Navigation und Assets dürfen nur vom lokalen Audit-Server kommen.
  if (url.origin === origin && request.method() === "GET") return route.continue();
  return route.abort();
});

const linksOnHome = async (page) => page.locator("header a[href], footer a[href]").evaluateAll((els) =>
  els
    .filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    })
    .map((el) => ({
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      href: el.href,
      rawHref: el.getAttribute("href") || "",
    })),
);

try {
  const home = await context.newPage();
  await home.setViewportSize({ width: 1440, height: 900 });
  await home.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const links = await linksOnHome(home);
  const internal = links.filter((link) => new URL(link.href).origin === origin);
  assert.ok(internal.length >= 6, `zu wenige sichtbare interne Header-/Footer-Links gefunden: ${internal.length}`);
  const unique = [...new Map(internal.map((link) => [`${link.text}|${link.rawHref}`, link])).values()];

  for (const link of unique) {
    const target = new URL(link.href);
    assert.equal(target.origin, origin, `Link "${link.text}" verlässt lokale Audit-URL: ${link.href}`);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const candidate = page
      .locator(`header a[href=${JSON.stringify(link.rawHref)}], footer a[href=${JSON.stringify(link.rawHref)}]`)
      .filter({ hasText: link.text })
      .first();
    assert.ok(await candidate.count(), `Klickziel fehlt: ${link.text} → ${link.rawHref}`);
    await candidate.scrollIntoViewIfNeeded();
    await candidate.click();
    await page.waitForFunction(
      (expected) => `${location.pathname}${location.search}${location.hash}` === expected,
      `${target.pathname}${target.search}${target.hash}`,
      { timeout: 5_000 },
    );
    const actual = new URL(page.url());
    assert.equal(actual.origin, origin, `Klickziel für "${link.text}" ist nicht lokal`);
    assert.equal(actual.pathname, target.pathname, `Klickziel für "${link.text}" hat falschen Pfad`);
    if (target.hash) assert.equal(actual.hash, target.hash, `Anker für "${link.text}" wurde nicht erreicht`);
    tested.push({ text: link.text, target: `${actual.pathname}${actual.hash}` });
    await page.close();
  }

  assert.ok(tested.some(({ target }) => target.includes("#features")), "Features-Anker wurde nicht geklickt");
  assert.ok(tested.some(({ target }) => target === "/preise"), "Preise wurde nicht per Klick geöffnet");
  console.log(`PASS: ${tested.length} sichtbare Homepage-Header-/Footer-Links per Klick geprüft (lokale Ziele und Anker).`);
} finally {
  await context.close();
  await browser.close();
}
