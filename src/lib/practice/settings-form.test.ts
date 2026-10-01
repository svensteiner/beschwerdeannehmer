import assert from "node:assert/strict";
import { test } from "node:test";
import { extraClosedDraftRow, hourDayAnzeigeId, hourDayId, hourDayInputType, hourPresetId, hourRowCount, hourTimeId, HOUR_EXTRA_CLOSED_ID, HOUR_TIME_PRESETS, parseRetentionDays, parseSettingsProfile, RETENTION_DAYS_DEFAULT, RETENTION_DAYS_ERROR, settingsFromFields } from "./settings-form.ts";
import { ORT_CITY_EMPTY_ERROR, ANREISE_STREET_EMPTY_ERROR, ANREISE_ZIP_INVALID_ERROR, OWNER_NAME_EMPTY_ERROR, PARKPLATZ_HINT_EMPTY_ERROR, PRACTICE_NAME_EMPTY_ERROR } from "../alma/desk.ts";
import { NACHTDIENST_PHONE_EMPTY_ERROR, NACHTDIENST_PHONE_INVALID_ERROR, PRACTICE_INBOX_EMPTY_ERROR, PRACTICE_INBOX_SAME_LOGIN_ERROR, PRACTICE_PHONE_EMPTY_ERROR } from "../alma/phone.ts";
import { SIGNUP_CLOSED_TIME, SIGNUP_HOURS } from "../alma/hours.ts";

const settingsBase = {
  name: "Tafel Graz Settings",
  street: "Herrengasse 42",
  zip: "8010",
  city: "Graz",
  bundesland: "Steiermark",
  phone: "0316 73 59 40",
  whatsapp: "0664 55 67 40",
  email: "rezeption.settings@ordination.example.com",
  locationHint: "Parkplatz hinter dem Haus",
  nachtdienstName: "Nachtklinik Graz",
  nachtdienstPhone: "0316 80 12 34",
  nachtdienstNote: "Klingel im 2. Hof",
  notes: "Mittwoch nur Kastrationen.",
  ownerName: "Dr. Stein",
  retentionDays: "90",
};

const settingsCurrent = {
  loginEmail: "kassa.settings@example.com",
  bundesland: "Steiermark",
  locationHint: "Parkplatz hinter dem Haus",
  nachtdienstName: "Nachtklinik Graz",
  nachtdienstPhone: "0316 80 12 34",
  notes: "Mittwoch nur Kastrationen.",
  ownerName: "Dr. Stein",
  whatsapp: "0664 55 67 40",
  nachtdienstNote: "Klingel im 2. Hof",
  zip: "8010",
  street: "Herrengasse 42",
  email: "rezeption.settings@ordination.example.com",
  phone: "0316 73 59 40",
  city: "Graz",
  name: "Tafel Graz Settings",
  retentionDays: 90,
};

test("Speichern keeps street and Anreise from the fields, not stale React state", () => {
  const stale = { street: "tädter Straße 28", locationHint: "" };
  const dom: Record<string, string> = {
    name: "Tierordination Gloggnitz",
    ownerName: "Dr. Stein",
    street: "Josefstädter Straße 28",
    zip: "1080",
    city: "Wien",
    bundesland: "Wien",
    phone: "02662 123 45",
    whatsapp: "02662 123 45",
    email: "kassa@example.com",
    pms: "Vquadrat Veterinär",
    locationHint: "S-Bahn Gloggnitz, Parkplatz hinter dem Haus.",
    nachtdienstName: "Bereitschaft",
    nachtdienstPhone: "02622 90 000",
    nachtdienstNote: "",
    notes: "",
    [hourDayId(0)]: "Montag",
    [hourTimeId(0)]: "8:00–12:00",
    [hourDayId(1)]: "Dienstag",
    [hourTimeId(1)]: "geschlossen · Nachtdienst",
  };
  const saved = settingsFromFields((id) => dom[id] ?? "", 2, [{ day: "Montag", time: "alt" }]);
  assert.equal(saved.street, "Josefstädter Straße 28");
  assert.notEqual(saved.street, stale.street);
  assert.match(saved.locationHint, /S-Bahn Gloggnitz/);
  assert.equal(saved.nachtdienstPhone, "02622 90 000");
  assert.deepEqual(saved.hours, [
    { day: "Montag", time: "8:00–12:00" },
    { day: "Dienstag", time: "geschlossen · Nachtdienst" },
  ]);
});

