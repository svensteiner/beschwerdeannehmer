import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESK_ANZEIGE_ID,
  AKTE_EMPTY_COPY,
  AKTE_EMPTY_COPY_ANZEIGE,
  AKTE_NEU_ANZEIGE_ID,
  AKTE_NEU_TITLE,
  AKTE_NEU_TITLE_ANZEIGE,
  SETTINGS_FELDER_ANZEIGE_ID,
  SETTINGS_FELDER_ANZEIGE,
  settingsFelderVisible,
  settingsAnzeigeId,
  SETTINGS_EMAIL_HINT_ID,
  SETTINGS_EMAIL_HINT,
  SETTINGS_EMAIL_HINT_ANZEIGE,
  settingsEmailHint,
  HEUTE_BACKUP_ANZEIGE_ID,
  SETTINGS_BACKUP_LAST_ID,
  settingsBackupLastVisible,
  HEUTE_BACKUP_TITLE_ID,
  HEUTE_BACKUP_TITLE_ANZEIGE,
  heuteBackupTitle,
  HEUTE_EMPTY_COPY,
  HEUTE_EMPTY_COPY_ANZEIGE,
  HEUTE_LEER_ID,
  HEUTE_ZEITEN_WALKIN_ID,
  WALKIN_TITLE,
  WALKIN_TITLE_ANZEIGE,
  HEUTE_ZU_ANZEIGE,
  HEUTE_ZU_ANZEIGE_ID,
  KALENDER_ZU_ANZEIGE_ID,
  HEUTE_ZU_TITLE,
  HEUTE_ZU_TITLE_ANZEIGE,
  SETTINGS_BACKUP_ANZEIGE_ID,
  TAFEL_ANZEIGE_BANNER,
  TAFEL_ANZEIGE_COPY_FAIL,
  TAFEL_ANZEIGE_ERROR,
  TAFEL_ANZEIGE_LADEN_HTTP_FAIL,
  TAFEL_ANZEIGE_LINE,
  TAFEL_ANZEIGE_REFRESH_LABEL,
  TAFEL_ANZEIGE_REFRESH_WRITER_ERROR,
  SPRECHEN_DEMO_BANNER_ID,
  DESK_HOME_ANZEIGE_ID,
  DESK_HOME_HEAR_ID,
  DESK_HOME_MITTAG_ID,
  DESK_HOME_CALL_ID,
  DESK_WERKZEUGE_MITTAG_ID,
  DESK_WERKZEUGE_ANRUFEN_ID,
  DESK_WERKZEUGE_CHIP_ID,
  DESK_WERKZEUGE_REISE_ID,
  DESK_WERKZEUGE_NACHT_ID,
  DESK_WERKZEUGE_FRITZ_ID,
  DESK_HOME_CHIP_ID,
  DESK_HOME_FACES_ID,
  DESK_HOME_FILM_ID,
  DESK_HOME_AUSTRIA_ID,
  DESK_HOME_KILLERS_ID,
  DESK_HOME_NIGHT_ID,
  DESK_HOME_FAQ_ID,
  DESK_HOME_SOCIAL_ID,
  DESK_HOME_HERO_COPY_ID,
  DESK_HOME_TESTEN_ID,
  DESK_HOME_HERO_TAFEL_ID,
  DESK_HOME_CLOSE_ID,
  anzeigeControl,
  homePublicShowsDemo,
  demoPublicShowsHuber,
  demoPublicNavTo,
  demoAkteNavTo,
  DESK_HEADER_PRAXISTAFEL_ID,
  DESK_HEADER_PRAXISTAFEL_MOBILE_ID,
  DESK_FOOTER_PRAXISTAFEL_ID,
  DESK_LANDING_PRAXISTAFEL_ID,
  DESK_WERKZEUGE_AKTE_ID,
  DESK_WERKZEUGE_LEAD_ID,
  DESK_WERKZEUGE_HEAD_ID,
  WERKZEUGE_LEAD,
  WERKZEUGE_LEAD_ANZEIGE,
  WERKZEUGE_HEADING,
  WERKZEUGE_HEADING_ANZEIGE,
  werkzeugePublicHeading,
  werkzeugePublicLead,
  DESK_PREISE_AKTE_ID,
  DESK_PREISE_FAQ_ID,
  DESK_PREISE_FAQ_NACHT_ID,
  DESK_PREISE_FAQ_WA_ID,
  DESK_PREISE_LEAD_ID,
  DESK_PREISE_FEIER_ID,
  DESK_HOME_STATS_ID,
  DESK_HOME_STATS_NUMMER_ID,
  DESK_HOME_STATS_ERLEDIGT_ID,
  HOME_STATS_NUMMER_ANZEIGE,
  DESK_HOME_FEATURES_ID,
  DESK_HOME_FEATURES_LEAD_ID,
  DESK_HOME_FEATURES_NACHT_ID,
  DESK_HOME_FEATURES_PMS_ID,
  DESK_HOME_FEATURES_PROTOKOLL_ID,
  DESK_HOME_FEATURES_FEIER_ID,
  DESK_HOME_FEATURES_WA_ID,
  DESK_HOME_HOW_ID,
  DESK_HOME_HOW_HEAD_ID,
  DESK_HOME_HOW_LINE_ID,
  DESK_HOME_HOW_PMS_ID,
  DESK_HOME_HOW_WORK_ID,
  DESK_HOME_DIFFERENCE_ID,
  DESK_HOME_DIFFERENCE_NACHT_ID,
  DESK_HOME_DIFFERENCE_REGISTER_ID,
  DESK_HOME_DIFFERENCE_WA_ID,
  DESK_HOME_PROBLEM_ID,
  DESK_HOME_PROBLEM_LEAD_ID,
  DESK_HOME_PROBLEM_NACHT_ID,
  DESK_HOME_PROBLEM_WA_ID,
  HOME_FEATURES_LEAD,
  HOME_FEATURES_LEAD_ANZEIGE,
  HOME_DIFF_KALENDER_ANZEIGE,
  HOME_DIFF_NACHT_ANZEIGE,
  HOME_DIFF_REGISTER_ANZEIGE,
  HOME_DIFF_WA_ANZEIGE,
  HOME_HOW_HEADING,
  HOME_HOW_HEADING_ANZEIGE,
  HOME_HOW_LINE_ANZEIGE_BODY,
  HOME_HOW_LINE_ANZEIGE_TITLE,
  HOME_HOW_PMS_ANZEIGE_BODY,
  HOME_HOW_PMS_ANZEIGE_TITLE,
  HOME_HOW_WORK_ANZEIGE_BODY,
  HOME_HOW_WORK_ANZEIGE_TITLE,
  HOME_PROBLEM_LEAD,
  HOME_PROBLEM_LEAD_ANZEIGE,
  HOME_PROBLEM_NACHT,
  HOME_PROBLEM_NACHT_ANZEIGE,
  HOME_PROBLEM_WA,
  HOME_PROBLEM_WA_ANZEIGE,
  HOME_NACHT_ANZEIGE_BODY,
  HOME_PMS_ANZEIGE_BODY,
  HOME_PROTOKOLL_ANZEIGE_BODY,
  HOME_FEATURES_FEIER_ANZEIGE,
  HOME_WA_ANZEIGE_BODY,
  PREISE_FEIER_LEAD,
  PREISE_FEIER_LEAD_ANZEIGE,
  PREISE_LEAD,
  PREISE_LEAD_ANZEIGE,
  PREISE_PMS_ANZEIGE,
  PREISE_ERINNER_ANZEIGE,
  PREISE_LIVE_ANZEIGE,
  PREISE_FAQ_NACHT_ANZEIGE,
  PREISE_FAQ_REGISTER_ANZEIGE,
  PREISE_FAQ_WA_KANAL_ANZEIGE,
  PREISE_NACHT_ANZEIGE,
  PREISE_PROTOKOLL_ANZEIGE,
  PREISE_WA_ANZEIGE,
  PREISE_WIDGET_ANZEIGE,
  preiseHolidayLead,
  preiseLeadCopy,
  preisePlanFeatures,
  homePublicStats,
  homePublicFeatures,
  homePublicFeaturesLead,
  homePublicDifference,
  homePublicHowHeading,
  homePublicHowSteps,
  homePublicProblemItems,
  homePublicProblemLead,
  preiseAddonTagline,
  preiseAddonFeatures,
  preisePublicFaq,
  LEITUNG_ANZEIGE_ID,
  HEUTE_LEITUNG_ANZEIGE_ID,
  SETTINGS_LEITUNG_ANZEIGE_ID,
  DESK_LEITUNG_FEHLT_ID,
  leitungMissingShowsDemo,
  leitungMissingShowsAnrufen,
  leitungPublicShowsLive,
  sprechenDeskOpenVisible,
  heuteEmptyCopy,
  NACHRICHTEN_EMPTY_ID,
  NACHRICHTEN_MAIL_EMPTY_ID,
  NACHRICHTEN_EMPTY_COPY,
  NACHRICHTEN_MAIL_EMPTY_COPY,
  NACHRICHTEN_EMPTY_COPY_ANZEIGE,
  nachrichtenEmptyCopy,
  nachrichtenMailEmptyCopy,
  NACHRICHTEN_LEAD_ID,
  NACHRICHTEN_LEAD,
  NACHRICHTEN_LEAD_ANZEIGE,
  nachrichtenLead,
  NACHRICHTEN_UNREAD_ID,
  NACHRICHTEN_UNREAD_COPY,
  NACHRICHTEN_UNREAD_COPY_ANZEIGE,
  nachrichtenUnreadCopy,
  KALENDER_LEAD_ID,
  KALENDER_LEAD,
  KALENDER_LEAD_ANZEIGE,
  kalenderLead,
  heuteWalkInLinkVisible,
  walkInFormVisible,
  walkInTitle,
  akteContactSaveVisible,
  akteFelderVisible,
  AKTE_FELDER_ANZEIGE,
  AKTE_FELDER_ANZEIGE_ID,
  slotWriteVisible,
  notfallWriteVisible,
  internGelesenVisible,
  callErledigtVisible,
  gelerntWriteVisible,
  SETTINGS_GELERNT_ANZEIGE,
  SETTINGS_GELERNT_ANZEIGE_ID,
  SETTINGS_GELERNT_LEAD,
  SETTINGS_GELERNT_LEAD_ANZEIGE,
  SETTINGS_GELERNT_LEAD_ID,
  settingsGelerntLead,
  HEUTE_NOTIZ_ANZEIGE_ID,
  HEUTE_NOTIZ_TITLE,
  HEUTE_NOTIZ_TITLE_ANZEIGE,
  heuteNotizTitle,
  zugangWriteVisible,
  SETTINGS_ZUGANG_ANZEIGE,
  SETTINGS_ZUGANG_ANZEIGE_ID,
  settingsSaveVisible,
  SETTINGS_SAVE_ANZEIGE_ID,
  heuteKurzspeichernVisible,
  heuteKurzAnzeigeId,
  HEUTE_KURZ_ANZEIGE,
  HEUTE_WHATSAPP_TITLE_ID,
  HEUTE_WHATSAPP_TITLE,
  HEUTE_WHATSAPP_TITLE_ANZEIGE,
  heuteWhatsappTitle,
  heuteZeitenVorlageWriteVisible,
  heuteZeitenVorlageTitle,
  heuteZeitenVorlageSettings,
  HEUTE_ZEITEN_VORLAGE_SETTINGS_ID,
  HEUTE_ZEITEN_VORLAGE_SETTINGS,
  HEUTE_ZEITEN_VORLAGE_SETTINGS_ANZEIGE,
  HEUTE_ZEITEN_VORLAGE_ANZEIGE,
  HEUTE_ZEITEN_VORLAGE_ANZEIGE_ID,
  HEUTE_ZEITEN_VORLAGE_TITLE_ID,
  HEUTE_ZEITEN_VORLAGE_TITLE,
  HEUTE_ZEITEN_VORLAGE_TITLE_ANZEIGE,
  HEUTE_VQUADRAT_SPIEGEL_ID,
  SETTINGS_VQUADRAT_SPIEGEL_ID,
  HEUTE_VQUADRAT_ANZEIGE_ID,
  SETTINGS_VQUADRAT_ANZEIGE_ID,
  VQUADRAT_SPIEGEL_TITLE,
  VQUADRAT_SPIEGEL_LEAD,
  VQUADRAT_SPIEGEL_LEAD_ANZEIGE,
  VQUADRAT_SPIEGEL_ANZEIGE,
  VQUADRAT_SPIEGEL_EMPTY,
  VQUADRAT_SPIEGEL_EMPTY_ANZEIGE,
  VQUADRAT_SPIEGEL_WALKIN,
  VQUADRAT_SPIEGEL_AKTE,
  VQUADRAT_SPIEGEL_AKTE_ANZEIGE,
  vquadratSpiegelLead,
  vquadratSpiegelEmptyCopy,
  vquadratSpiegelAkteLabel,
  vquadratSpiegelWriteVisible,
  akteEmptyCopy,
  AKTE_LEAD_ID,
  AKTE_LEAD,
  AKTE_LEAD_ANZEIGE,
  akteLead,
  AKTE_SEARCH_EMPTY_ID,
  AKTE_SEARCH_EMPTY_COPY,
  AKTE_SEARCH_EMPTY_COPY_ANZEIGE,
  akteSearchEmptyCopy,
  akteNeuFormVisible,
  akteNeuTitle,
  heuteZuFormVisible,
  heuteZuTitle,
  sprechenStaffShowsLive,
  sprechenLoginDest,
  DESK_HEADER_DEMO_ID,
  DESK_HEADER_DEMO_MOBILE_ID,
  headerShowsDemoRequest,
  sprechenPublicNavTo,
  DESK_HEADER_ANRUFEN_ID,
  DESK_HEADER_ANRUFEN_MOBILE_ID,
  DESK_FOOTER_ANRUFEN_ID,
  deskAnzeigeAuthLine,
  deskBackupAnzeigeLine,
  sprechenAnzeigeAuthLine,
  sprechenPublicShowsDemo,
  anzeigeCopyError,
  anzeigeLadenFailOf,
  anzeigeStandLabel,
  clearAnzeigeCopyFail,
  noteAnzeigeCopyFail,
  subscribeAnzeigeCopyFail,
} from "./tafel-anzeige.ts";

