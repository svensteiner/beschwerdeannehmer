// Isolierter Browser-Mocktest: kein Mikrofon und keine bezahlten API-Aufrufe.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.AUDIT_URL;
if (!base) throw new Error("AUDIT_URL muss einen isolierten Loopback-Server benennen.");
const auditUrl = new URL(base);
if (!/^(127\.0\.0\.1|localhost)$/.test(auditUrl.hostname) || auditUrl.port === "8092")
  throw new Error("AUDIT_URL darf nur einen isolierten Loopback-Server, nie 8092, benennen.");
const origin = auditUrl.origin;
const READY_STATUS = {
  enabled: true,
  active: false,
  finalizationUncertain: false,
  persistentGuard: "ready",
  persistentGuardBlocked: false,
  sandbox: "memory",
  sandboxReady: true,
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
let createCalls = 0;
let releaseFirstCreate;
const closeSessionIds = [];
const firstCreate = new Promise((resolve) => {
  releaseFirstCreate = resolve;
});

// Routen werden von Playwright zuletzt-registriert zuerst geprüft: daher zuerst
// sperren, dann nur die drei exakten Live-Endpunkte freigeben.
await context.route("**/*", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === origin && request.method() !== "POST")
    return route.continue();
  return route.abort();
});
await context.route(`${origin}/api/live-demo/status`, (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(READY_STATUS),
  }),
);
await context.route(`${origin}/api/live-demo/create`, async (route) => {
  createCalls += 1;
  const call = createCalls;
  if (call === 1) await firstCreate;
  const id = call === 1 ? "mock-stale" : "mock-current";
  await route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({ session: { id }, transport: { sdp: "answer" } }),
  });
});
await context.route(`${origin}/api/live-demo/close`, async (route) => {
  closeSessionIds.push(
    JSON.parse(route.request().postData() || "{}").sessionId,
  );
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  });
});
await context.addInitScript(() => {
  const audit = { pcs: [], tracks: [], channels: [], getUserMediaCalls: 0 };
  Object.defineProperty(window, "__liveAudit", { value: audit });
  navigator.mediaDevices.getUserMedia = async () => {
    audit.getUserMediaCalls += 1;
    const track = {
      kind: "audio",
      stopped: false,
      stop() {
        this.stopped = true;
      },
    };
    audit.tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  globalThis.RTCPeerConnection = class {
    iceGatheringState = "complete";
    localDescription = { sdp: "offer" };
    closed = false;
    ontrack = null;
    constructor() {
      audit.pcs.push(this);
    }
    createDataChannel() {
      const channel = {
        readyState: "open",
        onmessage: null,
        onclose: null,
        close() {
          this.readyState = "closed";
        },
        send() {},
      };
      audit.channels.push(channel);
      return channel;
    }
    async createOffer() {
      return {};
    }
    async setLocalDescription() {}
    async setRemoteDescription() {}
    addTrack() {}
    addEventListener() {}
    removeEventListener() {}
    close() {
      this.closed = true;
    }
  };
});
try {
  const page = await context.newPage();
  await page.goto(`${origin}/sprechen`);
  await waitForLiveReady(page);
  const start = page.getByRole("button", { name: "Hörprobe starten" });
  await start.click();
  await page.waitForFunction(
    () =>
      window.__liveAudit.pcs.length === 1 &&
      window.__liveAudit.tracks.length === 1,
  );
  await page.waitForTimeout(50);
  assert.equal(
    createCalls,
    1,
    "der erste, verzögerte Start muss Create erreichen",
  );
  await page.getByRole("button", { name: "Stoppen" }).click();
  assert.equal(
    await page.evaluate(() => window.__liveAudit.tracks[0].stopped),
    true,
    "Stoppen schaltet das erste Mikrofon sofort aus",
  );
  await page.waitForTimeout(3_100);
  await expectStatus(page, /unsicher/);
  await start.click();
  await page.waitForFunction(
    () =>
      window.__liveAudit.pcs.length === 2 &&
      window.__liveAudit.tracks.length === 2,
  );
  await page.waitForTimeout(50);
  assert.equal(
    createCalls,
    2,
    "der zweite Lauf startet trotz alter, hängender Antwort neu",
  );
  await page.evaluate(() =>
    window.__liveAudit.channels[1].onmessage?.({
      data: JSON.stringify({ type: "session.started" }),
    }),
  );
  await expectStatus(page, /Verbunden/);
  releaseFirstCreate();
  await page.waitForFunction(() => window.__liveAudit.pcs[0].closed === true);
  await page.waitForTimeout(100);
  assert.deepEqual(
    closeSessionIds,
    ["mock-stale"],
    "die verspätete Antwort schließt nur ihre eigene Sitzung",
  );
  const audit = await page.evaluate(() => window.__liveAudit);
  assert.equal(audit.pcs[1].closed, false, "der zweite RTC-Lauf bleibt offen");
  assert.equal(audit.tracks[1].stopped, false, "das zweite Mikrofon bleibt an");
  await expectStatus(page, /Verbunden/);
  await page.locator('a[href="/"]').first().click();
  await page.waitForFunction(
    () =>
      window.__liveAudit.tracks[1].stopped === true &&
      window.__liveAudit.pcs[1].closed === true,
  );
  await page.waitForTimeout(50);
  assert.deepEqual(
    closeSessionIds,
    ["mock-stale", "mock-current"],
    "beim Verlassen wird nur die noch aktive Sitzung zusätzlich geschlossen",
  );
  await runLifecycleMockTests(browser, origin);
  await runIsolatedContext(browser, origin, "Netzwerkfehler zeigt verständliche Meldung", async (page) => {
    await waitForLiveReady(page);
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 1);
    await expectStatus(page, /Live-Verbindung ist derzeit nicht erreichbar/);
    assert.equal(await page.getByText(/Failed to fetch|NetworkError/).count(), 0);
  }, { rejectCreateCalls: [1] });
  console.log(
    "PASS: exakte Mock-POSTs; Stop schaltet Mikrofon sofort aus; verspätete erste Antwort schließt nur mock-stale; zweiter Lauf bleibt live; Verlassen schließt mock-current.",
  );
} finally {
  await context.close();
  await browser.close();
}

