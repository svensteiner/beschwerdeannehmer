// Bedienabnahme der sichtbaren Homepage-Controls. Nur lokale GETs und genau
// ein erwarteter Demo-POST sind erlaubt; alles andere wird blockiert.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
assert.ok(base, "AUDIT_URL muss auf den isolierten lokalen Audit-Server zeigen");
const auditUrl = new URL(base);
assert.equal(auditUrl.protocol, "http:", "Nur lokale HTTP-Auditserver sind zulässig");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(auditUrl.hostname), "Nur Loopback-Auditserver sind zulässig");
assert.notEqual(auditUrl.port, "8092", "Die bestehende Installation auf 8092 bleibt unberührt");
const origin = auditUrl.origin;
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const evidenceDir = path.join(os.tmpdir(), `silvia-homepage-controls-${stamp}`);
await fs.mkdir(evidenceDir, { recursive: true });
const rows = [];
const allowed = new Map();
const blocked = new Map();
const demoPosts = [];
const localServerFnBase = "/_serverFn/";
const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const add = (name, status, evidence) => rows.push({ name, status, evidence });
async function waitExpanded(locator, label) {
  await locator.waitFor({ state: "visible" });
  await locator.evaluate(async (el) => {
    await new Promise((resolve) => {
      const start = performance.now();
      const check = () => {
        const done = el.scrollHeight > 0 && el.clientHeight >= el.scrollHeight - 1;
        if (done || performance.now() - start > 3000) resolve(); else requestAnimationFrame(check);
      };
      check();
    });
  });
  const sizes = await locator.evaluate((el) => ({ clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }));
  assert.ok(sizes.scrollHeight > 0 && sizes.clientHeight >= sizes.scrollHeight - 1, `${label}: Antwort abgeschnitten (${JSON.stringify(sizes)})`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route("**/*", async (route) => {
  const req = route.request(); const u = new URL(req.url()); const key = `${req.method()} ${u.origin}`;
  const localGet = u.origin === origin && req.method() === "GET";
  const localDemoPost = u.origin === origin && req.method() === "POST" && u.pathname.startsWith(localServerFnBase);
  if (localGet) { bump(allowed, key); return route.continue(); }
  if (localDemoPost) {
    demoPosts.push(u.pathname);
    bump(allowed, key);
    return route.continue();
  }
  bump(blocked, key); return route.abort();
});

async function homepage(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`);
  const controls = await page.locator("a,button").evaluateAll((els) => els.filter((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }).map((el) => ({ tag: el.tagName, text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 80), href: el.getAttribute("href"), id: el.id })));
  assert.ok(controls.length > 0, `no visible controls at ${width}px`);
  add(`sichtbare Homepage-Controls ${width}px`, "BESTANDEN", `${controls.length} Controls aus DOM; ${JSON.stringify(controls.slice(0, 12))}`);
  return page.locator("a[href]").evaluateAll((els) => els.filter((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }).map((el) => ({ text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 80), href: el.href })));
}

async function checkLocalGet(url) {
  let current = new URL(url);
  for (let hop = 0; hop <= 5; hop += 1) {
    assert.equal(current.origin, origin, `externer Redirect bei ${url}: ${current.href}`);
    const response = await context.request.get(current.href, { maxRedirects: 0 });
    if (response.status() >= 200 && response.status() < 300) return response.status();
    if (response.status() >= 300 && response.status() < 400) {
      const location = response.headers().location;
      assert.ok(location, `Redirect ohne Location bei ${current.href}`);
      current = new URL(location, current.href);
      continue;
    }
    return response.status();
  }
  throw new Error(`mehr als 5 lokale Redirects bei ${url}`);
}

async function checkAnchors(page, links, label) {
  const internal = [...new Map(links.filter((a) => a.href.startsWith(origin)).map((a) => [a.href, a])).values()];
  const badTargets = [];
  const targetPage = await context.newPage();
  for (const a of internal.slice(0, 200)) {
    const u = new URL(a.href);
    const status = await checkLocalGet(a.href).catch((error) => { badTargets.push(`${a.text || "(ohne Text)"} → ${u.pathname} (${error.message})`); return null; });
    if (status !== null && (status < 200 || status >= 300)) badTargets.push(`${a.text || "(ohne Text)"} → ${u.pathname} (${status})`);
    if (u.hash && status !== null && status >= 200 && status < 300) {
      await targetPage.goto(`${origin}${u.pathname}${u.search}`, { waitUntil: "domcontentloaded" });
      const id = decodeURIComponent(u.hash.slice(1)).replaceAll('"', "\\\"");
      if (!(await targetPage.locator(`[id="${id}"]`).count())) badTargets.push(`${a.text || "(ohne Text)"} → ${u.pathname}${u.hash} (Anchor fehlt)`);
    }
  }
  await targetPage.close();
  assert.equal(badTargets.length, 0, `${label}: ${badTargets.join("; ")}`);
  return internal.length;
}

try {
  const desktop = await context.newPage();
  const desktopAnchors = await homepage(desktop, 1440);
  const mobile = await context.newPage();
  const mobileAnchors = await homepage(mobile, 320);
  const desktopCount = await checkAnchors(desktop, desktopAnchors, "Desktop interne Ziele/Anchors");
  const mobileCount = await checkAnchors(mobile, mobileAnchors, "Mobile interne Ziele/Anchors");
  add("Homepage Header/Footer-Links und Anchors", "BESTANDEN", `${desktopCount} Desktop- und ${mobileCount} Mobile-Ziele geprüft`);

  const faqTriggers = desktop.locator("#desk-home-faq button[aria-expanded]");
  const faqCount = await faqTriggers.count();
  assert.ok(faqCount > 0, "keine sichtbaren FAQ-Trigger");
  for (let i = 0; i < faqCount; i += 1) {
    const trigger = faqTriggers.nth(i);
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "open", `FAQ ${i + 1} öffnet nicht`);
    const answer = trigger.locator("xpath=ancestor::div[@data-orientation='vertical' and @data-state][1]").getByRole("region");
    await waitExpanded(answer, `FAQ ${i + 1}`);
    assert.ok(await answer.isVisible(), `FAQ ${i + 1}: Antwort nicht sichtbar`);
    assert.notEqual((await answer.innerText()).trim(), "", `FAQ ${i + 1}: Antwort leer`);
    assert.doesNotMatch(await answer.innerText(), /21 Tage|Fünf Werktage|WhatsApp ist Kanal eins|Verarbeitung in der EU|30 Tage Frist/i, `FAQ ${i + 1}: alte Copy`);
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "closed", `FAQ ${i + 1} schließt nicht`);
  }
  const homepageText = await desktop.locator("body").innerText();
  assert.doesNotMatch(homepageText, /21 Tage|Fünf Werktage bis zum ersten echten Anruf|SMS geht gleich raus|SMS ist draußen|WhatsApp ist Kanal eins|verbindet den Nachtdienst/i);
  add("Homepage FAQ öffnen/schließen und ehrliche Copy", "BESTANDEN", `${faqCount} FAQ-Antworten geöffnet, sichtbar geprüft und wieder geschlossen`);

  const demo = desktop.getByRole("button", { name: /Demo anfragen|Demo und Test besprechen/i }).first();
  assert.ok(await demo.count(), "kein sichtbarer Demo-CTA");
  await demo.focus();
  await demo.click();
  const dialog = desktop.getByRole("dialog");
  await dialog.waitFor();
  const required = await dialog.locator("[required]").evaluateAll((els) => els.map((e) => e.id || e.getAttribute("name")));
  assert.ok(required.includes("practice") && required.includes("contact") && required.includes("email"), `Pflichtfelder unerwartet: ${required}`);
  const beforeRequests = total(blocked) + total(allowed);
  await dialog.locator('button[type="submit"]').click();
  await desktop.waitForTimeout(250);
  assert.equal(total(blocked) + total(allowed), beforeRequests, "Leersubmit löste einen Request aus");
  const dialogText = await dialog.innerText();
  assert.doesNotMatch(dialogText, /5 Werktage|Fünf Werktage|Mindestlaufzeit|30 Tage Frist|Vertrag automatisch/i);
  await desktop.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await desktop.waitForFunction(
    (button) => document.activeElement === button,
    await demo.elementHandle(),
    { timeout: 1_000 },
  );
  assert.equal(
    await demo.evaluate((button) => document.activeElement === button),
    true,
    "Escape im Demo-Dialog gibt den Fokus nicht an den auslösenden CTA zurück.",
  );
  await demo.click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Schließen" }).click();
  assert.ok(await dialog.isHidden().catch(() => true), "Demo-Dialog schließt nicht");
  add("Demo-Dialog öffnen/Pflichtfelder/Escape-Fokus/Schließen", "BESTANDEN", `Dialog geöffnet; Pflichtfelder ${required.join(", ")}; Escape gibt Fokus zurück; kein Request beim Leersubmit`);

  await demo.click();
  await dialog.waitFor();
  const demoData = {
    practice: "Audit Demoordination",
    contact: "Eva Beispiel",
    email: "eva@example.test",
  };
  await dialog.locator("#practice").fill(demoData.practice);
  await dialog.locator("#contact").fill(demoData.contact);
  await dialog.locator("#email").fill(demoData.email);
  const postsBeforeSuccess = demoPosts.length;
  await dialog.locator("button[type=submit]").click();
  await dialog.getByText("Danke, wir melden uns.", { exact: true }).waitFor({ timeout: 10_000 });
  assert.equal(demoPosts.length, postsBeforeSuccess + 1, "Demo-Erfolg löste nicht genau einen lokalen POST aus");
  assert.match(await dialog.innerText(), /Demo und mögliche\s+Testbedingungen/);
  await dialog.getByRole("button", { name: "Schließen", exact: true }).first().click();
  await dialog.waitFor({ state: "hidden" });
  await demo.click();
  await dialog.waitFor();
  assert.equal(await dialog.locator("#practice").inputValue(), "", "Ordinationsfeld wird nach Erfolg nicht zurückgesetzt");
  assert.equal(await dialog.locator("#contact").inputValue(), "", "Kontaktfeld wird nach Erfolg nicht zurückgesetzt");
  assert.equal(await dialog.locator("#email").inputValue(), "", "E-Mail-Feld wird nach Erfolg nicht zurückgesetzt");
  await dialog.getByRole("button", { name: "Schließen", exact: true }).first().click();
  add("Demo-Dialog lokaler Erfolgslauf/Reset", "BESTANDEN", "Synthetische Pflichtdaten mit genau einem lokalen POST versendet; sichtbare Danke-Meldung geprüft; Felder nach Abschluss zurückgesetzt");

  const protocolRows = desktop.locator('[role="link"][aria-label^="Protokoll für"]');
  assert.ok(await protocolRows.count() > 0, "keine interaktive Tageskalender-Zeile");
  for (const key of [null, "Enter", "Space"]) {
    const protocolPage = await context.newPage();
    await protocolPage.setViewportSize({ width: 1440, height: 900 });
    await protocolPage.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    const row = protocolPage.locator('[role="link"][aria-label^="Protokoll für"]').first();
    await protocolPage.waitForFunction(() => {
      const element = document.querySelector('[role="link"][aria-label^="Protokoll für"]');
      const props = Object.keys(element ?? {}).find((name) => name.startsWith("__reactProps$"));
      return Boolean(props && typeof element[props]?.onClick === "function" && typeof element[props]?.onKeyDown === "function");
    });
    await row.scrollIntoViewIfNeeded();
    if (key === null) await row.click();
    else {
      await row.focus();
      await row.press(key);
    }
    await protocolPage.waitForURL(/\/demo\/anrufe$/, { timeout: 10_000 });
    await protocolPage.close();
  }
  add("Tageskalender-Zeilen Maus/Enter/Leertaste", "BESTANDEN", "Alle drei Eingaben öffnen lokal /demo/anrufe");

  const teamTile = desktop.locator('[aria-label$="Lebenslauf anzeigen"]').first();
  assert.ok(await teamTile.count(), "keine bedienbare Teamkarte");
  await teamTile.scrollIntoViewIfNeeded();
  await teamTile.focus();
  await teamTile.press("Enter");
  assert.equal(await teamTile.getAttribute("aria-expanded"), "true", "Enter öffnet die Teamkarte nicht.");
  await desktop.keyboard.press("Escape");
  assert.equal(await teamTile.getAttribute("aria-expanded"), "false", "Escape schließt die Teamkarte nicht.");
  assert.equal(
    await desktop.evaluate(() => document.activeElement === document.body),
    true,
    "Escape löst den Fokus nicht wie vorgesehen von der geschlossenen Teamkarte.",
  );
  await teamTile.focus();
  await teamTile.press("Space");
  assert.equal(await teamTile.getAttribute("aria-expanded"), "true", "Leertaste öffnet die Teamkarte nicht.");
  await teamTile.press("Space");
  assert.equal(await teamTile.getAttribute("aria-expanded"), "false", "Zweite Leertaste schließt die Teamkarte nicht.");
  await teamTile.click();
  assert.equal(await teamTile.getAttribute("aria-expanded"), "true", "Mausklick öffnet die Teamkarte nicht.");
  await teamTile.click();
  assert.equal(await teamTile.getAttribute("aria-expanded"), "false", "Zweiter Mausklick schließt die Teamkarte nicht.");
  add("Teamkarte Enter/Leertaste/Escape/Maus", "BESTANDEN", "Enter, Leertaste und Mausklick öffnen; Escape bzw. Wiederholung schließen");

  const bodyText = await desktop.locator("body").innerText();
  assert.match(bodyText, /Silvia Premium/); assert.match(bodyText, /Silvia Live/);
  assert.match(bodyText, /Warme weibliche Stimme.*vorbereiteter Beispieltext|vorbereiteter Beispieltext.*Warme weibliche Stimme/s);
  assert.match(bodyText, /in Vorbereitung|noch nicht öffentlich aktiviert|noch nicht freigegeben|keine echte Nutzung/);
  add("Premium/Live ehrliche Labels", "BESTANDEN", "Premium als vorbereiteter Beispieltext; Live als nicht freigegebene Demo gekennzeichnet");

  const prices = await context.newPage();
  await prices.setViewportSize({ width: 1440, height: 900 });
  await prices.goto(`${base}/preise`, { waitUntil: "networkidle" });
  const priceCards = prices.locator("div.rounded-xl.border.bg-card");
  const premiumCard = priceCards.filter({ hasText: "Silvia Premium" }).first();
  const liveCard = priceCards.filter({ hasText: "Silvia Live" }).first();
  assert.ok(await premiumCard.count() && await liveCard.count(), "Premium/Live-Preiskarten fehlen");
  assert.ok(await premiumCard.getByRole("button", { name: /Demo-Anfrage/i }).count(), "Premium-CTA fehlt");
  assert.equal(await liveCard.getByRole("button").count(), 0, "Live bietet trotz fehlender öffentlicher Demo einen CTA an");
  assert.match(await liveCard.innerText(), /Separate Demo|nur isoliert und nach Freigabe/);
  const pricesFaqTriggers = prices.locator("#desk-preise-faq button[aria-expanded]");
  const pricesFaqCount = await pricesFaqTriggers.count();
  assert.ok(pricesFaqCount > 0, "keine Preise-FAQ-Trigger");
  for (let i = 0; i < pricesFaqCount; i += 1) {
    const trigger = pricesFaqTriggers.nth(i);
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "open");
    const answer = trigger.locator("xpath=ancestor::div[@data-orientation='vertical' and @data-state][1]").getByRole("region");
    await waitExpanded(answer, `Preise-FAQ ${i + 1}`);
    assert.ok(await answer.isVisible());
    assert.notEqual((await answer.innerText()).trim(), "");
    assert.doesNotMatch(await answer.innerText(), /21 Tage|Fünf Werktage|Mindestlaufzeit|WhatsApp ist Kanal eins|Verarbeitung in der EU|30 Tage Frist/i);
    await trigger.click();
    assert.equal(await trigger.getAttribute("data-state"), "closed");
  }
  assert.doesNotMatch(await prices.locator("body").innerText(), /21 Tage|Fünf Werktage|Mindestlaufzeit|WhatsApp ist Kanal eins|Verarbeitung in der EU|30 Tage Frist/i);
  add("Preise-FAQ öffnen/schließen", "BESTANDEN", `${pricesFaqCount} Preise-FAQ-Antworten geöffnet und geprüft`);
  await premiumCard.getByRole("button", { name: /Demo-Anfrage/i }).click();
  await prices.getByRole("dialog").waitFor();
  await prices.getByRole("dialog").getByRole("button", { name: "Schließen" }).click();
  add("Preise Premium/Live-CTA-Ziele", "BESTANDEN", "Premium öffnet Demo-Dialog; Live bleibt ohne CTA und als isolierte Demo nach Freigabe markiert");
  await prices.close();

  const menu = mobile.getByRole("button", { name: "Menü" });
  await menu.click();
  const sheet = mobile.locator('[role="dialog"]'); await sheet.waitFor();
  assert.ok(await sheet.getByRole("link", { name: "Preise" }).count(), "mobile Navigation enthält Preise nicht");
  await sheet.getByRole("button", { name: "Schließen" }).click();
  assert.ok(await sheet.isHidden().catch(() => true), "mobile Navigation schließt nicht");
  add("Mobile Navigation öffnen/schließen", "BESTANDEN", "Menü geöffnet, Preise sichtbar, über Schließen geschlossen");
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.screenshot({ path: path.join(evidenceDir, "homepage-1440.png"), fullPage: false });
  await mobile.screenshot({ path: path.join(evidenceDir, "homepage-320.png"), fullPage: false });
  const firstFaq = desktop.locator("#desk-home-faq button[aria-expanded]").first();
  await firstFaq.click();
  const firstFaqAnswer = firstFaq.locator("xpath=ancestor::div[@data-orientation='vertical' and @data-state][1]").getByRole("region");
  await waitExpanded(firstFaqAnswer, "Homepage FAQ Screenshot");
  await desktop.screenshot({ path: path.join(evidenceDir, "homepage-faq-open.png"), fullPage: false });
  await firstFaq.click();
  await demo.click();
  await desktop.getByRole("dialog").waitFor();
  await desktop.screenshot({ path: path.join(evidenceDir, "homepage-dialog-open.png"), fullPage: false });
  await mobile.close(); await desktop.close();

  console.log("MATRIX");
  for (const row of rows) console.log(`${row.status}\t${row.name}\t${row.evidence}`);
  console.log(`NETWORK\tallowed local=${total(allowed)}\tdemo POST=${demoPosts.length}\tblocked external/unexpected=${total(blocked)}`);
  console.log(`EVIDENCE\t${evidenceDir}`);
  if (total(blocked) > 0) console.log("BLOCKED\t" + JSON.stringify([...blocked.entries()]));
} finally { await context.close(); await browser.close(); }