test("Anzeige Anmelden and Registrieren show the same lasting line as the Tafel banner", () => {
  assert.equal(DESK_ANZEIGE_ID, "desk-tafel-anzeige");
  assert.equal(deskAnzeigeAuthLine(true), TAFEL_ANZEIGE_BANNER);
  assert.equal(deskAnzeigeAuthLine(true), TAFEL_ANZEIGE_ERROR);
  assert.equal(deskAnzeigeAuthLine(false), "");
  assert.equal(deskAnzeigeAuthLine(), "");
  assert.match(TAFEL_ANZEIGE_ERROR, /^Nur Anzeige\./);
  assert.match(TAFEL_ANZEIGE_ERROR, /Praxistafel/);
  assert.match(TAFEL_ANZEIGE_ERROR, /Heute/);
  assert.match(TAFEL_ANZEIGE_ERROR, /Termine/);
  assert.match(TAFEL_ANZEIGE_ERROR, /Anrufe/);
  assert.doesNotMatch(TAFEL_ANZEIGE_ERROR, /Die Tafel ist/);
});

test("Anzeige disables Eintragen, Walk-in fields, Akte fields, Einstellungen fields, Merken, Tafel sichern and Tafel holen in the UI", () => {
  assert.deepEqual(anzeigeControl(false), {
    disabled: false,
    title: undefined,
  });
  assert.deepEqual(anzeigeControl(), { disabled: false, title: undefined });
  const on = anzeigeControl(true);
  assert.equal(on.disabled, true);
  assert.equal(on.title, TAFEL_ANZEIGE_ERROR);
});

test("Anzeige Heute and Einstellungen drop Tafel sichern/holen for a lasting line", () => {
  assert.equal(HEUTE_BACKUP_ANZEIGE_ID, "heute-backup-anzeige");
  assert.equal(HEUTE_BACKUP_TITLE_ID, "heute-backup-title");
  assert.equal(HEUTE_BACKUP_TITLE_ANZEIGE, "Praxistafel.");
  assert.doesNotMatch(HEUTE_BACKUP_TITLE_ANZEIGE, /sicher|Tafel\./);
  assert.equal(
    heuteBackupTitle(true, "Tafel noch nicht gesichert."),
    HEUTE_BACKUP_TITLE_ANZEIGE,
  );
  assert.equal(
    heuteBackupTitle(true, "Tafel-Sicherung ist älter als eine Woche."),
    HEUTE_BACKUP_TITLE_ANZEIGE,
  );
  assert.equal(
    heuteBackupTitle(true, "Zuletzt gesichert: Montag, 1.9. um 10:00."),
    HEUTE_BACKUP_TITLE_ANZEIGE,
  );
  assert.equal(
    heuteBackupTitle(false, "Tafel noch nicht gesichert."),
    "Tafel noch nicht gesichert.",
  );
  assert.equal(heuteBackupTitle(), "");
  assert.equal(SETTINGS_BACKUP_ANZEIGE_ID, "settings-backup-anzeige");
  assert.equal(SETTINGS_BACKUP_LAST_ID, "settings-backup-last");
  assert.equal(settingsBackupLastVisible(), true);
  assert.equal(settingsBackupLastVisible(false), true);
  assert.equal(settingsBackupLastVisible(true), false);
  assert.equal(AKTE_NEU_ANZEIGE_ID, "akte-neu-anzeige");
  assert.equal(SETTINGS_FELDER_ANZEIGE_ID, "settings-felder-anzeige");
  assert.equal(deskBackupAnzeigeLine(true), TAFEL_ANZEIGE_ERROR);
  assert.equal(deskBackupAnzeigeLine(false), "");
  assert.equal(deskBackupAnzeigeLine(), "");
});

test("Anzeige live line points staff to the writer PC", () => {
  assert.match(TAFEL_ANZEIGE_LINE, /Leitung/);
  assert.match(TAFEL_ANZEIGE_LINE, /anderen Rechner/);
  assert.notEqual(TAFEL_ANZEIGE_LINE, TAFEL_ANZEIGE_ERROR);
});

