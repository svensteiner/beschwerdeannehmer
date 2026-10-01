import assert from "node:assert/strict";
import { test } from "node:test";
import { ANREISE_STREET_EMPTY_ERROR, ANREISE_ZIP_INVALID_ERROR, ORT_BUNDESLAND_INVALID_ERROR, ORT_CITY_EMPTY_ERROR, OWNER_NAME_EMPTY_ERROR, PARKPLATZ_HINT_EMPTY_ERROR, REGISTER_BUNDESLAND_EMPTY_ERROR, anreiseIncomplete, demoDesk, deskCityLabel, deskContactLine, deskFromProfile, deskLineNumber, deskWhatsappNumber, emergencySpoken, holidayNachtdienstLine, holidayReply, holidaySkipsLlm, addressReply, contactReply, inboxReply, isAddressAsk, isContactAsk, isHolidayAsk, isInboxAsk, isLeitungAsk, isLiveInfoTurn, isNachtdienstTurn, isOwnerAsk, isPracticeAsk, isTravelTurn, liveInfoOverwriteIsLocal, travelSkipsLlm, isWhatsappAsk, ownerReply, practiceReply, isLeftoverAuskunft, isLeftoverPolicyAsk, leftoverReply, leftoverSkipsLlm, livePersistStaffNote, skipLiveInternZettel, keepBundesland, keepLocationHint, keepNachtdienstName, keepNachtdienstNote, keepNotes, keepOwnerName, keepCity, keepPracticeName, keepStreet, keepZip, PRACTICE_NAME_EMPTY_ERROR, leitungSystemRule, nachtdienstReply, nachtdienstSystemRule, notesEmptySpoken, notesEmptyDeskAction, notesIncomplete, notesLiveReply, notesLiveSkipsLlm, notesSystemRule, isNotesEmptyTurn, isNotesBookingTurn, mentionedDemoPet, ortIncomplete, ortSystemRule, ownerIncomplete, ownerSystemRule, parkplatzIncomplete, parkplatzSystemRule, parsePracticeAnreise, parsePracticeLocationHint, parsePracticeOrt, parsePracticeOwnerName, parseRegisterPlace, spokenNachtdienstDest, travelReply, whatsappSystemRule } from "./desk.ts";
import { internProtocolPet } from "./protocol.ts";
import { defaultNachtdienst, PRACTICE } from "./data.ts";
import type { PracticeProfile } from "../practice/profile.ts";

function stub(over: Partial<PracticeProfile> = {}): PracticeProfile {
  return {
    id: "p1",
    name: "Tierordination Gloggnitz",
    ownerName: "Dr. Stein",
    street: "Josefstädter Straße 28",
    zip: "1080",
    city: "Wien",
    bundesland: "Wien",
    phone: "01 123",
    whatsapp: "",
    email: "a@b.at",
    pms: "",
    hours: [],
    vets: "",
    resources: "",
    nachtdienstName: "",
    nachtdienstPhone: "",
    nachtdienstNote: "",
    notes: "",
    locationHint: "",
    slug: "gloggnitz",
    retentionDays: 90,
    behavior: "",
    consentEnabled: true,
    consentNote: "Das Gespräch wird zur Terminvereinbarung verarbeitet.",
    ...over,
  };
}

test("live 1080 tenant does not inherit Huber Josefstadt Anreise", () => {
  const desk = deskFromProfile(stub());
  assert.equal(desk.isDemo, false);
  assert.equal(desk.locationHint, "");
  const text = travelReply(desk);
  assert.match(text, /Josefstädter Straße 28/);
  assert.doesNotMatch(text, /U2 Rathaus|Parkpickerl|achten Bezirk/);
  assert.equal(parkplatzIncomplete(desk.street, desk.locationHint), true);
  assert.match(parkplatzSystemRule(desk), /PARKPLATZ OHNE HINWEIS/);
  assert.match(parkplatzSystemRule(desk), /Kurzparkzone|U2 Rathaus|Josefstadt/);
});

test("Anreise from Einstellungen wins over the street", () => {
  const desk = deskFromProfile(stub({ locationHint: "S-Bahn Gloggnitz, Parkplatz hinter dem Haus." }));
  assert.match(desk.locationHint, /S-Bahn Gloggnitz/);
  assert.match(travelReply(desk), /S-Bahn Gloggnitz/);
  assert.doesNotMatch(travelReply(desk), /U2 Rathaus/);
});

test("demo desk still explains Huber Josefstadt", () => {
  const text = travelReply(demoDesk());
  assert.match(text, /U2 Rathaus/);
  assert.match(text, /Josefstädter Straße/);
});

test("live empty practice phone does not fall back to Huber", () => {
  const live = deskFromProfile(stub({ phone: "", city: "Graz" }));
  assert.equal(deskLineNumber(live), "");
  assert.equal(deskCityLabel(live), "Graz");
  assert.equal(deskLineNumber(null), PRACTICE.phone);
  assert.match(deskCityLabel(null), /Wien/);
  assert.doesNotMatch(deskLineNumber(live), /405\s*12\s*88|14051288/);
  assert.match(leitungSystemRule(live), /LEITUNG OHNE NUMMER/);
  assert.match(leitungSystemRule(live), /01 405 12 88|Josefstadt/);
  assert.equal(leitungSystemRule(deskFromProfile(stub({ phone: "0316 12 34 56" }))), "");
});