async function runLifecycleMockTests(browser, origin) {
  for (const [label, status, expected] of [
    ["Deaktivierte Hörprobe bleibt vor Mikrofon gesperrt", { ...READY_STATUS, enabled: false }, /noch nicht freigegeben/i],
    ["Text statt Boolean für enabled blockiert vor Mikrofon", { ...READY_STATUS, enabled: "true" }, /noch nicht freigegeben/i],
    ["Null für enabled blockiert vor Mikrofon", { ...READY_STATUS, enabled: null }, /noch nicht freigegeben/i],
    ["Aktive Live-Sitzung bleibt vor Mikrofon gesperrt", { ...READY_STATUS, active: true }, /läuft bereits/i],
    ["Unsichere Finalisierung bleibt vor Mikrofon gesperrt", { ...READY_STATUS, finalizationUncertain: true }, /nicht abschließend bestätigt/i],
    ["Persistenter Guard blockiert vor Mikrofon", { ...READY_STATUS, persistentGuard: "blocked", persistentGuardBlocked: true }, /nicht abschließend bestätigt/i],
    ["Nicht eingerichteter Guard blockiert vor Mikrofon", { ...READY_STATUS, persistentGuard: "unconfigured", persistentGuardBlocked: true }, /nicht sicher eingerichtet/i],
    ["Nicht verfügbarer Guard blockiert vor Mikrofon", { ...READY_STATUS, persistentGuard: "unavailable", persistentGuardBlocked: true }, /nicht verfügbar/i],
    ["Fehlender Guard-Status blockiert vor Mikrofon", { enabled: true, active: false, finalizationUncertain: false, persistentGuardBlocked: false, sandbox: "memory", sandboxReady: true }, /Schutzstatus.*unklar/i],
    ["Unklarer Aktiv-Status blockiert vor Mikrofon", { ...READY_STATUS, active: "unknown" }, /Schutzstatus.*unklar/i],
    ["Fehlender Finalisierungs-Status blockiert vor Mikrofon", { enabled: true, active: false, persistentGuard: "ready", persistentGuardBlocked: false, sandbox: "memory", sandboxReady: true }, /Schutzstatus.*unklar/i],
    ["Widersprüchlicher Guard-Indikator blockiert vor Mikrofon", { ...READY_STATUS, persistentGuardBlocked: true }, /Schutzstatus.*unklar/i],
  ]) {
    await runIsolatedContext(browser, origin, label, async (page, audit) => {
      await expectStatus(page, expected);
      assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
      assert.equal(audit.createCalls(), 0, "kein Create-POST vor sicherer Freigabe");
      await page.getByRole("button", { name: "Verfügbarkeit erneut prüfen" }).click();
      await expectStatus(page, expected);
      assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
      assert.equal(audit.createCalls(), 0, "auch Status-Retry startet keine Sitzung");
    }, { statuses: [status] });
  }

  await runIsolatedContext(browser, origin, "Sichere Statusprüfung lässt erneuten Start zu", async (page, audit) => {
    await expectStatus(page, /nicht abschließend bestätigt/i);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await page.getByRole("button", { name: "Verfügbarkeit erneut prüfen" }).click();
    await waitForLiveReady(page);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 1 && window.__liveAudit.getUserMediaCalls === 1);
    assert.equal(audit.createCalls(), 1);
  }, { statuses: [{ ...READY_STATUS, persistentGuard: "blocked", persistentGuardBlocked: true }, READY_STATUS] });

  await runIsolatedContext(browser, origin, "Frischer Startstatus blockiert trotz zuvor bereiter Anzeige", async (page, audit) => {
    await waitForLiveReady(page);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await expectStatus(page, /nicht abschließend bestätigt/i);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    assert.equal(audit.createCalls(), 0, "ein frischer Sperrstatus darf den sichtbaren Bereitschaftsstand nicht umgehen");
  }, { statuses: [READY_STATUS, { ...READY_STATUS, persistentGuard: "blocked", persistentGuardBlocked: true }] });

  await runIsolatedContext(browser, origin, "Statusfehler bleibt vor Mikrofon und erlaubt Retry", async (page, audit) => {
    await expectStatus(page, /konnte nicht geprüft werden/i);
    assert.equal(audit.createCalls(), 0);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await page.getByRole("button", { name: "Verfügbarkeit erneut prüfen" }).click();
    await waitForLiveReady(page);
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 1);
  }, { rejectStatusCalls: [1] });

  await runIsolatedContext(browser, origin, "Status-Zeitüberschreitung lässt Neustart zu", async (page, audit) => {
    await waitForLiveReady(page);
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await expectStatus(page, /vor dem Start erneut geprüft/);
    await page.waitForTimeout(15_500);
    await expectStatus(page, /fehlgeschlagen|nicht gestartet|nicht erreichbar|Zeitüberschreitung/i);
    audit.releaseStatus();
    await page.getByRole("button", { name: "Verfügbarkeit erneut prüfen" }).click();
    await waitForLiveReady(page);
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 1);
  }, { deferStatusCalls: [2] });

  await runIsolatedContext(browser, origin, "Create-Zeitüberschreitung lässt Neustart zu", async (page, audit) => {
    await waitForLiveReady(page);
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 1);
    await page.waitForTimeout(15_500);
    await expectStatus(page, /fehlgeschlagen|nicht gestartet|nicht erreichbar|Zeitüberschreitung/i);
    audit.releaseCreate();
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 2);
  }, { deferFirstCreate: true });

  await runIsolatedContext(browser, origin, "Stoppen während ausstehender Statusprüfung beendet sauber", async (page, audit) => {
    await waitForLiveReady(page);
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await expectStatus(page, /vor dem Start erneut geprüft/);
    await page.getByRole("button", { name: "Stoppen" }).click();
    audit.releaseStatus();
    await expectStatus(page, /Hörprobe (?:beendet|abgebrochen)/);
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 0);
  }, { deferStatusCalls: [2] });

  await runIsolatedContext(browser, origin, "Bestätigtes Stoppen endet sauber", async (page, audit) => {
    await startMockCall(page);
    await page.getByRole("button", { name: "Stoppen" }).click();
    await page.evaluate(() =>
      window.__liveAudit.channels[0].onmessage?.({
        data: JSON.stringify({ type: "session.closed" }),
      }),
    );
    await expectStatus(page, /Hörprobe (?:beendet|abgebrochen)/);
    await page.waitForTimeout(3_100);
    await expectStatus(page, /Hörprobe (?:beendet|abgebrochen)/);
    await page.waitForTimeout(100);
    assert.deepEqual(audit.closeSessionIds, ["isolated-1"]);
  });

  await runIsolatedContext(browser, origin, "Beendete Live-Audioausgabe wird freigegeben", async (page) => {
    await startMockCall(page);
    await page.evaluate(() =>
      window.__liveAudit.pcs[0].ontrack?.({ track: { kind: "audio" } }),
    );
    await page.waitForFunction(() => window.__liveAudit.audios.length === 1);
    await page.evaluate(() =>
      window.__liveAudit.channels[0].onmessage?.({
        data: JSON.stringify({ type: "session.closed" }),
      }),
    );
    await page.waitForFunction(
      () => window.__liveAudit.audios[0].pauseCalls === 1 &&
        window.__liveAudit.audios[0].srcObject === null,
    );
    assert.equal(
      await page.evaluate(() => window.__liveAudit.tracks[0].stopped),
      true,
      "Beim bestätigten Ende wird auch das Mikrofon beendet.",
    );
  });

  await runIsolatedContext(browser, origin, "Unerwartetes DataChannel-Ende bleibt unsicher", async (page, audit) => {
    await startMockCall(page);
    await page.evaluate(() => window.__liveAudit.channels[0].onclose?.());
    await expectStatus(page, /unsicher/i);
    await page.waitForTimeout(100);
    assert.deepEqual(audit.closeSessionIds, ["isolated-1"]);
  });

  await runIsolatedContext(browser, origin, "Providerfehler bleibt ohne technische Details", async (page) => {
    await startMockCall(page);
    await page.evaluate(() =>
      window.__liveAudit.channels[0].onmessage?.({
        data: JSON.stringify({
          type: "error",
          error: { message: "provider-secret: upstream request 123" },
        }),
      }),
    );
    await expectStatus(page, /Die Live-Verbindung ist fehlgeschlagen\. Bitte später erneut versuchen\./);
    assert.doesNotMatch(await page.locator("body").innerText(), /provider-secret|upstream request 123/);
    await page.waitForFunction(() =>
      window.__liveAudit.tracks[0].stopped === true &&
      window.__liveAudit.pcs[0].closed === true,
    );
  });

  await runIsolatedContext(browser, origin, "Alte session.closed-Nachricht ändert neue Sitzung nicht", async (page, audit) => {
    await startMockCall(page);
    const oldChannel = 0;
    await page.getByRole("button", { name: "Stoppen" }).click();
    await page.evaluate((index) =>
      window.__liveAudit.channels[index].onmessage?.({
        data: JSON.stringify({ type: "session.closed" }),
      }), oldChannel,
    );
    await page.getByRole("button", { name: "Hörprobe starten" }).click();
    await page.waitForFunction(() => window.__liveAudit.pcs.length === 2);
    await page.waitForFunction(() => window.__liveAudit.pcs[1].remoteReady === true);
    await page.evaluate(() =>
      window.__liveAudit.channels[1].onmessage?.({
        data: JSON.stringify({ type: "session.started" }),
      }),
    );
    await page.evaluate((index) =>
      window.__liveAudit.channels[index].onmessage?.({
        data: JSON.stringify({ type: "session.closed" }),
      }), oldChannel,
    );
    await expectStatus(page, /Verbunden/);
    await page.evaluate((index) => {
      window.__liveAudit.channels[index].onmessage?.({
        data: JSON.stringify({ type: "session.started" }),
      });
      window.__liveAudit.channels[index].onmessage?.({
        data: JSON.stringify({ type: "session.output_transcript.delta", delta: "alte Antwort" }),
      });
    }, oldChannel);
    await expectStatus(page, /Verbunden/);
    assert.doesNotMatch(await page.locator("body").innerText(), /alte Antwort/);
    assert.deepEqual(audit.closeSessionIds, ["isolated-1"]);
  });
}