test("Anzeige logged-out /sprechen hides the Huber demo", () => {
  assert.equal(SPRECHEN_DEMO_BANNER_ID, "sprechen-demo-banner");
  assert.equal(sprechenAnzeigeAuthLine(true), TAFEL_ANZEIGE_LINE);
  assert.equal(sprechenAnzeigeAuthLine(false), "");
  assert.equal(sprechenAnzeigeAuthLine(), "");
  assert.equal(sprechenPublicShowsDemo({}), true);
  assert.equal(
    sprechenPublicShowsDemo({ anzeige: false, expired: false }),
    true,
  );
  assert.equal(sprechenPublicShowsDemo({ anzeige: true }), false);
  assert.equal(
    sprechenPublicShowsDemo({ anzeige: true, expired: false }),
    false,
  );
  assert.equal(sprechenPublicShowsDemo({ expired: true }), false);
});

test("Anzeige homepage hides the Huber embed", () => {
  assert.equal(DESK_HOME_ANZEIGE_ID, "desk-home-anzeige");
  assert.equal(DESK_HOME_HEAR_ID, "desk-home-hear");
  assert.equal(DESK_HOME_MITTAG_ID, "desk-home-mittag");
  assert.equal(DESK_HOME_CALL_ID, "desk-home-call");
  assert.equal(DESK_WERKZEUGE_MITTAG_ID, "desk-werkzeuge-mittag");
  assert.equal(DESK_WERKZEUGE_ANRUFEN_ID, "desk-werkzeuge-anrufen");
  assert.equal(DESK_WERKZEUGE_CHIP_ID, "desk-werkzeuge-chip");
  assert.equal(DESK_WERKZEUGE_REISE_ID, "desk-werkzeuge-reise");
  assert.equal(DESK_WERKZEUGE_NACHT_ID, "desk-werkzeuge-nacht");
  assert.equal(DESK_WERKZEUGE_FRITZ_ID, "desk-werkzeuge-fritz");
  assert.equal(DESK_HOME_CHIP_ID, "desk-home-chip");
  assert.equal(DESK_HOME_FACES_ID, "desk-home-faces");
  assert.equal(DESK_HOME_FILM_ID, "desk-home-film");
  assert.equal(DESK_HOME_AUSTRIA_ID, "desk-home-austria");
  assert.equal(DESK_HOME_KILLERS_ID, "desk-home-killers");
  assert.equal(DESK_HOME_NIGHT_ID, "desk-home-night");
  assert.equal(DESK_HOME_FAQ_ID, "desk-home-faq");
  assert.equal(DESK_HOME_SOCIAL_ID, "desk-home-social");
  assert.equal(DESK_HOME_HERO_COPY_ID, "desk-home-hero-copy");
  assert.equal(DESK_HOME_TESTEN_ID, "desk-home-testen");
  assert.equal(DESK_HOME_HERO_TAFEL_ID, "desk-home-hero-tafel");
  assert.equal(DESK_HOME_CLOSE_ID, "desk-home-close");
  assert.equal(DESK_HOME_FEATURES_ID, "desk-home-features");
  assert.equal(DESK_HOME_FEATURES_WA_ID, "desk-home-features-wa");
  const wa = {
    title: "WhatsApp als zweites Ohr",
    body: "Silvia führt den Chat, schickt Terminlinks und holt Impfpass-Fotos.",
  };
  const phone = { title: "Telefon", body: "Silvia nimmt ab." };
  assert.deepEqual(homePublicFeatures([wa, phone]), [wa, phone]);
  assert.deepEqual(homePublicFeatures([wa, phone], true), [
    { title: wa.title, body: HOME_WA_ANZEIGE_BODY },
    phone,
  ]);
  assert.doesNotMatch(
    HOME_WA_ANZEIGE_BODY,
    /führt den Chat|schickt Terminlinks/,
  );
  assert.equal(DESK_HOME_FEATURES_LEAD_ID, "desk-home-features-lead");
  assert.equal(DESK_HOME_FEATURES_NACHT_ID, "desk-home-features-nacht");
  assert.equal(homePublicFeaturesLead(), HOME_FEATURES_LEAD);
  assert.equal(homePublicFeaturesLead(true), HOME_FEATURES_LEAD_ANZEIGE);
  assert.match(HOME_FEATURES_LEAD, /keine Diagnose/);
  assert.doesNotMatch(HOME_FEATURES_LEAD_ANZEIGE, /bucht und verbindet/);
  assert.match(HOME_FEATURES_LEAD_ANZEIGE, /Tierarzthelferin auf der Tafel/);
  const nacht = {
    title: "Notfall, nicht Mobilbox",
    body: "Silvia erkennt die Lage und verbindet zum hinterlegten Nachtdienst.",
  };
  assert.deepEqual(homePublicFeatures([nacht]), [nacht]);
  assert.deepEqual(homePublicFeatures([nacht], true), [
    { title: nacht.title, body: HOME_NACHT_ANZEIGE_BODY },
  ]);
  assert.match(HOME_NACHT_ANZEIGE_BODY, /verbindet nicht selbst/);
  assert.doesNotMatch(HOME_NACHT_ANZEIGE_BODY, /verbindet zum hinterlegten/);
  assert.equal(DESK_HOME_FEATURES_FEIER_ID, "desk-home-features-feier");
  const feier = {
    title: "Kalender, der Österreich kennt",
    body: "Keine Termine an Feiertagen, außer Sie wollen den Nachtdienst ausdrücklich offen halten.",
  };
  assert.deepEqual(homePublicFeatures([feier]), [feier]);
  assert.deepEqual(homePublicFeatures([feier], true), [
    { title: feier.title, body: HOME_FEATURES_FEIER_ANZEIGE },
  ]);
  assert.doesNotMatch(HOME_FEATURES_FEIER_ANZEIGE, /offen halten|Nachtdienst/);
  assert.match(HOME_FEATURES_FEIER_ANZEIGE, /Feiertage bleiben geschlossen/);
  assert.equal(DESK_HOME_HOW_ID, "desk-home-how");
  assert.equal(DESK_HOME_HOW_HEAD_ID, "desk-home-how-head");
  assert.equal(DESK_HOME_HOW_LINE_ID, "desk-home-how-line");
  assert.equal(DESK_HOME_HOW_PMS_ID, "desk-home-how-pms");
  assert.equal(DESK_HOME_HOW_WORK_ID, "desk-home-how-work");
  assert.equal(DESK_HOME_FEATURES_PMS_ID, "desk-home-features-pms");
  assert.equal(homePublicHowHeading(), HOME_HOW_HEADING);
  assert.equal(homePublicHowHeading(true), HOME_HOW_HEADING_ANZEIGE);
  assert.match(HOME_HOW_HEADING, /Gemeinsam einrichten/);
  assert.doesNotMatch(HOME_HOW_HEADING_ANZEIGE, /fünf Werktagen|live/);
  assert.match(HOME_HOW_HEADING_ANZEIGE, /Schreib-Rechner/);
  const lineStep = {
    n: "01",
    t: "Nummer oder WhatsApp auf Silvia",
    d: "Parallel zu Ihrer Linie oder als Nachtumleitung.",
  };
  const pmsStep = {
    n: "02",
    t: "PMS und Kalender koppeln",
    d: "vetera, easyVET. Termine landen dort.",
  };
  const liveStep = {
    n: "03",
    t: "Silvia arbeitet",
    d: "Bucht, triagiert, dokumentiert.",
  };
  assert.deepEqual(homePublicHowSteps([lineStep, pmsStep, liveStep]), [
    lineStep,
    pmsStep,
    liveStep,
  ]);
  assert.deepEqual(homePublicHowSteps([lineStep, pmsStep, liveStep], true), [
    { n: "01", t: HOME_HOW_LINE_ANZEIGE_TITLE, d: HOME_HOW_LINE_ANZEIGE_BODY },
    { n: "02", t: HOME_HOW_PMS_ANZEIGE_TITLE, d: HOME_HOW_PMS_ANZEIGE_BODY },
    { n: "03", t: HOME_HOW_WORK_ANZEIGE_TITLE, d: HOME_HOW_WORK_ANZEIGE_BODY },
  ]);
  assert.doesNotMatch(HOME_HOW_LINE_ANZEIGE_TITLE, /WhatsApp auf Silvia/);
  assert.doesNotMatch(HOME_HOW_LINE_ANZEIGE_BODY, /Nachtumleitung|portieren/);
  assert.match(HOME_HOW_LINE_ANZEIGE_BODY, /portiert nichts/);
  assert.doesNotMatch(HOME_HOW_WORK_ANZEIGE_TITLE, /Silvia arbeitet/);
  assert.doesNotMatch(HOME_HOW_WORK_ANZEIGE_BODY, /triagiert|Am Bildschirm/);
  assert.match(HOME_HOW_WORK_ANZEIGE_BODY, /Protokoll liegt auf der Tafel/);
  assert.match(
    HOME_HOW_WORK_ANZEIGE_BODY,
    /Verbinden tut die Tierarzthelferin/,
  );
  const pmsFeat = {
    title: "Systeme, die Sie schon haben",
    body: "vetera, easyVET. Silvia bucht in denselben Slot.",
  };
  assert.deepEqual(homePublicFeatures([pmsFeat]), [pmsFeat]);
  assert.deepEqual(homePublicFeatures([pmsFeat], true), [
    { title: pmsFeat.title, body: HOME_PMS_ANZEIGE_BODY },
  ]);
  assert.doesNotMatch(
    HOME_PMS_ANZEIGE_BODY,
    /koppelt an vetera|denselben Slot/,
  );
  assert.match(HOME_PMS_ANZEIGE_BODY, /koppelt nicht/);
  assert.equal(DESK_HOME_FEATURES_PROTOKOLL_ID, "desk-home-features-protokoll");
  const protoFeat = {
    title: "Telefon, das wirklich abnimmt",
    body: "Silvia geht in der Mittagssperre, am Samstag und wenn alle im OP sind. Sie bucht, verschiebt, storniert – und schreibt das Protokoll in Ihre Software.",
  };
  assert.deepEqual(homePublicFeatures([protoFeat]), [protoFeat]);
  assert.deepEqual(homePublicFeatures([protoFeat], true), [
    { title: protoFeat.title, body: HOME_PROTOKOLL_ANZEIGE_BODY },
  ]);
  assert.doesNotMatch(
    HOME_PROTOKOLL_ANZEIGE_BODY,
    /in Ihre Software|am Samstag/,
  );
  assert.match(HOME_PROTOKOLL_ANZEIGE_BODY, /auf der Tafel/);
  assert.equal(DESK_HOME_DIFFERENCE_ID, "desk-home-difference");
  assert.equal(DESK_HOME_DIFFERENCE_WA_ID, "desk-home-difference-wa");
  assert.equal(DESK_HOME_DIFFERENCE_NACHT_ID, "desk-home-difference-nacht");
  assert.equal(
    DESK_HOME_DIFFERENCE_REGISTER_ID,
    "desk-home-difference-register",
  );
  const diff = [
    {
      title: "Kanäle",
      ours: "Telefon und WhatsApp gleichwertig",
      other: "Telefon zuerst",
    },
    {
      title: "Nacht",
      ours: "Triage plus Verbindung zum Tiernotruf",
      other: "Bandansage",
    },
    {
      title: "Kalender",
      ours: "13 Feiertage, Samstagfrüh",
      other: "Deutsche Feiertage",
    },
    {
      title: "Register",
      ours: "Chip, Heimtierdatenbank, Hundeabgabe MA 6, EU-Ausweis",
      other: "Kein AT-Register",
    },
    { title: "Sprache", ours: "Grüß Gott", other: "Hallo" },
  ];
  assert.deepEqual(homePublicDifference(diff), diff);
  assert.deepEqual(homePublicDifference(diff, true), [
    { title: "Kanäle", ours: HOME_DIFF_WA_ANZEIGE, other: "Telefon zuerst" },
    { title: "Nacht", ours: HOME_DIFF_NACHT_ANZEIGE, other: "Bandansage" },
    {
      title: "Kalender",
      ours: HOME_DIFF_KALENDER_ANZEIGE,
      other: "Deutsche Feiertage",
    },
    {
      title: "Register",
      ours: HOME_DIFF_REGISTER_ANZEIGE,
      other: "Kein AT-Register",
    },
    { title: "Sprache", ours: "Grüß Gott", other: "Hallo" },
  ]);
  assert.doesNotMatch(HOME_DIFF_WA_ANZEIGE, /gleichwertig/);
  assert.doesNotMatch(HOME_DIFF_NACHT_ANZEIGE, /Triage|Tiernotruf/);
  assert.match(HOME_DIFF_NACHT_ANZEIGE, /Notfall auf der Tafel/);
  assert.doesNotMatch(HOME_DIFF_KALENDER_ANZEIGE, /Samstagfrüh/);
  assert.doesNotMatch(
    HOME_DIFF_REGISTER_ANZEIGE,
    /Heimtierdatenbank|Hundeabgabe MA 6|EU-Ausweis/,
  );
  assert.match(HOME_DIFF_REGISTER_ANZEIGE, /Chip in der Akte/);
  assert.match(HOME_DIFF_REGISTER_ANZEIGE, /Kein Heimtierregister/);
  assert.equal(DESK_HOME_PROBLEM_ID, "desk-home-problem");
  assert.equal(DESK_HOME_PROBLEM_LEAD_ID, "desk-home-problem-lead");
  assert.equal(DESK_HOME_PROBLEM_WA_ID, "desk-home-problem-wa");
  assert.equal(DESK_HOME_PROBLEM_NACHT_ID, "desk-home-problem-nacht");
  assert.equal(homePublicProblemLead(), HOME_PROBLEM_LEAD);
  assert.equal(homePublicProblemLead(true), HOME_PROBLEM_LEAD_ANZEIGE);
  assert.match(HOME_PROBLEM_LEAD, /WhatsApp/);
  assert.doesNotMatch(
    HOME_PROBLEM_LEAD_ANZEIGE,
    /Deutschland|WhatsApp als Standard|Linz/,
  );
  assert.match(HOME_PROBLEM_LEAD_ANZEIGE, /wa\.me-Entwurf/);
  assert.match(HOME_PROBLEM_LEAD_ANZEIGE, /verbindet niemanden/);
  const problem = [
    {
      t: "Verpasste Anrufe",
      d: "Die häufigste 1-Stern-Bewertung in AT-Ordinationen.",
    },
    { t: "WhatsApp ungelesen", d: HOME_PROBLEM_WA },
    { t: "Nacht ohne Netz", d: HOME_PROBLEM_NACHT },
    {
      t: "Kalender daneben",
      d: "Feiertage und Mittagssperre werden falsch angeboten.",
    },
  ];
  assert.deepEqual(homePublicProblemItems(problem), problem);
  assert.deepEqual(homePublicProblemItems(problem, true), [
    problem[0],
    { t: "WhatsApp ungelesen", d: HOME_PROBLEM_WA_ANZEIGE },
    { t: "Nacht ohne Netz", d: HOME_PROBLEM_NACHT_ANZEIGE },
    problem[3],
  ]);
  assert.doesNotMatch(HOME_PROBLEM_WA_ANZEIGE, /mithalten|schreibt/);
  assert.match(HOME_PROBLEM_WA_ANZEIGE, /wa\.me-Entwurf/);
  assert.match(HOME_PROBLEM_WA_ANZEIGE, /keinen Chat/);
  assert.doesNotMatch(HOME_PROBLEM_NACHT_ANZEIGE, /Mobilbox|Triage/);
  assert.match(HOME_PROBLEM_NACHT_ANZEIGE, /tel:/);
  assert.match(HOME_PROBLEM_NACHT_ANZEIGE, /verbindet niemanden/);
  assert.equal(homePublicShowsDemo(), true);
  assert.equal(homePublicShowsDemo(false), true);
  assert.equal(homePublicShowsDemo(true), false);
});