test("live Festnetz is the Leitung, never WhatsApp", () => {
  const graz = deskFromProfile(
    stub({
      phone: "0316 12 34 56",
      whatsapp: "",
      city: "Graz",
      bundesland: "Steiermark",
    }),
  );
  assert.equal(deskWhatsappNumber(graz), "");
  assert.match(deskContactLine(graz), /Telefon 0316 12 34 56/);
  assert.match(deskContactLine(graz), /WhatsApp nicht hinterlegt/);
  assert.doesNotMatch(deskContactLine(graz), /WhatsApp 0316/);
  assert.match(whatsappSystemRule(graz), /Keine 06/);
  assert.doesNotMatch(whatsappSystemRule(graz), /Vetmeduni|405 12 88/);
  const withHandy = deskFromProfile(
    stub({
      phone: "0316 12 34 56",
      whatsapp: "0664 88 77 66",
      city: "Graz",
    }),
  );
  assert.equal(deskWhatsappNumber(withHandy), "0664 88 77 66");
  assert.match(deskContactLine(withHandy), /WhatsApp 0664 88 77 66/);
  assert.equal(whatsappSystemRule(withHandy), "");
  const demo = demoDesk();
  assert.equal(deskWhatsappNumber(demo), PRACTICE.whatsapp);
  assert.equal(whatsappSystemRule(demo), "");
});

test("signup Nachtdienst never seeds a directory place", () => {
  for (const land of ["Steiermark", "Wien", "Niederösterreich", "Oberösterreich", ""]) {
    const night = defaultNachtdienst(land);
    assert.equal(night.name, "");
    assert.equal(night.phone, "");
    assert.equal(night.note, "");
    assert.doesNotMatch(night.name, /Graz|Vetmeduni|Linz|Bezirk|Innsbruck|Salzburg|Klagenfurt|Feldkirch|Eisenstadt|hinterlegen/i);
    assert.doesNotMatch(night.phone, /25077|405\s*12\s*88/);
    assert.doesNotMatch(night.note, /hinterlegte Nachtklinik|Veterinärplatz|Einstellungen hinterlegen/i);
  }
});

test("Wien signup Nachtdienst does not seed Huber Vetmeduni", () => {
  const night = defaultNachtdienst("Wien");
  const desk = deskFromProfile(
    stub({
      nachtdienstName: night.name,
      nachtdienstPhone: night.phone,
      nachtdienstNote: night.note,
    }),
  );
  assert.doesNotMatch(emergencySpoken(desk), /Tierspital|25077|ich verbinde/i);
  assert.doesNotMatch(nachtdienstReply(desk), /Tierspital|25077|verbinde ich/i);
  assert.match(nachtdienstReply(desk), /nicht hinterlegt/);
  assert.doesNotMatch(holidayNachtdienstLine(desk), /Tierspital|25077/i);
});

test("emergency without a hinterlegte Nummer does not claim to connect", () => {
  const leftover = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Graz und Umgebung",
      nachtdienstPhone: "",
      nachtdienstNote: "hinterlegte Nachtklinik",
    }),
  );
  assert.equal(spokenNachtdienstDest("Graz und Umgebung", ""), "");
  assert.equal(spokenNachtdienstDest("Nachtklinik Graz", ""), "Nachtklinik Graz");
  assert.equal(spokenNachtdienstDest("Graz und Umgebung", "0316 80 12 34"), "Graz und Umgebung");
  const leftoverText = emergencySpoken(leftover);
  assert.match(leftoverText, /Notfall/);
  assert.match(leftoverText, /nicht hinterlegt/);
  assert.doesNotMatch(leftoverText, /Graz und Umgebung|Hinterlegt ist Graz/i);
  assert.doesNotMatch(leftoverText, /hinterlegte Nachtklinik/);
  assert.doesNotMatch(leftoverText, /ich verbinde|Vetmeduni|25077/i);
  assert.match(nachtdienstReply(leftover), /nicht hinterlegt/);
  assert.doesNotMatch(nachtdienstReply(leftover), /Graz und Umgebung/i);
  assert.match(nachtdienstSystemRule(leftover), /keine Telefonnummer/i);
  assert.match(nachtdienstSystemRule(leftover), /Vetmeduni/);
  assert.match(holidayNachtdienstLine(leftover), /keine Nummer/);
  assert.doesNotMatch(holidayNachtdienstLine(leftover), /Graz und Umgebung/i);

  const typed = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Nachtklinik Graz",
      nachtdienstPhone: "",
    }),
  );
  const typedText = emergencySpoken(typed);
  assert.match(typedText, /Hinterlegt ist Nachtklinik Graz/);
  assert.match(typedText, /Nummer fehlt/);
  assert.doesNotMatch(typedText, /ich verbinde|Vetmeduni|25077/i);
});

test("Huber emergency still names Vetmeduni and the hinterlegte Nummer", () => {
  const text = emergencySpoken(demoDesk());
  assert.match(text, /Ich verbinde Sie/);
  assert.match(text, /Vetmeduni/);
  assert.match(text, /25077/);
  assert.equal(nachtdienstSystemRule(demoDesk()), "");
  assert.match(holidayNachtdienstLine(demoDesk()), /Vetmeduni/);
  assert.doesNotMatch(holidayNachtdienstLine(demoDesk()), /keine Nummer/);
  assert.match(nachtdienstReply(demoDesk()), /Vetmeduni/);
  assert.match(nachtdienstReply(demoDesk()), /25077/);
});

test("leftover directory Nachtdienst with a number still names the place", () => {
  const desk = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Graz und Umgebung",
      nachtdienstPhone: "0316 80 12 34",
      nachtdienstNote: "hinterlegte Nachtklinik",
    }),
  );
  const text = emergencySpoken(desk);
  assert.match(text, /Graz und Umgebung/);
  assert.match(text, /0316 80 12 34/);
  assert.doesNotMatch(text, /hinterlegte Nachtklinik|Ich verbinde Sie|Vetmeduni|25077/i);
});