test("hourRowCount follows the fields, not a stale React length", () => {
  const ids = new Set([hourDayId(0), hourDayId(1), hourDayId(2)]);
  assert.equal(hourRowCount((id) => ids.has(id), 7), 3);
  assert.equal(hourRowCount(() => false, 7), 7);
});

test("hour presets are hinterlegte windows, not Huber leftovers in the label", () => {
  assert.equal(hourPresetId(2, "voll"), "hour-preset-voll-2");
  const voll = HOUR_TIME_PRESETS.find((p) => p.id === "voll");
  const morning = HOUR_TIME_PRESETS.find((p) => p.id === "vormittag");
  const closed = HOUR_TIME_PRESETS.find((p) => p.id === "zu");
  assert.equal(voll?.time, "8:00–12:00, 14:00–18:00");
  assert.equal(morning?.time, "8:00–12:00");
  assert.equal(closed?.time, "geschlossen · Nachtdienst");
  const blob = HOUR_TIME_PRESETS.map((p) => p.label).join(" ").toLowerCase();
  assert.equal(blob.includes("huber"), false);
  assert.equal(blob.includes("josefstadt"), false);
  const wed = SIGNUP_HOURS.find((h) => h.day === "Mittwoch");
  const sat = SIGNUP_HOURS.find((h) => h.day === "Samstag");
  assert.equal(wed?.time, voll?.time);
  assert.equal(sat?.time, closed?.time);
});

test("Extra geschlossen chip seeds the next open weekday, not today", () => {
  const friday = extraClosedDraftRow(SIGNUP_HOURS, "2026-08-28");
  assert.deepEqual(friday, { day: "2026-08-31", time: SIGNUP_CLOSED_TIME });
  assert.notEqual(friday.day, "2026-08-28");
  const mondayClosed = [...SIGNUP_HOURS, { day: "2026-08-31", time: SIGNUP_CLOSED_TIME }];
  assert.equal(extraClosedDraftRow(mondayClosed, "2026-08-28").day, "2026-09-01");
});

test("Speichern stores extra closed days as ISO so the date picker can reopen them", () => {
  assert.equal(HOUR_EXTRA_CLOSED_ID, "hour-extra-closed");
  assert.equal(hourDayAnzeigeId(7), "hour-day-anzeige-7");
  assert.equal(hourDayInputType("Montag"), "text");
  assert.equal(hourDayInputType("2026-08-27"), "date");
  assert.equal(hourDayInputType("27.8.2026"), "text");
  const saved = settingsFromFields(
    (id) =>
      ({
        name: "Tafel Graz",
        ownerName: "",
        street: "",
        zip: "",
        city: "",
        bundesland: "",
        phone: "",
        whatsapp: "",
        email: "",
        pms: "",
        locationHint: "",
        nachtdienstName: "",
        nachtdienstPhone: "",
        nachtdienstNote: "",
        notes: "",
        [hourDayId(0)]: "Donnerstag",
        [hourTimeId(0)]: "8:00–12:00, 14:00–18:00",
        [hourDayId(1)]: "27.8.2026",
        [hourTimeId(1)]: "geschlossen · Nachtdienst",
      })[id] ?? "",
    2,
  );
  assert.deepEqual(saved.hours, [
    { day: "Donnerstag", time: "8:00–12:00, 14:00–18:00" },
    { day: "2026-08-27", time: "geschlossen · Nachtdienst" },
  ]);
});