test("Anzeige /demo leaves the Huber sandbox", () => {
  assert.equal(demoPublicShowsHuber(), true);
  assert.equal(demoPublicShowsHuber(false), true);
  assert.equal(demoPublicShowsHuber(true), false);
  assert.equal(demoPublicNavTo(true), "/app");
  assert.equal(demoPublicNavTo(false), "/demo");
  assert.equal(demoPublicNavTo(), "/demo");
  assert.equal(demoAkteNavTo(true), "/app/akte");
  assert.equal(demoAkteNavTo(false), "/demo/akte");
  assert.equal(DESK_HEADER_PRAXISTAFEL_ID, "desk-header-praxistafel");
  assert.equal(
    DESK_HEADER_PRAXISTAFEL_MOBILE_ID,
    "desk-header-praxistafel-mobile",
  );
  assert.equal(DESK_FOOTER_PRAXISTAFEL_ID, "desk-footer-praxistafel");
  assert.equal(DESK_LANDING_PRAXISTAFEL_ID, "desk-landing-praxistafel");
  assert.equal(DESK_WERKZEUGE_AKTE_ID, "desk-werkzeuge-akte");
  assert.equal(DESK_WERKZEUGE_LEAD_ID, "desk-werkzeuge-lead");
  assert.equal(DESK_WERKZEUGE_HEAD_ID, "desk-werkzeuge-head");
  assert.equal(werkzeugePublicLead(), WERKZEUGE_LEAD);
  assert.equal(werkzeugePublicLead(true), WERKZEUGE_LEAD_ANZEIGE);
  assert.equal(werkzeugePublicHeading(), WERKZEUGE_HEADING);
  assert.equal(werkzeugePublicHeading(true), WERKZEUGE_HEADING_ANZEIGE);
  assert.match(WERKZEUGE_HEADING, /VetPal/);
  assert.doesNotMatch(WERKZEUGE_HEADING_ANZEIGE, /VetPal/);
  assert.match(WERKZEUGE_HEADING_ANZEIGE, /Tafel/);
  assert.match(WERKZEUGE_LEAD, /Chip, Reise|Nachtdienst je Bundesland/);
  assert.doesNotMatch(
    WERKZEUGE_LEAD_ANZEIGE,
    /Chip, Reise|Nachtdienst je Bundesland/,
  );
  assert.match(WERKZEUGE_LEAD_ANZEIGE, /Schreib-Rechner/);
  assert.match(WERKZEUGE_LEAD_ANZEIGE, /Kartei liegt auf der Tafel/);
});