async function runIsolatedContext(browser, origin, label, scenario, options = {}) {
  const context = await browser.newContext();
  let statusCalls = 0;
  let createCalls = 0;
  let releaseStatus;
  const statusGate = new Promise((resolve) => { releaseStatus = resolve; });
  let releaseCreate;
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  const closeSessionIds = [];
  try {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin && request.method() !== "POST") return route.continue();
      return route.abort();
    });
    await context.route(`${origin}/api/live-demo/status`, async (route) => {
      statusCalls += 1;
      if (options.rejectStatusCalls?.includes(statusCalls)) return route.abort();
      if (options.deferStatusCalls?.includes(statusCalls)) await statusGate;
      const status = Array.isArray(options.statuses)
        ? options.statuses[Math.min(statusCalls - 1, options.statuses.length - 1)]
        : options.status ?? READY_STATUS;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(status),
      });
    });
    await context.route(`${origin}/api/live-demo/create`, async (route) => {
      createCalls += 1;
      if (options.rejectCreateCalls?.includes(createCalls)) return route.abort();
      if (options.deferFirstCreate && createCalls === 1) await createGate;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          session: { id: `isolated-${createCalls}` },
          transport: { sdp: "answer" },
        }),
      });
    });
    await context.route(`${origin}/api/live-demo/close`, (route) => {
      closeSessionIds.push(JSON.parse(route.request().postData() || "{}").sessionId);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await context.addInitScript(lifecycleBrowserMocks);
    const page = await context.newPage();
    await page.goto(`${origin}/sprechen`);
    if (!options.deferStatusCalls?.includes(1))
      await page.waitForFunction(
        () => {
          const button = document.querySelector("#silvia-live-demo button");
          return Boolean(button) && !button.textContent?.includes("Verfügbarkeit wird geprüft");
        },
      );
    await scenario(page, { releaseStatus, releaseCreate, closeSessionIds, createCalls: () => createCalls });
    console.log(`PASS: ${label}`);
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  } finally {
    await context.close();
  }
}