test("live Graz Nachtdienst names the hinterlegte Klinik, never Vetmeduni", () => {
  const desk = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Nachtklinik Graz",
      nachtdienstPhone: "0316 80 12 34",
      nachtdienstNote: "",
    }),
  );
  const emergency = emergencySpoken(desk);
  assert.match(emergency, /Nachtklinik Graz/);
  assert.match(emergency, /0316 80 12 34/);
  assert.match(emergency, /verbindet nicht selbst|Tierarzthelferin ruft/);
  assert.doesNotMatch(emergency, /Ich verbinde Sie/);
  assert.doesNotMatch(emergency, /Vetmeduni|25077|Josefstadt|hinterlegte Nachtklinik/i);
  const info = nachtdienstReply(desk);
  assert.match(info, /Nachtklinik Graz/);
  assert.match(info, /0316 80 12 34/);
  assert.doesNotMatch(info, /Vetmeduni|25077|verbinde ich/i);
  const leftover = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Nachtklinik Graz",
      nachtdienstPhone: "0316 80 12 34",
      nachtdienstNote: "hinterlegte Nachtklinik",
    }),
  );
  leftover.isDemo = false;
  assert.doesNotMatch(emergencySpoken(leftover), /hinterlegte Nachtklinik/);
  const leftoverForm = deskFromProfile(
    stub({
      nachtdienstName: "Nachtdienst (bitte hinterlegen)",
      nachtdienstPhone: "",
      nachtdienstNote: "Bitte in den Einstellungen hinterlegen.",
    }),
  );
  leftoverForm.isDemo = false;
  assert.equal(leftoverForm.nachtdienstName, "");
  assert.equal(leftoverForm.nachtdienstNote, "");
  assert.match(nachtdienstReply(leftoverForm), /nicht hinterlegt/);
  assert.doesNotMatch(nachtdienstReply(leftoverForm), /bitte hinterlegen|Einstellungen hinterlegen/i);
  assert.equal(isNachtdienstTurn("Wie lautet der Nachtdienst?"), true);
  assert.equal(isNachtdienstTurn("Atemnot, Zunge bläulich, Nachtdienst"), false);
  assert.equal(isNachtdienstTurn("Impfung für Resi"), false);
  assert.equal(keepNachtdienstNote("Klingel im 2. Hof"), "Klingel im 2. Hof");
  assert.equal(keepNachtdienstNote("hinterlegte Nachtklinik"), "");
  assert.equal(keepNachtdienstNote("Bitte in den Einstellungen hinterlegen"), "");
  assert.equal(keepNachtdienstNote(""), "");
  assert.equal(keepNachtdienstNote("", "Klingel im 2. Hof"), "Klingel im 2. Hof");
  assert.equal(keepNachtdienstNote(" Hofeingang links ", "Klingel im 2. Hof"), "Hofeingang links");
  assert.equal(keepNachtdienstNote("hinterlegte Nachtklinik", "Klingel im 2. Hof"), "Klingel im 2. Hof");
  assert.equal(keepNachtdienstNote("", ""), "");
  assert.doesNotMatch(keepNachtdienstNote("", "Klingel im 2. Hof"), /Vetmeduni|25077|Josefstadt/i);
  assert.equal(keepNachtdienstName("", "Nachtklinik Graz"), "Nachtklinik Graz");
  assert.equal(keepNachtdienstName("Bereitschaft", "Nachtklinik Graz"), "Bereitschaft");
  assert.equal(keepNachtdienstName("", "Bitte hinterlegen"), "");
  assert.equal(keepNachtdienstName("", "Graz und Umgebung"), "");
  assert.equal(keepNachtdienstName("Graz und Umgebung", "Nachtklinik Graz"), "Graz und Umgebung");
  assert.equal(keepLocationHint("", "Parkplatz hinter dem Haus"), "Parkplatz hinter dem Haus");
  assert.equal(keepLocationHint(" Öffi Linie 1 ", "Parkplatz hinter dem Haus"), "Öffi Linie 1");
  assert.equal(keepNotes("", "Mittwoch nur Kastrationen."), "Mittwoch nur Kastrationen.");
  assert.equal(keepNotes(" Impfungen nur vormittags. ", "Mittwoch nur Kastrationen."), "Impfungen nur vormittags.");
  assert.equal(keepNotes("", ""), "");
  assert.doesNotMatch(keepNotes("", "Mittwoch nur Kastrationen."), /Fritz|Josefstadt|Vetmeduni/i);
  assert.equal(keepOwnerName("", "Dr. Stein"), "Dr. Stein");
  assert.equal(keepOwnerName(" Dr. Quelle ", "Dr. Stein"), "Dr. Quelle");
  assert.equal(keepOwnerName("", ""), "");
  assert.doesNotMatch(keepOwnerName("", "Dr. Stein"), /Huber|Anna|Josefstadt|Fritz/i);
  assert.equal(keepLocationHint("", ""), "");
  const keptHint = deskFromProfile(
    stub({
      street: "Herrengasse 12",
      zip: "8010",
      city: "Graz",
      locationHint: keepLocationHint("", "Parkplatz hinter dem Haus"),
    }),
  );
  assert.match(travelReply(keptHint), /Parkplatz hinter dem Haus/);
  assert.doesNotMatch(travelReply(keptHint), /U2 Rathaus|Josefstadt/);
  const withNote = deskFromProfile(
    stub({
      bundesland: "Steiermark",
      city: "Graz",
      nachtdienstName: "Nachtklinik Graz",
      nachtdienstPhone: "0316 80 12 34",
      nachtdienstNote: "Klingel im 2. Hof",
    }),
  );
  withNote.isDemo = false;
  assert.match(emergencySpoken(withNote), /Klingel im 2\. Hof/);
});