test("Anzeige /preise drops Fritz and Vetmeduni copy", () => {
  assert.equal(DESK_PREISE_AKTE_ID, "desk-preise-akte");
  assert.equal(DESK_PREISE_FAQ_ID, "desk-preise-faq");
  assert.equal(DESK_PREISE_FAQ_WA_ID, "desk-preise-faq-wa");
  assert.equal(DESK_PREISE_FAQ_NACHT_ID, "desk-preise-faq-nacht");
  assert.equal(DESK_PREISE_LEAD_ID, "desk-preise-lead");
  assert.equal(DESK_PREISE_FEIER_ID, "desk-preise-feier");
  assert.equal(preiseHolidayLead(), PREISE_FEIER_LEAD);
  assert.equal(preiseHolidayLead(true), PREISE_FEIER_LEAD_ANZEIGE);
  assert.match(PREISE_FEIER_LEAD, /offen halten/);
  assert.doesNotMatch(PREISE_FEIER_LEAD_ANZEIGE, /offen halten|Nachtdienst/);
  assert.match(PREISE_FEIER_LEAD_ANZEIGE, /Tafel geschlossen/);
  assert.equal(DESK_HOME_STATS_ID, "desk-home-stats");
  assert.match(PREISE_LEAD, /lokale Praxisvariante|Demo und Abnahme/);
  assert.doesNotMatch(PREISE_LEAD_ANZEIGE, /21 Tage|monatlich kündbar|Einrichtung kostet nichts/);
  assert.equal(preiseLeadCopy(), PREISE_LEAD);
  assert.equal(preiseLeadCopy(true), PREISE_LEAD_ANZEIGE);
  assert.deepEqual(
    preisePlanFeatures(["Termine", "21 Tage unverbindlich testen"]),
    ["Termine", "21 Tage unverbindlich testen"],
  );
  assert.deepEqual(
    preisePlanFeatures(["Termine", "21 Tage unverbindlich testen"], true),
    ["Termine"],
  );
  assert.deepEqual(
    preisePlanFeatures(["Termine", "WhatsApp Business inkl. Terminlinks"]),
    ["Termine", "WhatsApp Business inkl. Terminlinks"],
  );
  assert.deepEqual(
    preisePlanFeatures(
      ["Termine", "WhatsApp Business inkl. Terminlinks"],
      true,
    ),
    ["Termine", PREISE_WA_ANZEIGE],
  );
  assert.doesNotMatch(PREISE_WA_ANZEIGE, /WhatsApp Business|Terminlinks/);
  assert.deepEqual(
    preisePlanFeatures([
      "Termine",
      "PMS-Anbindung (vetera, easyVET)",
      "Web-Buchungswidget für die Praxiswebsite",
      "Protokoll an E-Mail und PMS",
    ]),
    [
      "Termine",
      "PMS-Anbindung (vetera, easyVET)",
      "Web-Buchungswidget für die Praxiswebsite",
      "Protokoll an E-Mail und PMS",
    ],
  );
  assert.deepEqual(
    preisePlanFeatures(
      [
        "Termine",
        "PMS-Anbindung (vetera, easyVET)",
        "Web-Buchungswidget für die Praxiswebsite",
        "Protokoll an E-Mail und PMS",
      ],
      true,
    ),
    [
      "Termine",
      PREISE_PMS_ANZEIGE,
      PREISE_WIDGET_ANZEIGE,
      PREISE_PROTOKOLL_ANZEIGE,
    ],
  );
  assert.doesNotMatch(PREISE_PMS_ANZEIGE, /PMS-Anbindung/);
  assert.deepEqual(
    preisePlanFeatures(
      [
        "Termine",
        "Notfall-Triage mit Nachtdienst-Weiterleitung",
        "Impf- und Chip-Erinnerungen",
        "Praxistafel mit Live-Gesprächen",
      ],
      true,
    ),
    [
      "Termine",
      PREISE_NACHT_ANZEIGE,
      PREISE_ERINNER_ANZEIGE,
      PREISE_LIVE_ANZEIGE,
    ],
  );
  assert.doesNotMatch(PREISE_NACHT_ANZEIGE, /Weiterleitung/);
  assert.doesNotMatch(PREISE_ERINNER_ANZEIGE, /Impf- und Chip-Erinnerungen/);
  assert.match(PREISE_ERINNER_ANZEIGE, /keine automatischen Erinnerungen/);
  assert.doesNotMatch(PREISE_LIVE_ANZEIGE, /Live-Gesprächen/);
  assert.deepEqual(
    preisePublicFaq(
      [{ q: "Chip?", a: "Silvia erinnert an die Impfung." }],
      true,
    ),
    [],
  );
  assert.deepEqual(
    preiseAddonFeatures(["Chip", "Abgleich mit vetera / easyVET"], true),
    ["Chip"],
  );
  assert.deepEqual(
    preisePublicFaq([{ q: "Software?", a: "vetera und easyVET." }], true),
    [],
  );
  const stats = [
    { value: "92 %", label: "erledigt" },
    { value: "21 Tage", label: "testen, ohne Vertrag" },
    { value: "9 Länder", label: "alle Bundesländer, eine Nummer" },
  ];
  assert.equal(DESK_HOME_STATS_NUMMER_ID, "desk-home-stats-nummer");
  assert.equal(DESK_HOME_STATS_ERLEDIGT_ID, "desk-home-stats-erledigt");
  assert.equal(homePublicStats(stats).length, 3);
  assert.deepEqual(homePublicStats(stats, true), [
    { value: "9 Länder", label: HOME_STATS_NUMMER_ANZEIGE },
  ]);
  assert.deepEqual(
    homePublicStats([{ value: "Test", label: "nach Abstimmung" }], true),
    [],
  );
  assert.doesNotMatch(HOME_STATS_NUMMER_ANZEIGE, /eine Nummer/);
  assert.match(HOME_STATS_NUMMER_ANZEIGE, /ohne Portierung/);
  assert.equal(
    homePublicStats(
      [{ value: "92 %", label: "der Anrufe ohne Ihr Zutun erledigt" }],
      true,
    ).length,
    0,
  );
  assert.equal(
    preiseAddonTagline("Silvia kennt Fritz."),
    "Silvia kennt Fritz.",
  );
  assert.equal(
    preiseAddonTagline("Silvia kennt Fritz.", false),
    "Silvia kennt Fritz.",
  );
  assert.equal(
    preiseAddonTagline("Silvia kennt Fritz.", true),
    "Die Wissensdatenbank der Ordination.",
  );
  assert.deepEqual(
    preiseAddonFeatures(["Chip", "Wie geht’s dem Kater Fritz?"]),
    ["Chip", "Wie geht’s dem Kater Fritz?"],
  );
  assert.deepEqual(
    preiseAddonFeatures(["Chip", "Wie geht’s dem Kater Fritz?"], true),
    ["Chip"],
  );
  const faq = [
    {
      q: "Nachtdienst?",
      a: "werden an Ihren hinterlegten Nachtdienst verbunden, Vetmeduni Wien",
    },
    { q: "Mindestlaufzeit?", a: "Nein." },
    { q: "Akte?", a: "Fritz in der Box." },
    { q: "Test?", a: "Die ersten 21 Tage sind unverbindlich." },
    {
      q: "Anders?",
      a: "WhatsApp ist kein Zusatz, sondern Kanal eins neben dem Telefon. Preise stehen brutto.",
    },
    {
      q: "Beratung?",
      a: "Termine, Öffnungszeiten, Weiterleitung, saubere Dokumentation.",
    },
  ];
  assert.equal(preisePublicFaq(faq).length, 6);
  assert.deepEqual(preisePublicFaq(faq, true), [
    { q: "Nachtdienst?", a: PREISE_FAQ_NACHT_ANZEIGE },
    { q: "Mindestlaufzeit?", a: "Nein." },
    {
      q: "Anders?",
      a: `${PREISE_FAQ_WA_KANAL_ANZEIGE} Preise stehen brutto.`,
    },
    { q: "Beratung?", a: "Termine, Öffnungszeiten, saubere Dokumentation." },
  ]);
  assert.doesNotMatch(PREISE_FAQ_WA_KANAL_ANZEIGE, /Kanal eins/);
  assert.match(PREISE_FAQ_WA_KANAL_ANZEIGE, /wa\.me-Entwurf/);
  assert.doesNotMatch(PREISE_FAQ_NACHT_ANZEIGE, /verbunden|Vetmeduni|SMS/);
  assert.match(PREISE_FAQ_NACHT_ANZEIGE, /verbindet nicht selbst/);
  const deFaq = {
    q: "Was ist anders als bei Lösungen aus Deutschland?",
    a: "Silvia spricht österreichisches Deutsch, kennt Ordinationszeiten inklusive Mittagssperre, österreichische Feiertage, den Nachtdienst je Bundesland und das Heimtierregister. WhatsApp ist kein Zusatz, sondern Kanal eins neben dem Telefon. Preise stehen brutto und netto, mit 20 % USt.",
  };
  assert.deepEqual(preisePublicFaq([deFaq]), [deFaq]);
  assert.deepEqual(preisePublicFaq([deFaq], true), [
    {
      q: deFaq.q,
      a: `Silvia spricht österreichisches Deutsch, kennt Ordinationszeiten inklusive Mittagssperre, österreichische Feiertage, ${PREISE_FAQ_REGISTER_ANZEIGE}. ${PREISE_FAQ_WA_KANAL_ANZEIGE} Preise stehen brutto und netto, mit 20 % USt.`,
    },
  ]);
  assert.doesNotMatch(
    PREISE_FAQ_REGISTER_ANZEIGE,
    /je Bundesland und das Heimtierregister/,
  );
  assert.match(PREISE_FAQ_REGISTER_ANZEIGE, /kein Heimtierregister/);
  assert.match(PREISE_FAQ_REGISTER_ANZEIGE, /Chip steht in der Akte/);
});

