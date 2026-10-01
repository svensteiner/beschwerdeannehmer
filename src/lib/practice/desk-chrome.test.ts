import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deskChrome,
  deskMobilePhoneLabel,
  deskMobilePhoneShort,
  deskMobileTabs,
  deskMobileMoreItems,
  deskMobileMoreLinkId,
  DESK_SCROLL_MT,
  deskHashId,
} from "./desk-chrome.ts";

test("desk chrome prefers live Tafel name and city over the login cookie", () => {
  const session = {
    practiceName: "Tierordination Alt",
    city: "Wien",
    userName: "Lisa Kassa",
  };
  const live = deskChrome(session, { practiceName: "Tierordination Murtal", city: "Knittelfeld" });
  assert.equal(live.practiceName, "Tierordination Murtal");
  assert.equal(live.city, "Knittelfeld");
  assert.equal(live.userName, "Lisa Kassa");
  const emptyCity = deskChrome(session, { practiceName: "Murtal", city: "" });
  assert.equal(emptyCity.city, "");
  const fallback = deskChrome(session, null);
  assert.equal(fallback.practiceName, "Tierordination Alt");
  assert.equal(fallback.city, "Wien");
});

test("phone thumb bar puts Silvia between Kalender and Protokoll, not seven cramped tabs", () => {
  const tabs = deskMobileTabs();
  assert.deepEqual(
    tabs.map((t) => t.label),
    ["Heute", "Kalender", "Protokoll", "Notfall"],
  );
  assert.equal(deskMobilePhoneShort(false), "Silvia");
  assert.equal(deskMobilePhoneLabel(false), "Silvia anrufen");
  assert.equal(deskMobilePhoneShort(true), "Leitung");
  assert.equal(deskMobilePhoneLabel(true), "An der Leitung");
});

test("Mehr on the phone holds Anrufe, Rückrufe, Akte, Training, Auswertung and Einstellungen", () => {
  const more = deskMobileMoreItems();
  assert.deepEqual(
    more.map((t) => t.label),
    ["Anrufe", "Rückrufe", "Akte", "Training", "Auswertung", "Einstellungen"],
  );
  const tabTos = new Set(deskMobileTabs().map((t) => t.to));
  for (const item of more) {
    assert.equal(tabTos.has(item.to), false);
  }
  assert.equal(deskMobileMoreLinkId("/app/anrufe"), "desk-mehr-anrufe");
  assert.equal(deskMobileMoreLinkId("/app/akte"), "desk-mehr-akte");
  assert.equal(deskMobileMoreLinkId("/app/training"), "desk-mehr-training");
  assert.equal(deskMobileMoreLinkId("/app/einstellungen"), "desk-mehr-einstellungen");
});

test("hash targets from Heute sit below the sticky h-14 header", () => {
  assert.equal(DESK_SCROLL_MT, "scroll-mt-20");
  assert.equal(deskHashId("#zeiten"), "zeiten");
  assert.equal(deskHashId("whatsapp"), "whatsapp");
  assert.equal(deskHashId(""), "");
});