test("live Graz Anreise uses the hinterlegte street, never Josefstadt", () => {
  const desk = deskFromProfile(
    stub({
      street: "Herrengasse 12",
      zip: "8010",
      city: "Graz",
      bundesland: "Steiermark",
      locationHint: "",
    }),
  );
  const text = travelReply(desk);
  assert.match(text, /Herrengasse 12/);
  assert.match(text, /8010 Graz/);
  assert.doesNotMatch(text, /U2 Rathaus|Josefstadt|Parkpickerl|achten Bezirk/);
  assert.equal(anreiseIncomplete(desk.street), false);
  assert.equal(parkplatzIncomplete(desk.street, desk.locationHint), true);
  assert.equal(anreiseIncomplete(""), true);
  assert.equal(isTravelTurn("Wie komme ich mit der Anreise, wo parke ich?"), true);
  assert.equal(isTravelTurn("Impfung für Resi"), false);
  assert.equal(travelSkipsLlm({ message: "Wo kann ich parken?" }), true);
  assert.equal(travelSkipsLlm({ message: "Wie ist die Anreise?" }), true);
  assert.equal(travelSkipsLlm({ message: "Wo kann ich parken?", train: true }), false);
  assert.equal(travelSkipsLlm({ message: "Impfung für Resi" }), false);
});

test("live tenant without a street does not inherit Huber Anreise", () => {
  const desk = deskFromProfile(stub({ street: "", zip: "", city: "Graz", bundesland: "Steiermark", locationHint: "" }));
  const text = travelReply(desk);
  assert.match(text, /Graz/);
  assert.doesNotMatch(text, /U2 Rathaus|Josefstädter|Parkpickerl/);
  assert.equal(anreiseIncomplete(desk.street), true);
});

test("parsePracticeAnreise requires a street and a 4-digit zip when present — signup too", () => {
  assert.deepEqual(parsePracticeAnreise({ street: "" }), { ok: false, error: ANREISE_STREET_EMPTY_ERROR });
  assert.deepEqual(parsePracticeAnreise({ street: "   " }), { ok: false, error: ANREISE_STREET_EMPTY_ERROR });
  assert.deepEqual(parsePracticeAnreise({ street: "Herrengasse 12", zip: "801" }), {
    ok: false,
    error: ANREISE_ZIP_INVALID_ERROR,
  });
  assert.deepEqual(parsePracticeAnreise({ street: "Herrengasse 12", zip: "80101" }), {
    ok: false,
    error: ANREISE_ZIP_INVALID_ERROR,
  });
  assert.deepEqual(parsePracticeAnreise({ street: "  Herrengasse 12  ", zip: " 8010 ", hint: " Parkplatz hinter dem Haus " }), {
    ok: true,
    street: "Herrengasse 12",
    zip: "8010",
    hint: "Parkplatz hinter dem Haus",
  });
  assert.deepEqual(parsePracticeAnreise({ street: "Herrengasse 12" }), {
    ok: true,
    street: "Herrengasse 12",
    zip: "",
    hint: "",
  });
  assert.equal(keepStreet("", "Herrengasse 12"), "Herrengasse 12");
  assert.equal(keepStreet(" Hauptplatz 1 ", "Herrengasse 12"), "Hauptplatz 1");
  assert.equal(keepStreet("", ""), "");
  assert.doesNotMatch(keepStreet("", "Herrengasse 12"), /Josefstadt|Josefstädter|1080/i);
  assert.equal(keepCity("", "Graz"), "Graz");
  assert.equal(keepCity(" Knittelfeld ", "Graz"), "Knittelfeld");
  assert.equal(keepCity("", ""), "");
  assert.doesNotMatch(keepCity("", "Graz"), /Wien|Josefstadt/i);
  assert.equal(keepPracticeName("", "Tafel Graz"), "Tafel Graz");
  assert.equal(keepPracticeName(" Tafel Knittelfeld ", "Tafel Graz"), "Tafel Knittelfeld");
  assert.equal(keepPracticeName("", ""), "");
  assert.doesNotMatch(keepPracticeName("", "Tafel Graz"), /Huber|Josefstadt/i);
  assert.equal(PRACTICE_NAME_EMPTY_ERROR, "Bitte den Namen der Ordination angeben.");
  assert.equal(keepZip("", "8010"), "8010");
  assert.equal(keepZip("8020", "8010"), "8020");
  assert.equal(keepZip("", ""), "");
  assert.equal(keepZip("", "108"), "");
  assert.doesNotMatch(keepZip("", "8010"), /1080|Josefstadt/i);
  const wien = parsePracticeAnreise({ street: "Josefstädter Straße 28", zip: "1080" });
  assert.equal(wien.ok, true);
  if (wien.ok) {
    assert.equal(wien.street, "Josefstädter Straße 28");
    assert.equal(wien.zip, "1080");
  }
});