test("Speichern keeps Bundesland and inbox, never falls back to Anmelden", () => {
  const kept = parseSettingsProfile({ ...settingsBase, bundesland: "" }, settingsCurrent);
  assert.equal(kept.ok, true);
  if (kept.ok) {
    assert.equal(kept.value.bundesland, "Steiermark");
    assert.equal(kept.value.email, "rezeption.settings@ordination.example.com");
    assert.equal(kept.value.locationHint, "Parkplatz hinter dem Haus");
    assert.equal(kept.value.nachtdienstName, "Nachtklinik Graz");
    assert.equal(kept.value.nachtdienstPhone, "0316 80 12 34");
    assert.equal(kept.value.notes, "Mittwoch nur Kastrationen.");
    assert.equal(kept.value.ownerName, "Dr. Stein");
  }
  const emptyInboxKeeps = parseSettingsProfile({ ...settingsBase, email: "" }, settingsCurrent);
  assert.equal(emptyInboxKeeps.ok, true);
  if (emptyInboxKeeps.ok) {
    assert.equal(emptyInboxKeeps.value.email, "rezeption.settings@ordination.example.com");
    assert.notEqual(emptyInboxKeeps.value.email, settingsCurrent.loginEmail);
  }
  const nextInbox = parseSettingsProfile(
    { ...settingsBase, email: "rezeption.neu@ordination.example.com" },
    settingsCurrent,
  );
  if (nextInbox.ok) assert.equal(nextInbox.value.email, "rezeption.neu@ordination.example.com");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, email: "" }, { ...settingsCurrent, email: "" }),
    { ok: false, error: PRACTICE_INBOX_EMPTY_ERROR },
  );
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, email: "" }, { ...settingsCurrent, email: settingsCurrent.loginEmail }),
    { ok: false, error: PRACTICE_INBOX_SAME_LOGIN_ERROR },
  );
  const sameLogin = parseSettingsProfile(
    { ...settingsBase, email: "kassa.settings@example.com" },
    settingsCurrent,
  );
  assert.deepEqual(sameLogin, { ok: false, error: PRACTICE_INBOX_SAME_LOGIN_ERROR });
  const emptyHint = parseSettingsProfile({ ...settingsBase, locationHint: "" }, settingsCurrent);
  assert.equal(emptyHint.ok, true);
  if (emptyHint.ok) {
    assert.equal(emptyHint.value.locationHint, "Parkplatz hinter dem Haus");
    assert.doesNotMatch(emptyHint.value.locationHint, /Josefstadt|U2 Rathaus/i);
  }
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, locationHint: "" }, { ...settingsCurrent, locationHint: "" }),
    { ok: false, error: PARKPLATZ_HINT_EMPTY_ERROR },
  );
  const emptyNameKeeps = parseSettingsProfile({ ...settingsBase, name: "" }, settingsCurrent);
  assert.equal(emptyNameKeeps.ok, true);
  if (emptyNameKeeps.ok) {
    assert.equal(emptyNameKeeps.value.name, "Tafel Graz Settings");
    assert.doesNotMatch(emptyNameKeeps.value.name, /Huber|Josefstadt/i);
  }
  const nextName = parseSettingsProfile({ ...settingsBase, name: "Tafel Knittelfeld" }, settingsCurrent);
  if (nextName.ok) assert.equal(nextName.value.name, "Tafel Knittelfeld");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, name: "" }, { ...settingsCurrent, name: "" }),
    { ok: false, error: PRACTICE_NAME_EMPTY_ERROR },
  );
  const emptyCityKeeps = parseSettingsProfile({ ...settingsBase, city: "" }, settingsCurrent);
  assert.equal(emptyCityKeeps.ok, true);
  if (emptyCityKeeps.ok) {
    assert.equal(emptyCityKeeps.value.city, "Graz");
    assert.doesNotMatch(emptyCityKeeps.value.city, /Wien|Josefstadt/i);
  }
  const nextCity = parseSettingsProfile({ ...settingsBase, city: "Knittelfeld" }, settingsCurrent);
  if (nextCity.ok) assert.equal(nextCity.value.city, "Knittelfeld");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, city: "" }, { ...settingsCurrent, city: "" }),
    { ok: false, error: ORT_CITY_EMPTY_ERROR },
  );
  const emptyStreetKeeps = parseSettingsProfile({ ...settingsBase, street: "" }, settingsCurrent);
  assert.equal(emptyStreetKeeps.ok, true);
  if (emptyStreetKeeps.ok) {
    assert.equal(emptyStreetKeeps.value.street, "Herrengasse 42");
    assert.doesNotMatch(emptyStreetKeeps.value.street, /Josefstadt|Josefstädter|1080/i);
  }
  const nextStreet = parseSettingsProfile(
    { ...settingsBase, street: "Hauptplatz 1" },
    settingsCurrent,
  );
  if (nextStreet.ok) assert.equal(nextStreet.value.street, "Hauptplatz 1");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, street: "" }, { ...settingsCurrent, street: "" }),
    { ok: false, error: ANREISE_STREET_EMPTY_ERROR },
  );
  const emptyPhoneKeeps = parseSettingsProfile({ ...settingsBase, phone: "" }, settingsCurrent);
  assert.equal(emptyPhoneKeeps.ok, true);
  if (emptyPhoneKeeps.ok) {
    assert.equal(emptyPhoneKeeps.value.phone, "0316 73 59 40");
    assert.doesNotMatch(emptyPhoneKeeps.value.phone, /405\s*12\s*88|Huber|Josefstadt/i);
  }
  const nextPhone = parseSettingsProfile({ ...settingsBase, phone: "0316 80 12 34" }, settingsCurrent);
  if (nextPhone.ok) assert.equal(nextPhone.value.phone, "0316 80 12 34");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, phone: "" }, { ...settingsCurrent, phone: "" }),
    { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR },
  );
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, phone: "" }, { ...settingsCurrent, phone: "01 405 12 88" }),
    { ok: false, error: PRACTICE_PHONE_EMPTY_ERROR },
  );
  const emptyWhatsappKeeps = parseSettingsProfile({ ...settingsBase, whatsapp: "" }, settingsCurrent);
  assert.equal(emptyWhatsappKeeps.ok, true);
  if (emptyWhatsappKeeps.ok) {
    assert.equal(emptyWhatsappKeeps.value.whatsapp, "0664 55 67 40");
    assert.doesNotMatch(emptyWhatsappKeeps.value.whatsapp, /01 405 12 88|Huber|Josefstadt/i);
  }
  const nextWhatsapp = parseSettingsProfile(
    { ...settingsBase, whatsapp: "0664 90 80 70" },
    settingsCurrent,
  );
  assert.equal(nextWhatsapp.ok, true);
  if (nextWhatsapp.ok) assert.equal(nextWhatsapp.value.whatsapp, "0664 90 80 70");
  const noWhatsapp = parseSettingsProfile({ ...settingsBase, whatsapp: "" }, { ...settingsCurrent, whatsapp: "" });
  assert.equal(noWhatsapp.ok, true);
  if (noWhatsapp.ok) assert.equal(noWhatsapp.value.whatsapp, "");
  const festnetzWhatsapp = parseSettingsProfile({ ...settingsBase, whatsapp: "0316 73 59 40" }, settingsCurrent);
  assert.equal(festnetzWhatsapp.ok, false);
  if (!festnetzWhatsapp.ok) assert.match(festnetzWhatsapp.error, /Handy|06/);
  const emptyNightKeeps = parseSettingsProfile({ ...settingsBase, nachtdienstPhone: "" }, settingsCurrent);
  assert.equal(emptyNightKeeps.ok, true);
  if (emptyNightKeeps.ok) {
    assert.equal(emptyNightKeeps.value.nachtdienstPhone, "0316 80 12 34");
    assert.doesNotMatch(emptyNightKeeps.value.nachtdienstPhone, /Vetmeduni|25077/i);
  }
  const nextNight = parseSettingsProfile(
    { ...settingsBase, nachtdienstPhone: "0664 90 80 70" },
    settingsCurrent,
  );
  assert.equal(nextNight.ok, true);
  if (nextNight.ok) assert.equal(nextNight.value.nachtdienstPhone, "0664 90 80 70");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, nachtdienstPhone: "" }, { ...settingsCurrent, nachtdienstPhone: "" }),
    { ok: false, error: NACHTDIENST_PHONE_EMPTY_ERROR },
  );
  assert.deepEqual(parseSettingsProfile({ ...settingsBase, nachtdienstPhone: "abc" }, settingsCurrent), {
    ok: false,
    error: NACHTDIENST_PHONE_INVALID_ERROR,
  });
  const emptyNotesKeeps = parseSettingsProfile({ ...settingsBase, notes: "" }, settingsCurrent);
  assert.equal(emptyNotesKeeps.ok, true);
  if (emptyNotesKeeps.ok) {
    assert.equal(emptyNotesKeeps.value.notes, "Mittwoch nur Kastrationen.");
    assert.doesNotMatch(emptyNotesKeeps.value.notes, /Fritz|Josefstadt|Vetmeduni/i);
  }
  const nextNotes = parseSettingsProfile(
    { ...settingsBase, notes: "Impfungen nur vormittags." },
    settingsCurrent,
  );
  assert.equal(nextNotes.ok, true);
  if (nextNotes.ok) assert.equal(nextNotes.value.notes, "Impfungen nur vormittags.");
  const noNotes = parseSettingsProfile({ ...settingsBase, notes: "" }, { ...settingsCurrent, notes: "" });
  assert.equal(noNotes.ok, true);
  if (noNotes.ok) assert.equal(noNotes.value.notes, "");
  const emptyOwnerKeeps = parseSettingsProfile({ ...settingsBase, ownerName: "" }, settingsCurrent);
  assert.equal(emptyOwnerKeeps.ok, true);
  if (emptyOwnerKeeps.ok) {
    assert.equal(emptyOwnerKeeps.value.ownerName, "Dr. Stein");
    assert.doesNotMatch(emptyOwnerKeeps.value.ownerName, /Huber|Anna|Josefstadt|Fritz/i);
  }
  const nextOwner = parseSettingsProfile(
    { ...settingsBase, ownerName: "Dr. Quelle" },
    settingsCurrent,
  );
  assert.equal(nextOwner.ok, true);
  if (nextOwner.ok) assert.equal(nextOwner.value.ownerName, "Dr. Quelle");
  assert.deepEqual(
    parseSettingsProfile({ ...settingsBase, ownerName: "" }, { ...settingsCurrent, ownerName: "" }),
    { ok: false, error: OWNER_NAME_EMPTY_ERROR },
  );
  const emptyNightNoteKeeps = parseSettingsProfile({ ...settingsBase, nachtdienstNote: "" }, settingsCurrent);
  assert.equal(emptyNightNoteKeeps.ok, true);
  if (emptyNightNoteKeeps.ok) {
    assert.equal(emptyNightNoteKeeps.value.nachtdienstNote, "Klingel im 2. Hof");
    assert.doesNotMatch(emptyNightNoteKeeps.value.nachtdienstNote, /Vetmeduni|25077|Josefstadt/i);
  }
  const nextNightNote = parseSettingsProfile(
    { ...settingsBase, nachtdienstNote: "Hofeingang links" },
    settingsCurrent,
  );
  assert.equal(nextNightNote.ok, true);
  if (nextNightNote.ok) assert.equal(nextNightNote.value.nachtdienstNote, "Hofeingang links");
  const noNightNote = parseSettingsProfile(
    { ...settingsBase, nachtdienstNote: "" },
    { ...settingsCurrent, nachtdienstNote: "" },
  );
  assert.equal(noNightNote.ok, true);
  if (noNightNote.ok) assert.equal(noNightNote.value.nachtdienstNote, "");
  const placeholderNightNoteKeeps = parseSettingsProfile(
    { ...settingsBase, nachtdienstNote: "hinterlegte Nachtklinik" },
    settingsCurrent,
  );
  assert.equal(placeholderNightNoteKeeps.ok, true);
  if (placeholderNightNoteKeeps.ok) {
    assert.equal(placeholderNightNoteKeeps.value.nachtdienstNote, "Klingel im 2. Hof");
  }
  const emptyZipKeeps = parseSettingsProfile({ ...settingsBase, zip: "" }, settingsCurrent);
  assert.equal(emptyZipKeeps.ok, true);
  if (emptyZipKeeps.ok) {
    assert.equal(emptyZipKeeps.value.zip, "8010");
    assert.doesNotMatch(emptyZipKeeps.value.zip, /1080|Josefstadt/i);
  }
  const nextZip = parseSettingsProfile({ ...settingsBase, zip: "8020" }, settingsCurrent);
  assert.equal(nextZip.ok, true);
  if (nextZip.ok) assert.equal(nextZip.value.zip, "8020");
  const noZip = parseSettingsProfile({ ...settingsBase, zip: "" }, { ...settingsCurrent, zip: "" });
  assert.equal(noZip.ok, true);
  if (noZip.ok) assert.equal(noZip.value.zip, "");
  assert.deepEqual(parseSettingsProfile({ ...settingsBase, zip: "801" }, settingsCurrent), {
    ok: false,
    error: ANREISE_ZIP_INVALID_ERROR,
  });
});