async function startMockCall(page) {
  await waitForLiveReady(page);
  await page.getByRole("button", { name: "Hörprobe starten" }).click();
  await page.waitForFunction(() => window.__liveAudit.pcs.length === 1);
  await page.waitForFunction(() => window.__liveAudit.pcs[0].remoteReady === true);
  await page.evaluate(() =>
    window.__liveAudit.channels[0].onmessage?.({
      data: JSON.stringify({ type: "session.started" }),
    }),
  );
  await expectStatus(page, /Verbunden/);
}

async function waitForLiveReady(page) {
  await page.waitForFunction(
    () => document.querySelector("#silvia-live-demo button")?.textContent?.includes("Hörprobe starten"),
  );
  const consent = page.getByRole("checkbox", { name: "Ich bestätige: Ich nenne ausschließlich erfundene Demo-Inhalte." });
  const start = page.getByRole("button", { name: "Hörprobe starten" });
  if (!await consent.isChecked()) {
    assert.equal(await start.isDisabled(), true, "ohne Live-Einwilligung bleibt der Mikrofonstart gesperrt");
    assert.deepEqual(await page.evaluate(() => ({ pcs: window.__liveAudit.pcs.length, getUserMediaCalls: window.__liveAudit.getUserMediaCalls })), { pcs: 0, getUserMediaCalls: 0 });
    await consent.check();
  }
  assert.equal(await start.isDisabled(), false, "nach aktiver Live-Einwilligung wird nur der Startknopf freigegeben");
}