test("Anzeige public Leitung is not live", () => {
  assert.equal(LEITUNG_ANZEIGE_ID, "desk-leitung-anzeige");
  assert.equal(HEUTE_LEITUNG_ANZEIGE_ID, "heute-leitung-anzeige");
  assert.equal(SETTINGS_LEITUNG_ANZEIGE_ID, "settings-leitung-anzeige");
  assert.equal(leitungPublicShowsLive(), true);
  assert.equal(leitungPublicShowsLive(false), true);
  assert.equal(leitungPublicShowsLive(true), false);
});

test("unknown /leitung never offers the Huber demo", () => {
  assert.equal(DESK_LEITUNG_FEHLT_ID, "desk-leitung-fehlt");
  assert.equal(leitungMissingShowsDemo(), false);
  assert.equal(leitungMissingShowsDemo(false), false);
  assert.equal(leitungMissingShowsDemo(true), false);
  assert.equal(leitungMissingShowsAnrufen(), false);
  assert.equal(leitungMissingShowsAnrufen(false), false);
  assert.equal(leitungMissingShowsAnrufen(true), false);
});

test("Anzeige Tafel chrome does not open /sprechen", () => {
  assert.equal(sprechenDeskOpenVisible(), true);
  assert.equal(sprechenDeskOpenVisible(false), true);
  assert.equal(sprechenDeskOpenVisible(true), false);
});