test("parsePracticeOrt requires a city and never invents Wien", () => {
  assert.deepEqual(parsePracticeOrt({ city: "" }), { ok: false, error: ORT_CITY_EMPTY_ERROR });
  assert.deepEqual(parsePracticeOrt({ city: "   " }), { ok: false, error: ORT_CITY_EMPTY_ERROR });
  assert.deepEqual(parsePracticeOrt({ city: "Graz", bundesland: "Josefstadt" }), {
    ok: false,
    error: ORT_BUNDESLAND_INVALID_ERROR,
  });
  assert.deepEqual(parsePracticeOrt({ city: "  Graz  ", bundesland: " Steiermark " }), {
    ok: true,
    city: "Graz",
    bundesland: "Steiermark",
  });
  assert.deepEqual(parsePracticeOrt({ city: "Graz" }), { ok: true, city: "Graz", bundesland: "" });
  assert.deepEqual(parseRegisterPlace({ city: "", bundesland: "Steiermark" }), {
    ok: false,
    error: ORT_CITY_EMPTY_ERROR,
  });
  assert.deepEqual(parseRegisterPlace({ city: "Graz", bundesland: "" }), {
    ok: false,
    error: REGISTER_BUNDESLAND_EMPTY_ERROR,
  });
  assert.deepEqual(parseRegisterPlace({ city: "Graz", bundesland: "Josefstadt" }), {
    ok: false,
    error: REGISTER_BUNDESLAND_EMPTY_ERROR,
  });
  assert.deepEqual(parseRegisterPlace({ city: "  Graz  ", bundesland: " Steiermark " }), {
    ok: true,
    city: "Graz",
    bundesland: "Steiermark",
  });
  assert.equal(keepBundesland("", "Steiermark"), "Steiermark");
  assert.equal(keepBundesland("  Wien  ", "Steiermark"), "Wien");
  assert.equal(keepBundesland("", ""), "");
  assert.equal(keepBundesland("Josefstadt", "Steiermark"), "Steiermark");
  assert.equal(keepBundesland("", "Josefstadt"), "");
  const empty = deskFromProfile(stub({ city: "", bundesland: "", street: "Herrengasse 12" }));
  assert.equal(ortIncomplete(empty.city), true);
  assert.equal(ortIncomplete("Graz"), false);
  assert.match(ortSystemRule(empty), /ORT OHNE STADT/);
  assert.match(ortSystemRule(empty), /Josefstadt|Wien/);
  assert.equal(ortSystemRule(deskFromProfile(stub({ city: "Graz" }))), "");
  assert.doesNotMatch(travelReply(empty), /U2 Rathaus|achten Bezirk/);
});

test("parsePracticeLocationHint requires a Parkplatz/Öffi hint and never invents Josefstadt", () => {
  // registerPractice uses parsePracticeLocationHint — empty stays on /registrieren, never Josefstadt
  assert.deepEqual(parsePracticeLocationHint({ hint: "" }), { ok: false, error: PARKPLATZ_HINT_EMPTY_ERROR });
  assert.deepEqual(parsePracticeLocationHint({ hint: "   " }), { ok: false, error: PARKPLATZ_HINT_EMPTY_ERROR });
  assert.deepEqual(parsePracticeLocationHint({ hint: " Parkplatz hinter dem Haus " }), {
    ok: true,
    hint: "Parkplatz hinter dem Haus",
  });
  const graz = deskFromProfile(
    stub({
      street: "Herrengasse 12",
      zip: "8010",
      city: "Graz",
      bundesland: "Steiermark",
      locationHint: "",
    }),
  );
  assert.equal(parkplatzIncomplete("", "Parkplatz hinter dem Haus"), false);
  assert.equal(parkplatzIncomplete("Herrengasse 12", "Parkplatz hinter dem Haus"), false);
  assert.equal(parkplatzIncomplete("Herrengasse 12", ""), true);
  assert.equal(parkplatzIncomplete("", ""), false);
  assert.match(parkplatzSystemRule(graz), /PARKPLATZ OHNE HINWEIS/);
  assert.match(parkplatzSystemRule(graz), /Kurzparkzone|U2 Rathaus|Josefstadt/);
  assert.equal(
    parkplatzSystemRule(deskFromProfile(stub({ street: "Herrengasse 12", locationHint: "Parkplatz hinter dem Haus" }))),
    "",
  );
  assert.equal(parkplatzSystemRule(deskFromProfile(stub({ street: "", locationHint: "" }))), "");
  const text = travelReply(graz);
  assert.match(text, /Herrengasse 12/);
  assert.doesNotMatch(text, /U2 Rathaus|Parkpickerl|Kurzparkzone|achten Bezirk/);
});

test("empty owner does not invent Huber and Heute parse requires a name", () => {
  const empty = deskFromProfile(stub({ ownerName: "" }));
  assert.equal(ownerIncomplete(empty.owner), true);
  assert.equal(ownerIncomplete("Frau Doktor"), true);
  assert.equal(ownerIncomplete("die Frau Doktor"), true);
  assert.equal(ownerIncomplete("  "), true);
  assert.equal(ownerIncomplete("Dr. Quelle"), false);
  assert.match(ownerSystemRule(empty), /INHABERIN OHNE NAMEN/);
  assert.match(ownerSystemRule(empty), /Anna Huber|Huber/);
  assert.equal(ownerSystemRule(deskFromProfile(stub({ ownerName: "Dr. Quelle" }))), "");
  assert.equal(isOwnerAsk("Wer ist die Frau Doktor?"), true);
  assert.equal(isOwnerAsk("Wie heißt die Inhaberin?"), true);
  assert.equal(isOwnerAsk("Verbinden Sie mich mit der Frau Doktor"), false);
  assert.equal(isOwnerAsk("Termin bei der Frau Doktor"), false);
  assert.equal(isPracticeAsk("Wie heißt die Ordination?"), true);
  assert.equal(isPracticeAsk("Termin in der Ordination"), false);
  assert.equal(isLiveInfoTurn("Wer ist die Frau Doktor?"), true);
  assert.equal(isLiveInfoTurn("Wie heißt die Ordination?"), true);
  const named = ownerReply(deskFromProfile(stub({ ownerName: "Dr. Quelle", name: "Tafel Graz Quelle" })));
  assert.match(named, /Dr\. Quelle/);
  assert.doesNotMatch(named, /Anna Huber|Huber/i);
  const missing = ownerReply(deskFromProfile(stub({ ownerName: "" })));
  assert.match(missing, /Frau Doktor/);
  assert.doesNotMatch(missing, /Anna Huber|Huber/i);
  assert.match(practiceReply(deskFromProfile(stub({ name: "Tafel Graz Quelle" }))), /Tafel Graz Quelle/);
  assert.doesNotMatch(practiceReply(deskFromProfile(stub({ name: "Tafel Graz Quelle" }))), /Huber/i);
  assert.match(ownerReply(demoDesk()), /Anna Huber|Huber/);
  assert.deepEqual(parsePracticeOwnerName(""), { ok: false, error: OWNER_NAME_EMPTY_ERROR });
  assert.deepEqual(parsePracticeOwnerName("   "), { ok: false, error: OWNER_NAME_EMPTY_ERROR });
  assert.deepEqual(parsePracticeOwnerName("Frau Doktor"), { ok: false, error: OWNER_NAME_EMPTY_ERROR });
  assert.deepEqual(parsePracticeOwnerName(" Dr. Quelle "), { ok: true, value: "Dr. Quelle" });
  const parsed = parsePracticeOwnerName("Dr. Quelle");
  assert.equal(parsed.ok && parsed.value, "Dr. Quelle");
  assert.doesNotMatch(parsed.ok ? parsed.value : "", /Huber|Anna/i);
});