test("parseRetentionDays validates 7-3650, empty keeps hinterlegte Zahl", () => {
  assert.deepEqual(parseRetentionDays("30", 90), { ok: true, value: 30 });
  assert.deepEqual(parseRetentionDays("", 45), { ok: true, value: 45 });
  assert.deepEqual(parseRetentionDays(null, null), { ok: true, value: RETENTION_DAYS_DEFAULT });
  assert.deepEqual(parseRetentionDays("6", 90), { ok: false, error: RETENTION_DAYS_ERROR });
  assert.deepEqual(parseRetentionDays("3651", 90), { ok: false, error: RETENTION_DAYS_ERROR });
  assert.deepEqual(parseRetentionDays("abc", 90), { ok: false, error: RETENTION_DAYS_ERROR });
  assert.deepEqual(parseRetentionDays("7", 90), { ok: true, value: 7 });
  assert.deepEqual(parseRetentionDays("3650", 90), { ok: true, value: 3650 });
});

test("parseSettingsProfile validates retentionDays and passes it through", () => {
  const next = parseSettingsProfile({ ...settingsBase, retentionDays: "30" }, settingsCurrent);
  assert.equal(next.ok, true);
  if (next.ok) assert.equal(next.value.retentionDays, 30);
  const keepsCurrent = parseSettingsProfile(
    { ...settingsBase, retentionDays: "" },
    { ...settingsCurrent, retentionDays: 120 },
  );
  assert.equal(keepsCurrent.ok, true);
  if (keepsCurrent.ok) assert.equal(keepsCurrent.value.retentionDays, 120);
  assert.deepEqual(parseSettingsProfile({ ...settingsBase, retentionDays: "1" }, settingsCurrent), {
    ok: false,
    error: RETENTION_DAYS_ERROR,
  });
});

test("settingsFromFields trims behavior and caps it at 2000 Zeichen", () => {
  const dom: Record<string, string> = {
    name: "Tafel Graz",
    behavior: `  ${"a".repeat(2010)}  `,
  };
  const saved = settingsFromFields((id) => dom[id] ?? "", 0, []);
  assert.equal(saved.behavior.length, 2000);
  assert.equal(saved.behavior, "a".repeat(2000));
  const empty = settingsFromFields((id) => (id === "name" ? "Tafel Graz" : ""), 0, []);
  assert.equal(empty.behavior, "");
});

test("settingsFromFields trims consentNote, caps it at 200 Zeichen, and carries consentEnabled", () => {
  const dom: Record<string, string> = {
    name: "Tafel Graz",
    consentNote: `  ${"b".repeat(210)}  `,
  };
  const saved = settingsFromFields((id) => dom[id] ?? "", 0, [], true);
  assert.equal(saved.consentNote.length, 200);
  assert.equal(saved.consentNote, "b".repeat(200));
  assert.equal(saved.consentEnabled, true);
  const off = settingsFromFields((id) => dom[id] ?? "", 0, [], false);
  assert.equal(off.consentEnabled, false);
});