test("Anzeige Heute drops Walk-in legen and the empty Walk-in invite", () => {
  assert.equal(HEUTE_ZEITEN_WALKIN_ID, "heute-zeiten-walkin");
  assert.equal(HEUTE_LEER_ID, "heute-leer");
  assert.equal(heuteWalkInLinkVisible(), true);
  assert.equal(heuteWalkInLinkVisible(false), true);
  assert.equal(heuteWalkInLinkVisible(true), false);
  assert.equal(heuteEmptyCopy(), HEUTE_EMPTY_COPY);
  assert.equal(heuteEmptyCopy(false), HEUTE_EMPTY_COPY);
  assert.equal(heuteEmptyCopy(true), HEUTE_EMPTY_COPY_ANZEIGE);
  assert.match(HEUTE_EMPTY_COPY, /Walk-in legen/);
  assert.doesNotMatch(
    HEUTE_EMPTY_COPY_ANZEIGE,
    /Walk-in|Anrufen|öffentlichen Link/,
  );
  assert.match(HEUTE_EMPTY_COPY_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Kalender drops Walk-in tragen and To: leer tippt on the lead", () => {
  assert.equal(KALENDER_LEAD_ID, "kalender-lead");
  assert.equal(kalenderLead(), KALENDER_LEAD);
  assert.equal(kalenderLead(false), KALENDER_LEAD);
  assert.equal(kalenderLead(true), KALENDER_LEAD_ANZEIGE);
  assert.match(KALENDER_LEAD, /Walk-in tragen Sie/);
  assert.match(KALENDER_LEAD, /To: leer tippt die Tierarzthelferin/);
  assert.doesNotMatch(
    KALENDER_LEAD_ANZEIGE,
    /tragen Sie|tippt|selbst ein|fehlt|anlegen/i,
  );
  assert.match(KALENDER_LEAD_ANZEIGE, /Praxistafel/);
  assert.match(KALENDER_LEAD_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Protokoll drops Walk-in on the lead", () => {
  assert.equal(NACHRICHTEN_LEAD_ID, "protokoll-lead");
  assert.equal(nachrichtenLead(), NACHRICHTEN_LEAD);
  assert.equal(nachrichtenLead(false), NACHRICHTEN_LEAD);
  assert.equal(nachrichtenLead(true), NACHRICHTEN_LEAD_ANZEIGE);
  assert.match(NACHRICHTEN_LEAD, /Walk-in/);
  assert.doesNotMatch(
    NACHRICHTEN_LEAD_ANZEIGE,
    /Walk-in|tragen|anlegen|fehlt|Speichern/i,
  );
  assert.match(NACHRICHTEN_LEAD_ANZEIGE, /Praxistafel/);
});

test("Anzeige Protokoll drops Walk-in legen and Silvia anrufen on the empty list", () => {
  assert.equal(NACHRICHTEN_EMPTY_ID, "protokoll-leer");
  assert.equal(NACHRICHTEN_MAIL_EMPTY_ID, "protokoll-mail-leer");
  assert.equal(nachrichtenEmptyCopy(), NACHRICHTEN_EMPTY_COPY);
  assert.equal(nachrichtenEmptyCopy(false), NACHRICHTEN_EMPTY_COPY);
  assert.equal(nachrichtenEmptyCopy(true), NACHRICHTEN_EMPTY_COPY_ANZEIGE);
  assert.equal(nachrichtenMailEmptyCopy(), NACHRICHTEN_MAIL_EMPTY_COPY);
  assert.equal(nachrichtenMailEmptyCopy(true), NACHRICHTEN_EMPTY_COPY_ANZEIGE);
  assert.match(NACHRICHTEN_EMPTY_COPY, /Walk-in/);
  assert.match(NACHRICHTEN_EMPTY_COPY, /Silvia an/);
  assert.match(NACHRICHTEN_MAIL_EMPTY_COPY, /Rufen Sie an/);
  assert.doesNotMatch(
    NACHRICHTEN_EMPTY_COPY_ANZEIGE,
    /Walk-in|Rufen|anlegen|fehlt/i,
  );
  assert.match(NACHRICHTEN_EMPTY_COPY_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Akte drops neu anlegen and Walk-in on a search miss", () => {
  assert.equal(AKTE_SEARCH_EMPTY_ID, "akte-suche-leer");
  assert.equal(akteSearchEmptyCopy(), AKTE_SEARCH_EMPTY_COPY);
  assert.equal(akteSearchEmptyCopy(false), AKTE_SEARCH_EMPTY_COPY);
  assert.equal(akteSearchEmptyCopy(true), AKTE_SEARCH_EMPTY_COPY_ANZEIGE);
  assert.match(AKTE_SEARCH_EMPTY_COPY, /neu anlegen/);
  assert.match(AKTE_SEARCH_EMPTY_COPY, /Walk-in/);
  assert.doesNotMatch(
    AKTE_SEARCH_EMPTY_COPY_ANZEIGE,
    /anlegen|Walk-in|Anruf|fehlt/i,
  );
  assert.match(AKTE_SEARCH_EMPTY_COPY_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Akte drops Speichern liest die Felder on the lead", () => {
  assert.equal(AKTE_LEAD_ID, "akte-lead");
  assert.equal(akteLead(), AKTE_LEAD);
  assert.equal(akteLead(false), AKTE_LEAD);
  assert.equal(akteLead(true), AKTE_LEAD_ANZEIGE);
  assert.match(AKTE_LEAD, /Speichern liest die Felder/);
  assert.match(AKTE_LEAD, /Walk-in/);
  assert.doesNotMatch(
    AKTE_LEAD_ANZEIGE,
    /Speichern|Walk-in|Felder|fehlt|anlegen/i,
  );
  assert.match(AKTE_LEAD_ANZEIGE, /Praxistafel/);
  assert.match(AKTE_LEAD_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Akte drops Kontakt speichern on the card", () => {
  assert.equal(akteContactSaveVisible(), true);
  assert.equal(akteContactSaveVisible(false), true);
  assert.equal(akteContactSaveVisible(true), false);
});

test("Anzeige Akte drops edit fields and keeps the values", () => {
  assert.equal(akteFelderVisible(), true);
  assert.equal(akteFelderVisible(false), true);
  assert.equal(akteFelderVisible(true), false);
  assert.equal(AKTE_FELDER_ANZEIGE_ID, "akte-felder-anzeige");
  assert.match(AKTE_FELDER_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Heute and Kalender drop Bestätigen, Absagen and Umlegen", () => {
  assert.equal(slotWriteVisible(), true);
  assert.equal(slotWriteVisible(false), true);
  assert.equal(slotWriteVisible(true), false);
});

test("Anzeige Heute and Notfall drop Übernommen and Abschließen", () => {
  assert.equal(notfallWriteVisible(), true);
  assert.equal(notfallWriteVisible(false), true);
  assert.equal(notfallWriteVisible(true), false);
});

test("Anzeige Heute and Nachrichten drop Intern Gelesen", () => {
  assert.equal(internGelesenVisible(), true);
  assert.equal(internGelesenVisible(false), true);
  assert.equal(internGelesenVisible(true), false);
  assert.equal(NACHRICHTEN_UNREAD_ID, "protokoll-ungelesen");
  assert.equal(nachrichtenUnreadCopy(), NACHRICHTEN_UNREAD_COPY);
  assert.equal(nachrichtenUnreadCopy(false), NACHRICHTEN_UNREAD_COPY);
  assert.equal(nachrichtenUnreadCopy(true), NACHRICHTEN_UNREAD_COPY_ANZEIGE);
  assert.match(NACHRICHTEN_UNREAD_COPY, /Gelesen markiert fertig/);
  assert.doesNotMatch(
    NACHRICHTEN_UNREAD_COPY_ANZEIGE,
    /markiert fertig|WhatsApp|fehlt|anlegen/i,
  );
  assert.match(NACHRICHTEN_UNREAD_COPY_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Heute and Anrufe drop Erledigt", () => {
  assert.equal(callErledigtVisible(), true);
  assert.equal(callErledigtVisible(false), true);
  assert.equal(callErledigtVisible(true), false);
});

test("Anzeige Einstellungen and Heute drop Gelernt merken", () => {
  assert.equal(gelerntWriteVisible(), true);
  assert.equal(gelerntWriteVisible(false), true);
  assert.equal(gelerntWriteVisible(true), false);
  assert.equal(SETTINGS_GELERNT_ANZEIGE_ID, "settings-gelernt-anzeige");
  assert.equal(HEUTE_NOTIZ_ANZEIGE_ID, "heute-notiz-anzeige");
  assert.equal(heuteNotizTitle(), HEUTE_NOTIZ_TITLE);
  assert.equal(heuteNotizTitle(false), HEUTE_NOTIZ_TITLE);
  assert.equal(heuteNotizTitle(true), HEUTE_NOTIZ_TITLE_ANZEIGE);
  assert.match(HEUTE_NOTIZ_TITLE, /fehlt/);
  assert.doesNotMatch(HEUTE_NOTIZ_TITLE_ANZEIGE, /fehlt/);
  assert.match(SETTINGS_GELERNT_ANZEIGE, /Schreib-Rechner/);
  assert.equal(SETTINGS_GELERNT_LEAD_ID, "settings-gelernt-lead");
  assert.equal(settingsGelerntLead(), SETTINGS_GELERNT_LEAD);
  assert.equal(settingsGelerntLead(false), SETTINGS_GELERNT_LEAD);
  assert.equal(settingsGelerntLead(true), SETTINGS_GELERNT_LEAD_ANZEIGE);
  assert.match(SETTINGS_GELERNT_LEAD, /merken/);
  assert.doesNotMatch(
    SETTINGS_GELERNT_LEAD_ANZEIGE,
    /merken|fehlt|hinterlegen/i,
  );
});

test("Anzeige Einstellungen drops Kollegin anlegen and Passwort", () => {
  assert.equal(zugangWriteVisible(), true);
  assert.equal(zugangWriteVisible(false), true);
  assert.equal(zugangWriteVisible(true), false);
  assert.equal(SETTINGS_ZUGANG_ANZEIGE_ID, "settings-zugang-anzeige");
  assert.match(SETTINGS_ZUGANG_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Einstellungen drops Speichern", () => {
  assert.equal(settingsSaveVisible(), true);
  assert.equal(settingsSaveVisible(false), true);
  assert.equal(settingsSaveVisible(true), false);
  assert.equal(SETTINGS_SAVE_ANZEIGE_ID, "settings-save-anzeige");
});

test("Anzeige Einstellungen drops profile fields and keeps the values", () => {
  assert.equal(settingsFelderVisible(), true);
  assert.equal(settingsFelderVisible(false), true);
  assert.equal(settingsFelderVisible(true), false);
  assert.equal(SETTINGS_FELDER_ANZEIGE_ID, "settings-felder-anzeige");
  assert.equal(settingsAnzeigeId("name"), "settings-anzeige-name");
  assert.equal(settingsAnzeigeId("phone"), "settings-anzeige-phone");
  assert.match(SETTINGS_FELDER_ANZEIGE, /Schreib-Rechner/);
  assert.equal(SETTINGS_EMAIL_HINT_ID, "email-hint");
  assert.equal(settingsEmailHint(), SETTINGS_EMAIL_HINT);
  assert.equal(settingsEmailHint(false), SETTINGS_EMAIL_HINT);
  assert.equal(settingsEmailHint(true), SETTINGS_EMAIL_HINT_ANZEIGE);
  assert.match(SETTINGS_EMAIL_HINT, /Speichern/);
  assert.doesNotMatch(
    SETTINGS_EMAIL_HINT_ANZEIGE,
    /Speichern|fehlt|hinterlegen|anlegen/i,
  );
});

test("Anzeige Heute drops Kurzspeichern fields", () => {
  assert.equal(heuteKurzspeichernVisible(), true);
  assert.equal(heuteKurzspeichernVisible(false), true);
  assert.equal(heuteKurzspeichernVisible(true), false);
  assert.equal(heuteKurzAnzeigeId("inhaberin"), "heute-inhaberin-anzeige");
  assert.equal(heuteKurzAnzeigeId("whatsapp"), "heute-whatsapp-anzeige");
  assert.match(HEUTE_KURZ_ANZEIGE, /Schreib-Rechner/);
  assert.equal(HEUTE_WHATSAPP_TITLE_ID, "heute-whatsapp-title");
  assert.equal(heuteWhatsappTitle(), HEUTE_WHATSAPP_TITLE);
  assert.equal(heuteWhatsappTitle(false), HEUTE_WHATSAPP_TITLE);
  assert.equal(heuteWhatsappTitle(true), HEUTE_WHATSAPP_TITLE_ANZEIGE);
  assert.match(HEUTE_WHATSAPP_TITLE, /braucht/);
  assert.doesNotMatch(
    HEUTE_WHATSAPP_TITLE_ANZEIGE,
    /braucht|Handy|hinterlegen/i,
  );
});

test("Anzeige Heute drops Mo–Fr voll übernehmen and keeps the Vorlage card", () => {
  assert.equal(heuteZeitenVorlageWriteVisible(), true);
  assert.equal(heuteZeitenVorlageWriteVisible(false), true);
  assert.equal(heuteZeitenVorlageWriteVisible(true), false);
  assert.equal(HEUTE_ZEITEN_VORLAGE_ANZEIGE_ID, "heute-zeiten-vorlage-anzeige");
  assert.equal(HEUTE_ZEITEN_VORLAGE_TITLE_ID, "heute-zeiten-vorlage-title");
  assert.equal(heuteZeitenVorlageTitle(), HEUTE_ZEITEN_VORLAGE_TITLE);
  assert.equal(heuteZeitenVorlageTitle(false), HEUTE_ZEITEN_VORLAGE_TITLE);
  assert.equal(
    heuteZeitenVorlageTitle(true),
    HEUTE_ZEITEN_VORLAGE_TITLE_ANZEIGE,
  );
  assert.match(HEUTE_ZEITEN_VORLAGE_TITLE, /Vorlage/);
  assert.doesNotMatch(
    HEUTE_ZEITEN_VORLAGE_TITLE_ANZEIGE,
    /Vorlage|übernehmen|Demo/i,
  );
  assert.equal(
    HEUTE_ZEITEN_VORLAGE_SETTINGS_ID,
    "heute-zeiten-vorlage-settings",
  );
  assert.equal(heuteZeitenVorlageSettings(), HEUTE_ZEITEN_VORLAGE_SETTINGS);
  assert.equal(
    heuteZeitenVorlageSettings(false),
    HEUTE_ZEITEN_VORLAGE_SETTINGS,
  );
  assert.equal(
    heuteZeitenVorlageSettings(true),
    HEUTE_ZEITEN_VORLAGE_SETTINGS_ANZEIGE,
  );
  assert.match(HEUTE_ZEITEN_VORLAGE_SETTINGS, /anpassen/);
  assert.doesNotMatch(HEUTE_ZEITEN_VORLAGE_SETTINGS_ANZEIGE, /anpassen/);
  assert.match(HEUTE_ZEITEN_VORLAGE_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Vquadrat-Spiegel keeps the card and drops Walk-in / anlegen", () => {
  assert.equal(HEUTE_VQUADRAT_SPIEGEL_ID, "heute-vquadrat-spiegel");
  assert.equal(SETTINGS_VQUADRAT_SPIEGEL_ID, "settings-vquadrat-spiegel");
  assert.equal(HEUTE_VQUADRAT_ANZEIGE_ID, "heute-vquadrat-anzeige");
  assert.equal(SETTINGS_VQUADRAT_ANZEIGE_ID, "settings-vquadrat-anzeige");
  assert.equal(VQUADRAT_SPIEGEL_TITLE, "Vquadrat.");
  assert.equal(vquadratSpiegelWriteVisible(), true);
  assert.equal(vquadratSpiegelWriteVisible(false), true);
  assert.equal(vquadratSpiegelWriteVisible(true), false);
  assert.equal(vquadratSpiegelLead(), VQUADRAT_SPIEGEL_LEAD);
  assert.equal(vquadratSpiegelLead(true), VQUADRAT_SPIEGEL_LEAD_ANZEIGE);
  assert.match(VQUADRAT_SPIEGEL_LEAD, /Walk-in/);
  assert.doesNotMatch(
    VQUADRAT_SPIEGEL_LEAD_ANZEIGE,
    /Walk-in|anlegen|anrufen|GitHub/i,
  );
  assert.equal(vquadratSpiegelEmptyCopy(), VQUADRAT_SPIEGEL_EMPTY);
  assert.equal(vquadratSpiegelEmptyCopy(true), VQUADRAT_SPIEGEL_EMPTY_ANZEIGE);
  assert.match(VQUADRAT_SPIEGEL_EMPTY, /Eintragen/);
  assert.doesNotMatch(
    VQUADRAT_SPIEGEL_EMPTY_ANZEIGE,
    /Walk-in|Eintragen|anrufen|anlegen/i,
  );
  assert.equal(vquadratSpiegelAkteLabel(), VQUADRAT_SPIEGEL_AKTE);
  assert.equal(vquadratSpiegelAkteLabel(true), VQUADRAT_SPIEGEL_AKTE_ANZEIGE);
  assert.match(VQUADRAT_SPIEGEL_AKTE, /anlegen/);
  assert.doesNotMatch(VQUADRAT_SPIEGEL_AKTE_ANZEIGE, /anlegen/);
  assert.match(VQUADRAT_SPIEGEL_ANZEIGE, /Schreib-Rechner/);
  assert.match(VQUADRAT_SPIEGEL_WALKIN, /Walk-in/);
  assert.doesNotMatch(VQUADRAT_SPIEGEL_ANZEIGE, /GitHub/i);
});

test("Anzeige Akte drops the new-Akte form", () => {
  assert.equal(akteNeuFormVisible(), true);
  assert.equal(akteNeuFormVisible(false), true);
  assert.equal(akteNeuFormVisible(true), false);
  assert.equal(akteNeuTitle(), AKTE_NEU_TITLE);
  assert.equal(akteNeuTitle(false), AKTE_NEU_TITLE);
  assert.equal(akteNeuTitle(true), AKTE_NEU_TITLE_ANZEIGE);
  assert.match(AKTE_NEU_TITLE, /anlegen/);
  assert.doesNotMatch(AKTE_NEU_TITLE_ANZEIGE, /anlegen/);
  assert.equal(akteEmptyCopy(), AKTE_EMPTY_COPY);
  assert.equal(akteEmptyCopy(true), AKTE_EMPTY_COPY_ANZEIGE);
  assert.match(AKTE_EMPTY_COPY, /Formular oben/);
  assert.doesNotMatch(AKTE_EMPTY_COPY_ANZEIGE, /Formular|Walk-in|Anruf/);
  assert.match(AKTE_EMPTY_COPY_ANZEIGE, /Schreib-Rechner/);
});

test("Anzeige Heute and Kalender drop the Walk-in form", () => {
  assert.equal(walkInFormVisible(), true);
  assert.equal(walkInFormVisible(false), true);
  assert.equal(walkInFormVisible(true), false);
  assert.equal(walkInTitle(), WALKIN_TITLE);
  assert.equal(walkInTitle(false), WALKIN_TITLE);
  assert.equal(walkInTitle(true), WALKIN_TITLE_ANZEIGE);
  assert.match(WALKIN_TITLE, /Slot legen/);
  assert.doesNotMatch(WALKIN_TITLE_ANZEIGE, /legen|Slot/);
});

test("Anzeige Heute drops Extra-zu hinterlegen and keeps the list line", () => {
  assert.equal(HEUTE_ZU_ANZEIGE_ID, "heute-zu-anzeige");
  assert.equal(KALENDER_ZU_ANZEIGE_ID, "kalender-zu-anzeige");
  assert.equal(heuteZuFormVisible(), true);
  assert.equal(heuteZuFormVisible(false), true);
  assert.equal(heuteZuFormVisible(true), false);
  assert.equal(heuteZuTitle(), HEUTE_ZU_TITLE);
  assert.equal(heuteZuTitle(false), HEUTE_ZU_TITLE);
  assert.equal(heuteZuTitle(true), HEUTE_ZU_TITLE_ANZEIGE);
  assert.match(HEUTE_ZU_TITLE, /hinterlegen/);
  assert.doesNotMatch(HEUTE_ZU_TITLE_ANZEIGE, /hinterlegen/);
  assert.match(HEUTE_ZU_ANZEIGE, /Schreib-Rechner/);
  assert.doesNotMatch(
    HEUTE_ZU_ANZEIGE,
    /Tag hinterlegen|Fortbildung|Wieder öffnen/,
  );
});

test("Anzeige staff /sprechen leaves for the Tafel", () => {
  assert.equal(sprechenStaffShowsLive(), true);
  assert.equal(sprechenStaffShowsLive(false), true);
  assert.equal(sprechenStaffShowsLive(true), false);
});

test("Anzeige Anmelden skips /sprechen next", () => {
  assert.equal(sprechenLoginDest({ dest: "/sprechen", anzeige: true }), "/app");
  assert.equal(
    sprechenLoginDest({ dest: "/sprechen?d=2026-08-30", anzeige: true }),
    "/app",
  );
  assert.equal(
    sprechenLoginDest({ dest: "/sprechen", anzeige: false }),
    "/sprechen",
  );
  assert.equal(
    sprechenLoginDest({ dest: "/sprechen?d=2026-08-30", anzeige: false }),
    "/sprechen?d=2026-08-30",
  );
  assert.equal(
    sprechenLoginDest({ dest: "/app/kalender", anzeige: true }),
    "/app/kalender",
  );
  assert.equal(sprechenLoginDest({ dest: "/sprechen" }), "/sprechen");
  assert.equal(sprechenLoginDest({}), undefined);
});

test("Anzeige header Anrufen goes to the Tafel", () => {
  assert.equal(sprechenPublicNavTo(true), "/app");
  assert.equal(sprechenPublicNavTo(false), "/sprechen");
  assert.equal(sprechenPublicNavTo(), "/sprechen");
  assert.equal(DESK_HEADER_ANRUFEN_ID, "desk-header-anrufen");
  assert.equal(DESK_HEADER_ANRUFEN_MOBILE_ID, "desk-header-anrufen-mobile");
  assert.equal(DESK_FOOTER_ANRUFEN_ID, "desk-footer-anrufen");
});

test("Anzeige header drops Demo anfragen", () => {
  assert.equal(DESK_HEADER_DEMO_ID, "desk-header-demo");
  assert.equal(DESK_HEADER_DEMO_MOBILE_ID, "desk-header-demo-mobile");
  assert.equal(headerShowsDemoRequest(), true);
  assert.equal(headerShowsDemoRequest(false), true);
  assert.equal(headerShowsDemoRequest(true), false);
});

test("Anzeige Tafel neu laden is a distinct action from Tafel holen", () => {
  assert.equal(TAFEL_ANZEIGE_REFRESH_LABEL, "Praxistafel neu laden");
  assert.match(TAFEL_ANZEIGE_REFRESH_WRITER_ERROR, /Anzeige/);
  assert.notEqual(TAFEL_ANZEIGE_REFRESH_LABEL, "Tafel holen");
  assert.notEqual(TAFEL_ANZEIGE_REFRESH_LABEL, "Tafel neu laden");
  assert.match(TAFEL_ANZEIGE_COPY_FAIL, /nicht aufgegangen/);
  assert.match(TAFEL_ANZEIGE_LADEN_HTTP_FAIL, /Praxistafel-Kopie/);
});

test("Anzeige Tafel neu laden fail stays a lasting line, not only a toast", () => {
  clearAnzeigeCopyFail();
  assert.equal(anzeigeLadenFailOf(""), TAFEL_ANZEIGE_COPY_FAIL);
  assert.equal(anzeigeLadenFailOf(null), TAFEL_ANZEIGE_COPY_FAIL);
  assert.equal(
    anzeigeLadenFailOf(TAFEL_ANZEIGE_LADEN_HTTP_FAIL),
    TAFEL_ANZEIGE_LADEN_HTTP_FAIL,
  );
  assert.equal(
    anzeigeLadenFailOf(TAFEL_ANZEIGE_REFRESH_WRITER_ERROR),
    TAFEL_ANZEIGE_REFRESH_WRITER_ERROR,
  );
  const seen: string[] = [];
  const off = subscribeAnzeigeCopyFail((line) => seen.push(line));
  assert.equal(noteAnzeigeCopyFail(), TAFEL_ANZEIGE_COPY_FAIL);
  assert.equal(anzeigeCopyError(), TAFEL_ANZEIGE_COPY_FAIL);
  assert.equal(
    noteAnzeigeCopyFail(TAFEL_ANZEIGE_LADEN_HTTP_FAIL),
    TAFEL_ANZEIGE_LADEN_HTTP_FAIL,
  );
  clearAnzeigeCopyFail();
  assert.equal(anzeigeCopyError(), "");
  off();
  assert.deepEqual(seen, [
    TAFEL_ANZEIGE_COPY_FAIL,
    TAFEL_ANZEIGE_LADEN_HTTP_FAIL,
    "",
  ]);
});

test("Anzeige banner names the Vienna clock after a copy", () => {
  const at = Date.UTC(2026, 7, 29, 16, 5);
  const now = Date.UTC(2026, 7, 29, 16, 10);
  assert.equal(anzeigeStandLabel(at, now), "Stand 18:05");
  assert.equal(anzeigeStandLabel(0, now), "");
  assert.equal(anzeigeStandLabel(now + 120_000, now), "");
});