test("empty live notes do not invent Fritz; demo Huber stays silent", () => {
  const empty = deskFromProfile(stub({ notes: "" }));
  assert.equal(notesIncomplete(empty.notes, []), true);
  assert.equal(notesIncomplete("  ", ["  "]), true);
  assert.equal(notesIncomplete("Mittwoch nur Kastrationen.", []), false);
  assert.equal(notesIncomplete("", ["Impfungen nur vormittags."]), false);
  assert.equal(notesSystemRule(demoDesk(), []), "");
  assert.match(notesSystemRule(empty, []), /HAUSREGEL OHNE NOTIZ/);
  assert.match(notesSystemRule(empty, []), /Fritz|Transportbox|Eva Berger|Wastl/);
  assert.equal(notesSystemRule(empty, ["Mittwoch nur Kastrationen."]), "");
  assert.equal(notesSystemRule(deskFromProfile(stub({ notes: "Impfungen nur vormittags." })), []), "");
  assert.equal(isNotesEmptyTurn("Wie geht's dem Kater Fritz?"), true);
  assert.equal(isNotesEmptyTurn("Was gilt mittwochs?"), true);
  assert.equal(isNotesEmptyTurn("Wann habt ihr offen?"), false);
  assert.equal(mentionedDemoPet("Wie geht's dem Wastl?"), "Wastl");
  assert.equal(mentionedDemoPet("Wie geht's der Mizzi?"), "Mizzi");
  assert.equal(isNotesEmptyTurn("Wie geht's dem Wastl?"), true);
  assert.equal(isNotesEmptyTurn("Wie geht's der Mizzi?"), true);
  assert.equal(isNotesBookingTurn("Termin für Bella Impfung"), true);
  assert.equal(isNotesEmptyTurn("Termin für Bella Impfung"), false);
  assert.equal(isNotesEmptyTurn("Wastl ist lahm"), false);
  const fritz = notesEmptySpoken("Wie geht's dem Kater Fritz?");
  assert.match(fritz, /nicht/);
  assert.doesNotMatch(fritz, /Transportbox|Berger|Huber|Josefstadt/i);
  const wastl = notesEmptySpoken("Wie geht's dem Wastl?");
  assert.match(wastl, /Wastl/);
  assert.doesNotMatch(wastl, /Fritz|Transportbox|Leitner|Josefstadt/i);
  const mizzi = notesEmptySpoken("Wie geht's der Mizzi?");
  assert.match(mizzi, /Mizzi/);
  assert.doesNotMatch(mizzi, /Fritz|Pichler|Kroatien/i);
  const gilt = notesEmptySpoken("Was gilt mittwochs?");
  assert.match(gilt, /Hausregel/);
  assert.doesNotMatch(gilt, /Fritz|Kastrationen|Huber/i);
  assert.equal(notesLiveReply("Wie geht's dem Kater Fritz?", empty, []), fritz);
  assert.equal(notesLiveReply("Wie geht's dem Wastl?", empty, []), wastl);
  assert.equal(notesLiveReply("Wie geht's der Mizzi?", empty, []), mizzi);
  assert.equal(notesLiveReply("Termin für Bella Impfung", empty, []), null);
  assert.equal(notesLiveReply("Was gilt mittwochs?", empty, []), gilt);
  assert.equal(notesLiveReply("Wie geht's dem Kater Fritz?", demoDesk(), []), null);
  assert.equal(notesLiveReply("Wie geht's dem Kater Fritz?", empty, [], true), null);
  assert.equal(notesLiveReply("Wie geht's dem Kater Fritz?", empty, ["Fritz nur in der Box."]), null);
  assert.equal(notesLiveReply("Wann habt ihr offen?", empty, []), null);
  assert.equal(notesLiveSkipsLlm({ message: "Wie geht's dem Wastl?", notes: "" }), true);
  assert.equal(notesLiveSkipsLlm({ message: "Was gilt mittwochs?", notes: "" }), true);
  assert.equal(notesLiveSkipsLlm({ message: "Wie geht's dem Wastl?", notes: "", train: true }), false);
  assert.equal(notesLiveSkipsLlm({ message: "Wie geht's dem Wastl?", notes: "", isDemo: true }), false);
  assert.equal(notesLiveSkipsLlm({ message: "Wie geht's dem Wastl?", notes: "Mittwoch nur Kastrationen." }), false);
  assert.equal(notesLiveSkipsLlm({ message: "Wie geht's dem Wastl?", notes: "", facts: ["Impfungen nur vormittags."] }), false);
  assert.equal(notesLiveSkipsLlm({ message: "Termin für Bella Impfung", notes: "" }), false);
  const named = notesEmptyDeskAction(
    { type: "none", pet: "Fritz", kind: "Info" },
    "Wie geht's dem Kater Fritz?",
    empty,
    [],
  );
  assert.equal(named.pet, "Patient");
  assert.equal(named.type, "none");
  assert.equal(internProtocolPet(named.pet, "Klientel"), "Protokoll");
  assert.equal(
    notesEmptyDeskAction({ type: "none", pet: "Fritz" }, "Wie geht's dem Kater Fritz?", empty, [], true).pet,
    "Fritz",
  );
  assert.equal(
    notesEmptyDeskAction({ type: "none", pet: "Fritz" }, "Wie geht's dem Kater Fritz?", demoDesk(), []).pet,
    "Fritz",
  );
  assert.equal(
    notesEmptyDeskAction({ type: "none", pet: "Wastl" }, "Wie geht's dem Wastl?", empty, []).pet,
    "Patient",
  );
});