function lifecycleBrowserMocks() {
  const audit = { pcs: [], tracks: [], channels: [], audios: [], getUserMediaCalls: 0 };
  Object.defineProperty(window, "__liveAudit", { value: audit });
  navigator.mediaDevices.getUserMedia = async () => {
    audit.getUserMediaCalls += 1;
    const track = { stopped: false, stop() { this.stopped = true; } };
    audit.tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  };
  globalThis.RTCPeerConnection = class {
    iceGatheringState = "complete";
    localDescription = { sdp: "offer" };
    closed = false;
    ontrack = null;
    constructor() { audit.pcs.push(this); }
    createDataChannel() {
      const channel = {
        readyState: "open",
        onmessage: null,
        onclose: null,
        close() { this.readyState = "closed"; },
        send() {},
      };
      audit.channels.push(channel);
      return channel;
    }
    async createOffer() { return {}; }
    async setLocalDescription() {}
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      this.remoteReady = true;
    }
    addTrack() {}
    addEventListener() {}
    removeEventListener() {}
    close() { this.closed = true; }
  };
  globalThis.MediaStream = class {
    constructor(tracks) { this.tracks = tracks; }
  };
  globalThis.Audio = class {
    autoplay = false;
    srcObject = null;
    pauseCalls = 0;
    constructor() { audit.audios.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.pauseCalls += 1; }
  };
}

async function expectStatus(page, text) {
  await page.waitForFunction(
    (source) =>
      new RegExp(source).test(
        document.querySelector("#silvia-live-demo-status")?.textContent || "",
      ),
    text.source,
  );
}