test("live hours Anreise Feiertag Nachtdienst skip the intern Zettel", () => {
  assert.equal(isHolidayAsk("Seid ihr am Nationalfeiertag da?"), true);
  assert.equal(isHolidayAsk("Habt ihr am Ostermontag offen?"), true);
  assert.equal(isHolidayAsk("Termin am Ostermontag für Resi"), false);
  assert.equal(holidaySkipsLlm({ message: "Seid ihr am Nationalfeiertag da?" }), true);
  assert.equal(holidaySkipsLlm({ message: "Habt ihr am Ostermontag offen?" }), true);
  assert.equal(holidaySkipsLlm({ message: "Seid ihr am Nationalfeiertag da?", train: true }), false);
  assert.equal(holidaySkipsLlm({ message: "Termin am Ostermontag für Resi" }), false);
  const grazHoliday = deskFromProfile(
    stub({
      nachtdienstPhone: "0316 38 23 38",
      nachtdienstName: "Nachtdienst Graz",
    }),
  );
  assert.match(holidayReply(grazHoliday), /Nationalfeiertag/);
  assert.match(holidayReply(grazHoliday), /Ostermontag/);
  assert.match(holidayReply(grazHoliday), /Allerheiligen/);
  assert.match(holidayReply(grazHoliday), /Neujahr/);
  assert.match(holidayReply(grazHoliday), /Heiliger Abend ist ab Mittag/);
  assert.match(holidayReply(grazHoliday), /0316 38 23 38|Nachtdienst Graz/);
  assert.doesNotMatch(holidayReply(grazHoliday), /Fritz|Josefstadt|Vetmeduni|25077/);
  assert.match(holidayReply(demoDesk()), /Vetmeduni/);
  assert.equal(holidaySkipsLlm({ message: "Habt ihr an Allerheiligen offen?" }), true);
  assert.equal(holidaySkipsLlm({ message: "Seid ihr an Neujahr da?" }), true);
  assert.equal(isLiveInfoTurn("Wann habt ihr offen?"), true);
  assert.equal(isLiveInfoTurn("Wo kann ich parken?"), true);
  assert.equal(isLiveInfoTurn("Wer ist der Nachtdienst?"), true);
  assert.equal(isLiveInfoTurn("Seid ihr am Nationalfeiertag da?"), true);
  assert.equal(isAddressAsk("Wie ist eure Adresse?"), true);
  assert.equal(isAddressAsk("Wo seid ihr?"), true);
  assert.equal(isAddressAsk("Wo kann ich parken?"), false);
  assert.equal(isAddressAsk("Termin in der Herrengasse"), false);
  assert.equal(isWhatsappAsk("Habt ihr WhatsApp?"), true);
  assert.equal(isLeitungAsk("Wie lautet eure Telefonnummer?"), true);
  assert.equal(isContactAsk("Kann ich euch anrufen?"), true);
  assert.equal(isContactAsk("Impfung für Resi"), false);
  assert.equal(isInboxAsk("Wie ist eure E-Mail?"), true);
  assert.equal(isInboxAsk("Habt ihr eine E-Mail?"), true);
  assert.equal(isInboxAsk("Meine E-Mail ist nowak@example.com"), false);
  assert.equal(isInboxAsk("Termin per E-Mail für Resi"), false);
  assert.equal(isLiveInfoTurn("Wie ist eure E-Mail?"), true);
  assert.equal(isLiveInfoTurn("Wie ist eure Adresse?"), true);
  assert.equal(isLiveInfoTurn("Habt ihr WhatsApp?"), true);
  assert.equal(isLiveInfoTurn("Impfung für Resi"), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie ist eure Adresse?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Habt ihr WhatsApp?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie lautet eure Telefonnummer?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie ist eure E-Mail?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wer ist die Frau Doktor?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie heißt die Ordination?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wann habt ihr offen?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wer ist der Nachtdienst?" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Notfall", actionType: "emergency" }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wann habt ihr offen?", isDemo: true }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wer ist der Nachtdienst?", isDemo: true }), true);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie ist eure Adresse?", isDemo: true }), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wer ist die Frau Doktor?", isDemo: true }), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wie ist eure Adresse?", train: true }), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Wann habt ihr offen?", train: true }), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Impfung für Resi" }), false);
  assert.equal(liveInfoOverwriteIsLocal({ message: "Hallo" }), false);
  assert.equal(
    skipLiveInternZettel({ message: "Wann habt ihr offen?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wo kann ich parken?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wer ist der Nachtdienst?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Seid ihr am Nationalfeiertag da?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wie ist eure Adresse?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Habt ihr WhatsApp?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wie lautet eure Telefonnummer?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wie ist eure E-Mail?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Meine E-Mail ist nowak@example.com", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Nehmt ihr auch Kaninchen?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Was kostet eine Kontrolle?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wer ist die Frau Doktor?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wie heißt die Ordination?", actionType: "none" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Verbinden Sie mich mit der Frau Doktor", actionType: "none", kassa: true }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wann habt ihr offen?", actionType: "book" }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Gift und Krämpfe", actionType: "emergency" }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Bitte zurückrufen", actionType: "none", callback: true }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Verbinden Sie mich", actionType: "none", kassa: true }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wann habt ihr offen?", actionType: "none", isDemo: true }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Wie geht's dem Wastl?", actionType: "none", notesSkip: true }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Termin im Jänner für Resi", actionType: "book" }),
    false,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Morgen um 10 Uhr", actionType: "none", kind: "Terminwunsch" }),
    false,
  );
  assert.equal(isLeftoverAuskunft("Nehmt ihr auch Kaninchen?"), true);
  assert.equal(isLeftoverAuskunft("Was kostet das?"), true);
  assert.equal(isLeftoverAuskunft("Termin für Resi"), false);
  assert.equal(isLeftoverAuskunft("Gift und Krämpfe"), false);
  assert.equal(isLeftoverPolicyAsk("Nehmt ihr auch Kaninchen?"), true);
  assert.equal(isLeftoverPolicyAsk("Was kostet das?"), true);
  assert.equal(isLeftoverPolicyAsk("Hallo"), false);
  assert.equal(isLeftoverPolicyAsk("Termin für Resi"), false);
  const spoken = leftoverReply();
  assert.match(spoken, /keine Hausregel hinterlegt/);
  assert.match(spoken, /Heute oder in den Einstellungen/);
  assert.match(spoken, /verbindet niemanden selbst/);
  assert.doesNotMatch(spoken, /verbinde sie|Termin für ein anderes|nächsten freien slot/i);
  assert.equal(
    skipLiveInternZettel({ message: "Nehmt ihr auch Kaninchen?", actionType: "book" }),
    true,
  );
  assert.equal(
    skipLiveInternZettel({ message: "Nehmt ihr auch Kaninchen?", actionType: "none" }),
    true,
  );
  const leftoverNote = livePersistStaffNote({ internSkipped: true, actionType: "book", pet: "Resi" });
  assert.equal(leftoverNote?.note, "Auskunft liegt unter Anrufe.");
  assert.equal(leftoverNote?.links, "anrufe");
  assert.equal(leftoverNote?.toastSuccess, undefined);
  const hoursNote = livePersistStaffNote({ internSkipped: true, actionType: "none" });
  assert.equal(hoursNote?.note, "Auskunft liegt unter Anrufe.");
  assert.equal(hoursNote?.links, "anrufe");
  const bookNote = livePersistStaffNote({ internSkipped: false, actionType: "book", pet: "Resi" });
  assert.equal(bookNote?.note, "Termin für Resi liegt auf der Tafel.");
  assert.equal(bookNote?.links, "tafel");
  assert.equal(bookNote?.toastSuccess, "Termin für Resi liegt.");
  const protoNote = livePersistStaffNote({ internSkipped: false, actionType: "none" });
  assert.equal(protoNote?.note, "Protokoll liegt auf der Praxistafel.");
  assert.equal(protoNote?.links, "tafel");
  assert.equal(livePersistStaffNote({ internSkipped: true, actionType: "emergency" }), null);
  assert.equal(leftoverSkipsLlm({ message: "Was kostet das?" }), true);
  assert.equal(leftoverSkipsLlm({ message: "Nehmt ihr auch Kaninchen?" }), true);
  assert.equal(leftoverSkipsLlm({ message: "Was kostet das?", isDemo: true }), false);
  assert.equal(leftoverSkipsLlm({ message: "Was kostet das?", train: true }), false);
  assert.equal(leftoverSkipsLlm({ message: "Termin für Resi" }), false);
  assert.equal(leftoverSkipsLlm({ message: "Hallo" }), false);
});

test("live address and Leitung replies stay on the Tafel, never Huber", () => {
  const graz = deskFromProfile(
    stub({
      name: "Tafel Graz Adresse",
      street: "Herrengasse 94",
      zip: "8010",
      city: "Graz",
      bundesland: "Steiermark",
      locationHint: "Parkplatz hinter dem Haus",
      phone: "0316 73 60 34",
      whatsapp: "0664 55 68 34",
    }),
  );
  const addr = addressReply(graz);
  assert.match(addr, /Herrengasse 94/);
  assert.match(addr, /8010 Graz/);
  assert.match(addr, /Parkplatz hinter dem Haus/);
  assert.doesNotMatch(addr, /Josefstadt|U2 Rathaus|achten Bezirk/i);
  const phone = contactReply(graz, "Wie lautet eure Telefonnummer?");
  assert.match(phone, /0316 73 60 34/);
  assert.doesNotMatch(phone, /405\s*12\s*88|Josefstadt|WhatsApp 0316/i);
  const wa = contactReply(graz, "Habt ihr WhatsApp?");
  assert.match(wa, /0664 55 68 34/);
  assert.doesNotMatch(wa, /405\s*12\s*88|0316 73 60 34/);
  const festnetzOnly = deskFromProfile(
    stub({
      phone: "0316 73 60 34",
      whatsapp: "",
      city: "Graz",
    }),
  );
  const noWa = contactReply(festnetzOnly, "Habt ihr WhatsApp?");
  assert.match(noWa, /nicht hinterlegt/);
  assert.match(noWa, /0316 73 60 34/);
  assert.doesNotMatch(noWa, /WhatsApp 0316|405\s*12\s*88/i);
  assert.match(addressReply(demoDesk()), /Josefstädter/);
});

test("live inbox reply stays on the Tafel, never Huber or Anmelden", () => {
  const graz = deskFromProfile(
    stub({
      email: "rezeption.graz@ordination.example.com",
      phone: "0316 73 60 38",
      city: "Graz",
    }),
  );
  const spoken = inboxReply(graz);
  assert.match(spoken, /rezeption\.graz@ordination\.example\.com/);
  assert.doesNotMatch(spoken, /huber\.vet|rezeption@huber|kassa\.|Josefstadt/i);
  const empty = inboxReply(deskFromProfile(stub({ email: "", city: "Graz" })));
  assert.match(empty, /nicht hinterlegt/);
  assert.doesNotMatch(empty, /huber\.vet|rezeption@huber/i);
  assert.match(inboxReply(demoDesk()), /huber\.vet|@/);
});
