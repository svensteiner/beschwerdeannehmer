export const TAFEL_ANZEIGE_ERROR =
  "Nur Anzeige. Die Praxistafel zeigt Heute, Termine und Anrufe. Speichern auf dem anderen Rechner.";

export const TAFEL_ANZEIGE_BANNER = TAFEL_ANZEIGE_ERROR;

export const DESK_ANZEIGE_ID = "desk-tafel-anzeige";

/** Anmelden / Registrieren on the Empfang PC — same sentence as the Tafel banner. */
export function deskAnzeigeAuthLine(anzeige?: boolean) {
  return anzeige ? TAFEL_ANZEIGE_BANNER : "";
}

export const TAFEL_ANZEIGE_REFRESH_LABEL = "Praxistafel neu laden";
export const TAFEL_ANZEIGE_REFRESH_HINT =
  "Holt die Praxistafel vom anderen Rechner. Passiert auch von selbst, wenn niemand tippt.";
export const TAFEL_ANZEIGE_REFRESH_OK = "Praxistafel-Kopie ist neu.";

export const TAFEL_ANZEIGE_REFRESH_WRITER_ERROR =
  "Die schreibende Tafel ist schon aktuell. Neu laden nur auf der Anzeige.";

export const TAFEL_ANZEIGE_COPY_FAIL =
  "Die letzte Kopie ist nicht aufgegangen.";

export const TAFEL_ANZEIGE_LADEN_HTTP_FAIL =
  "Die Praxistafel-Kopie ließ sich nicht neu laden.";

let lastAnzeigeCopyError = "";
const anzeigeCopyFailListeners = new Set<(line: string) => void>();

/** Lasting banner line — server error if present, otherwise the copy-fail sentence. */
export function anzeigeLadenFailOf(error?: string | null) {
  const text = String(error ?? "").trim();
  return text || TAFEL_ANZEIGE_COPY_FAIL;
}

export function subscribeAnzeigeCopyFail(fn: (line: string) => void) {
  anzeigeCopyFailListeners.add(fn);
  return () => {
    anzeigeCopyFailListeners.delete(fn);
  };
}

export function noteAnzeigeCopyFail(error?: string | null) {
  lastAnzeigeCopyError = anzeigeLadenFailOf(error);
  for (const fn of anzeigeCopyFailListeners) fn(lastAnzeigeCopyError);
  return lastAnzeigeCopyError;
}

export function clearAnzeigeCopyFail() {
  lastAnzeigeCopyError = "";
  for (const fn of anzeigeCopyFailListeners) fn("");
}

export function anzeigeCopyError() {
  return lastAnzeigeCopyError;
}

export const TAFEL_ANZEIGE_LINE =
  "Nur Anzeige. Die Leitung ist auf dem anderen Rechner. Termine und Rückrufe dort speichern.";

export const SPRECHEN_DEMO_BANNER_ID = "sprechen-demo-banner";

/** Logged-out /sprechen — Huber only on the writer. Anzeige never sells the demo line. */
export function sprechenPublicShowsDemo(input: {
  anzeige?: boolean;
  expired?: boolean;
}) {
  return !input.anzeige && !input.expired;
}

export function sprechenAnzeigeAuthLine(anzeige?: boolean) {
  return anzeige ? TAFEL_ANZEIGE_LINE : "";
}

export const DESK_HOME_ANZEIGE_ID = "desk-home-anzeige";
export const DESK_HOME_HEAR_ID = "desk-home-hear";
export const DESK_HOME_MITTAG_ID = "desk-home-mittag";
export const DESK_HOME_CALL_ID = "desk-home-call";
export const DESK_WERKZEUGE_MITTAG_ID = "desk-werkzeuge-mittag";
export const DESK_WERKZEUGE_ANRUFEN_ID = "desk-werkzeuge-anrufen";
export const DESK_WERKZEUGE_CHIP_ID = "desk-werkzeuge-chip";
export const DESK_WERKZEUGE_REISE_ID = "desk-werkzeuge-reise";
export const DESK_WERKZEUGE_NACHT_ID = "desk-werkzeuge-nacht";
export const DESK_WERKZEUGE_FRITZ_ID = "desk-werkzeuge-fritz";
export const DESK_HOME_CHIP_ID = "desk-home-chip";
export const DESK_HOME_FACES_ID = "desk-home-faces";
export const DESK_HOME_FILM_ID = "desk-home-film";
export const DESK_HOME_AUSTRIA_ID = "desk-home-austria";
export const DESK_HOME_KILLERS_ID = "desk-home-killers";
export const DESK_HOME_NIGHT_ID = "desk-home-night";
export const DESK_HOME_FAQ_ID = "desk-home-faq";
export const DESK_HOME_SOCIAL_ID = "desk-home-social";
export const DESK_HOME_HERO_COPY_ID = "desk-home-hero-copy";
export const DESK_HOME_TESTEN_ID = "desk-home-testen";
export const DESK_HOME_HERO_TAFEL_ID = "desk-home-hero-tafel";
export const DESK_HOME_CLOSE_ID = "desk-home-close";

/** Homepage Huber call — embed, Silvia hören, Vetmeduni, Jetzt selbst anrufen. Writer only. */
export function homePublicShowsDemo(anzeige?: boolean) {
  return !anzeige;
}

/** Anzeige /demo is the practice Tafel, not Huber. */
export function demoPublicShowsHuber(anzeige?: boolean) {
  return !anzeige;
}

export const DESK_HEADER_PRAXISTAFEL_ID = "desk-header-praxistafel";
export const DESK_HEADER_PRAXISTAFEL_MOBILE_ID =
  "desk-header-praxistafel-mobile";
export const DESK_FOOTER_PRAXISTAFEL_ID = "desk-footer-praxistafel";
export const DESK_LANDING_PRAXISTAFEL_ID = "desk-landing-praxistafel";
export const DESK_WERKZEUGE_AKTE_ID = "desk-werkzeuge-akte";
export const DESK_WERKZEUGE_LEAD_ID = "desk-werkzeuge-lead";
export const DESK_WERKZEUGE_HEAD_ID = "desk-werkzeuge-head";
export const WERKZEUGE_LEAD =
  "Chip, Reise, Mittagssperre, Nachtdienst je Bundesland. Der Anruf landet auf der Praxistafel.";
export const WERKZEUGE_LEAD_ANZEIGE =
  "Die Kartei liegt auf der Tafel. Chip- und Reise-Nachschlag bleiben auf dem Schreib-Rechner.";
export const WERKZEUGE_HEADING = "Was Silvia kann, und VetPal nicht.";
export const WERKZEUGE_HEADING_ANZEIGE = "Was auf der Tafel liegt.";

export function werkzeugePublicLead(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige) ? WERKZEUGE_LEAD : WERKZEUGE_LEAD_ANZEIGE;
}

export function werkzeugePublicHeading(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? WERKZEUGE_HEADING
    : WERKZEUGE_HEADING_ANZEIGE;
}
export const DESK_PREISE_AKTE_ID = "desk-preise-akte";
export const DESK_PREISE_FAQ_ID = "desk-preise-faq";
export const DESK_PREISE_FAQ_WA_ID = "desk-preise-faq-wa";
export const DESK_PREISE_FAQ_NACHT_ID = "desk-preise-faq-nacht";
export const DESK_PREISE_LEAD_ID = "desk-preise-lead";
export const DESK_PREISE_FEIER_ID = "desk-preise-feier";
export const DESK_HOME_STATS_ID = "desk-home-stats";
export const DESK_HOME_STATS_NUMMER_ID = "desk-home-stats-nummer";
export const DESK_HOME_STATS_ERLEDIGT_ID = "desk-home-stats-erledigt";
export const HOME_STATS_NUMMER_ANZEIGE = "alle Bundesländer, ohne Portierung";
const UNATTENDED_STATS_COPY = /ohne Ihr Zutun|92\s*%/i;
export const DESK_HOME_FEATURES_ID = "desk-home-features";
export const DESK_HOME_FEATURES_WA_ID = "desk-home-features-wa";
export const DESK_HOME_FEATURES_LEAD_ID = "desk-home-features-lead";
export const DESK_HOME_FEATURES_NACHT_ID = "desk-home-features-nacht";
export const DESK_HOME_FEATURES_PMS_ID = "desk-home-features-pms";
export const DESK_HOME_FEATURES_PROTOKOLL_ID = "desk-home-features-protokoll";
export const DESK_HOME_FEATURES_FEIER_ID = "desk-home-features-feier";
export const DESK_HOME_HOW_ID = "desk-home-how";
export const DESK_HOME_HOW_HEAD_ID = "desk-home-how-head";
export const DESK_HOME_HOW_LINE_ID = "desk-home-how-line";
export const DESK_HOME_HOW_PMS_ID = "desk-home-how-pms";
export const DESK_HOME_HOW_WORK_ID = "desk-home-how-work";
export const DESK_HOME_DIFFERENCE_ID = "desk-home-difference";
export const DESK_HOME_DIFFERENCE_WA_ID = "desk-home-difference-wa";
export const DESK_HOME_DIFFERENCE_NACHT_ID = "desk-home-difference-nacht";
export const DESK_HOME_DIFFERENCE_REGISTER_ID = "desk-home-difference-register";
export const DESK_HOME_PROBLEM_ID = "desk-home-problem";
export const DESK_HOME_PROBLEM_LEAD_ID = "desk-home-problem-lead";
export const DESK_HOME_PROBLEM_WA_ID = "desk-home-problem-wa";
export const DESK_HOME_PROBLEM_NACHT_ID = "desk-home-problem-nacht";

const HUBER_PREISE_COPY = /Fritz|Vetmeduni|Josefstadt/i;
const TRIAL_PREISE_COPY = /21 Tage|Test.*nach Abstimmung/i;
const WA_BUSINESS_PREISE_COPY = /WhatsApp Business|Terminlinks/i;

export const PREISE_WA_ANZEIGE = "WhatsApp-Entwurf an die Halterin (wa.me)";
export const PREISE_PMS_ANZEIGE =
  "Termine auf der Tafel, ohne Praxissoftware-Kopplung";
export const PREISE_WIDGET_ANZEIGE =
  "Walk-in auf der Tafel, kein Website-Widget";
export const PREISE_PROTOKOLL_ANZEIGE =
  "Protokoll auf der Tafel (mailto-Entwurf)";
export const PREISE_NACHT_ANZEIGE =
  "Notfall auf der Tafel. Silvia verbindet nicht selbst.";
export const PREISE_ERINNER_ANZEIGE =
  "Chip und Impfung in der Akte, keine automatischen Erinnerungen";
export const PREISE_LIVE_ANZEIGE = "Praxistafel auf dem Schreib-Rechner";
export const HOME_WA_ANZEIGE_BODY =
  "Die Tierarzthelferin öffnet einen WhatsApp-Entwurf (wa.me) an die Halterin. Silvia führt keinen Chat und schickt keine Terminlinks.";
export const HOME_FEATURES_LEAD =
  "Telefon, WhatsApp, Nacht, Kalender, Kopplung, zwei Sprachen – Rezeption, keine Diagnose.";
export const HOME_FEATURES_LEAD_ANZEIGE =
  "Silvia gibt keine Diagnosen. Sie nimmt auf, sortiert und bucht. Verbinden tut die Tierarzthelferin auf der Tafel.";
export const HOME_NACHT_ANZEIGE_BODY =
  "Atemnot, Blutung, Krampf, Gift: Silvia erkennt die Lage und legt den Notfall auf die Tafel. Die Tierarzthelferin ruft den hinterlegten Nachtdienst – Silvia verbindet nicht selbst.";
const PMS_HOME_COPY =
  /PMS|vetera|easyVET|Animondo|pentav|Vquadrat|Praxissoftware/i;
export const HOME_PMS_ANZEIGE_BODY =
  "Termine liegen auf der Tafel. Silvia koppelt nicht an vetera, easyVET oder eine andere Praxissoftware.";
export const HOME_PROTOKOLL_ANZEIGE_BODY =
  "Die Gesprächs-Demo zeigt Gesprächsnotizen und Terminwünsche auf der Tafel, nicht in der Praxissoftware. Bestehende Termine verschiebt oder storniert die Tierarzthelferin.";
export const HOME_FEATURES_FEIER_ANZEIGE =
  "Heilige Drei Könige, Fronleichnam, Nationalfeiertag, Mariä Empfängnis. Feiertage bleiben geschlossen. Termine am nächsten Werktag.";
export const PREISE_FEIER_LEAD =
  "An diesen Tagen bucht Silvia nur, wenn Sie den Nachtdienst ausdrücklich offen halten. Karfreitag ist in Österreich kein gesetzlicher Feiertag – im Gegensatz zu Deutschland.";
export const PREISE_FEIER_LEAD_ANZEIGE =
  "An diesen Tagen bleibt die Tafel geschlossen. Termine legt Silvia am nächsten Werktag. Karfreitag ist in Österreich kein gesetzlicher Feiertag – im Gegensatz zu Deutschland.";

export function preiseHolidayLead(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? PREISE_FEIER_LEAD
    : PREISE_FEIER_LEAD_ANZEIGE;
}
export const HOME_HOW_PMS_ANZEIGE_TITLE = "Termine auf der Praxistafel";
export const HOME_HOW_PMS_ANZEIGE_BODY = HOME_PMS_ANZEIGE_BODY;
export const HOME_HOW_HEADING =
  "Gemeinsam einrichten. Ohne dass Sie Ihre Software umbauen.";
export const HOME_HOW_HEADING_ANZEIGE =
  "Die Tafel läuft auf dem Schreib-Rechner. Ohne Praxissoftware.";
export const HOME_HOW_LINE_ANZEIGE_TITLE = "Leitung auf dem Schreib-Rechner";
export const HOME_HOW_LINE_ANZEIGE_BODY =
  "Die öffentliche Nummer bleibt bei Ihnen. Silvia portiert nichts und führt keinen WhatsApp-Chat.";
export const HOME_HOW_WORK_ANZEIGE_TITLE = "Protokoll auf der Tafel";
export const HOME_HOW_WORK_ANZEIGE_BODY =
  "Silvia bucht und dokumentiert. Das Protokoll liegt auf der Tafel. Verbinden tut die Tierarzthelferin.";

export function homePublicHowHeading(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? HOME_HOW_HEADING
    : HOME_HOW_HEADING_ANZEIGE;
}
export const HOME_DIFF_WA_ANZEIGE =
  "Telefon live. WhatsApp als wa.me-Entwurf an die Halterin.";
export const HOME_DIFF_NACHT_ANZEIGE = PREISE_NACHT_ANZEIGE;
export const HOME_DIFF_KALENDER_ANZEIGE =
  "13 österreichische Feiertage, Mittagssperre, Wochenende geschlossen";
export const HOME_DIFF_REGISTER_ANZEIGE =
  "Chip in der Akte. Kein Heimtierregister, keine Hundeabgabe.";

/** Homepage Difference — live WhatsApp, PSTN connect, Huber Saturday, register lookup only on the writer. */
export function homePublicDifference<
  T extends { title: string; ours: string; other: string },
>(items: readonly T[], anzeige?: boolean): T[] {
  if (homePublicShowsDemo(anzeige)) return items.map((item) => ({ ...item }));
  return items.map((item) => {
    const text = `${item.title} ${item.ours}`;
    if (/WhatsApp/i.test(text)) return { ...item, ours: HOME_DIFF_WA_ANZEIGE };
    if (/Verbindung|Tiernotruf/i.test(text))
      return { ...item, ours: HOME_DIFF_NACHT_ANZEIGE };
    if (/Samstagfrüh/i.test(text))
      return { ...item, ours: HOME_DIFF_KALENDER_ANZEIGE };
    if (/Heimtier|Hundeabgabe|Register/i.test(text)) {
      return { ...item, ours: HOME_DIFF_REGISTER_ANZEIGE };
    }
    return { ...item };
  });
}

export function homePublicFeaturesLead(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? HOME_FEATURES_LEAD
    : HOME_FEATURES_LEAD_ANZEIGE;
}

export const PREISE_LEAD =
  "Silvia Premium ist die lokale Praxisvariante. Preis, Einrichtung und Umfang werden nach Demo und Abnahme vereinbart.";
export const PREISE_LEAD_ANZEIGE =
  "Silvia Premium ist die lokale Praxisvariante. Preis, Einrichtung und Umfang werden nach Demo und Abnahme vereinbart.";

export function preiseLeadCopy(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige) ? PREISE_LEAD : PREISE_LEAD_ANZEIGE;
}

export function preisePlanFeatures(
  features: readonly string[],
  anzeige?: boolean,
) {
  if (homePublicShowsDemo(anzeige)) return [...features];
  return features
    .filter((line) => !TRIAL_PREISE_COPY.test(line))
    .map((line) => {
      if (WA_BUSINESS_PREISE_COPY.test(line)) return PREISE_WA_ANZEIGE;
      if (/Buchungswidget/i.test(line)) return PREISE_WIDGET_ANZEIGE;
      if (/Protokoll an E-Mail/i.test(line)) return PREISE_PROTOKOLL_ANZEIGE;
      if (PMS_HOME_COPY.test(line)) return PREISE_PMS_ANZEIGE;
      if (/Weiterleitung|Nachtdienst-Weiter/i.test(line))
        return PREISE_NACHT_ANZEIGE;
      if (/Erinnerungen/i.test(line)) return PREISE_ERINNER_ANZEIGE;
      if (/Live-Gesprächen/i.test(line)) return PREISE_LIVE_ANZEIGE;
      return line;
    });
}

export function homePublicStats<T extends { value: string; label: string }>(
  items: readonly T[],
  anzeige?: boolean,
) {
  if (homePublicShowsDemo(anzeige)) return [...items];
  return items
    .filter((item) => {
      const text = `${item.value} ${item.label}`;
      return !TRIAL_PREISE_COPY.test(text) && !UNATTENDED_STATS_COPY.test(text);
    })
    .map((item) => {
      if (/eine Nummer/i.test(`${item.value} ${item.label}`)) {
        return { ...item, label: HOME_STATS_NUMMER_ANZEIGE };
      }
      return { ...item };
    });
}

/** Homepage FeatureGrid — live WhatsApp chat and PSTN connect only on the writer. */
export function homePublicFeatures<T extends { title: string; body: string }>(
  items: readonly T[],
  anzeige?: boolean,
): T[] {
  if (homePublicShowsDemo(anzeige)) return items.map((item) => ({ ...item }));
  return items.map((item) => {
    const text = `${item.title} ${item.body}`;
    if (/WhatsApp|Terminlinks/i.test(text))
      return { ...item, body: HOME_WA_ANZEIGE_BODY };
    if (/verbindet/i.test(text))
      return { ...item, body: HOME_NACHT_ANZEIGE_BODY };
    if (PMS_HOME_COPY.test(text))
      return { ...item, body: HOME_PMS_ANZEIGE_BODY };
    if (/in Ihre Software|Protokoll in/i.test(text)) {
      return { ...item, body: HOME_PROTOKOLL_ANZEIGE_BODY };
    }
    if (/offen halten|Feiertag/i.test(text)) {
      return { ...item, body: HOME_FEATURES_FEIER_ANZEIGE };
    }
    return { ...item };
  });
}

/** Homepage How — number port, WhatsApp line, PMS coupling only on the writer. */
export function homePublicHowSteps<
  T extends { n: string; t: string; d: string },
>(steps: readonly T[], anzeige?: boolean): T[] {
  if (homePublicShowsDemo(anzeige)) return steps.map((step) => ({ ...step }));
  return steps.map((step) => {
    const text = `${step.t} ${step.d}`;
    if (PMS_HOME_COPY.test(text)) {
      return {
        ...step,
        t: HOME_HOW_PMS_ANZEIGE_TITLE,
        d: HOME_HOW_PMS_ANZEIGE_BODY,
      };
    }
    if (/Nummer|WhatsApp|Nachtumleitung/i.test(text)) {
      return {
        ...step,
        t: HOME_HOW_LINE_ANZEIGE_TITLE,
        d: HOME_HOW_LINE_ANZEIGE_BODY,
      };
    }
    if (/triagiert|ordnet vor/i.test(text)) {
      return {
        ...step,
        t: HOME_HOW_WORK_ANZEIGE_TITLE,
        d: HOME_HOW_WORK_ANZEIGE_BODY,
      };
    }
    return { ...step };
  });
}

export const HOME_PROBLEM_LEAD =
  "Mittagspause, Feiertag, OP – das Telefon läutet weiter. WhatsApp bleibt ungelesen. In der Nacht verbindet niemand.";
export const HOME_PROBLEM_LEAD_ANZEIGE =
  "Kleine Teams, Mittagssperre, Hausbesuch, OP. Silvia nimmt ab. WhatsApp bleibt ein wa.me-Entwurf. Den Nachtdienst ruft die Tierarzthelferin – Silvia verbindet niemanden.";
export const HOME_PROBLEM_WA =
  "Bei uns schreiben die Leute. Der Chat bleibt am Empfang liegen.";
export const HOME_PROBLEM_WA_ANZEIGE =
  "Die Tierarzthelferin öffnet einen wa.me-Entwurf. Silvia führt keinen Chat.";
export const HOME_PROBLEM_NACHT =
  "Bandansage oder Mobilbox. Kein Nachtdienst in der Leitung.";
export const HOME_PROBLEM_NACHT_ANZEIGE =
  "Die Tierarzthelferin öffnet tel: auf die hinterlegte Nummer. Silvia verbindet niemanden.";

export function homePublicProblemLead(anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? HOME_PROBLEM_LEAD
    : HOME_PROBLEM_LEAD_ANZEIGE;
}

/** Homepage Problem — live WhatsApp chat and night routing only on the writer. */
export function homePublicProblemItems<T extends { t: string; d: string }>(
  items: readonly T[],
  anzeige?: boolean,
): T[] {
  if (homePublicShowsDemo(anzeige)) return items.map((item) => ({ ...item }));
  return items.map((item) => {
    if (/WhatsApp/i.test(item.t))
      return { ...item, d: HOME_PROBLEM_WA_ANZEIGE };
    if (/Nacht/i.test(item.t))
      return { ...item, d: HOME_PROBLEM_NACHT_ANZEIGE };
    return { ...item };
  });
}

/** Preise Akte-Aufpreis — Huber Fritz only on the writer. */
export function preiseAddonTagline(tagline: string, anzeige?: boolean) {
  return homePublicShowsDemo(anzeige)
    ? tagline
    : "Die Wissensdatenbank der Ordination.";
}

export function preiseAddonFeatures(
  features: readonly string[],
  anzeige?: boolean,
) {
  if (homePublicShowsDemo(anzeige)) return [...features];
  return features.filter(
    (line) => !HUBER_PREISE_COPY.test(line) && !PMS_HOME_COPY.test(line),
  );
}

export const PREISE_FAQ_WA_KANAL_ANZEIGE =
  "WhatsApp ist ein wa.me-Entwurf an die Halterin, kein zweiter Live-Kanal.";
export const PREISE_FAQ_NACHT_ANZEIGE =
  "Die Gesprächs-Demo hält einen Notfallhinweis auf der Tafel fest. Die Tierarzthelferin ruft den hinterlegten Nachtdienst bei Bedarf selbst – Silvia verbindet nicht selbst.";
export const PREISE_FAQ_REGISTER_ANZEIGE =
  "den hinterlegten Nachtdienst. Chip steht in der Akte, kein Heimtierregister";

export function preisePublicFaq<T extends { q: string; a: string }>(
  items: readonly T[],
  anzeige?: boolean,
) {
  if (homePublicShowsDemo(anzeige)) return items.map((item) => ({ ...item }));
  return items
    .map((item) => {
      const text = `${item.q} ${item.a}`;
      if (/Nachtdienst/i.test(text) && /verbunden|Vetmeduni/i.test(text)) {
        return { ...item, a: PREISE_FAQ_NACHT_ANZEIGE };
      }
      let a = item.a;
      if (/Heimtierregister/i.test(text)) {
        a = a.replace(
          /den Nachtdienst je Bundesland und das Heimtierregister|Nachtdienst je Bundesland, Heimtierregister/,
          PREISE_FAQ_REGISTER_ANZEIGE,
        );
      }
      if (/Kanal eins/i.test(`${item.q} ${a}`)) {
        a = a.replace(
          /WhatsApp ist kein Zusatz, sondern Kanal eins neben dem Telefon\.|WhatsApp ist Kanal eins\./,
          PREISE_FAQ_WA_KANAL_ANZEIGE,
        );
      }
      if (/Weiterleitung/i.test(`${item.q} ${a}`)) {
        a = a.replace(/Weiterleitung,?\s*/g, "");
      }
      return { ...item, a };
    })
    .filter((item) => {
      const text = `${item.q} ${item.a}`;
      return (
        !HUBER_PREISE_COPY.test(text) &&
        !TRIAL_PREISE_COPY.test(text) &&
        !PMS_HOME_COPY.test(text) &&
        !/erinnert|Erinnerungen/i.test(text)
      );
    });
}

/** Marketing Praxistafel — Huber /demo only on the writer. Anzeige goes to the Tafel. */
export function demoPublicNavTo(anzeige?: boolean): "/demo" | "/app" {
  return demoPublicShowsHuber(anzeige) ? "/demo" : "/app";
}

/** Features Kartei — Huber /demo/akte only on the writer. */
export function demoAkteNavTo(anzeige?: boolean): "/demo/akte" | "/app/akte" {
  return demoPublicShowsHuber(anzeige) ? "/demo/akte" : "/app/akte";
}

export const LEITUNG_ANZEIGE_ID = "desk-leitung-anzeige";
export const HEUTE_LEITUNG_ANZEIGE_ID = "heute-leitung-anzeige";
export const SETTINGS_LEITUNG_ANZEIGE_ID = "settings-leitung-anzeige";

/** Public /leitung and Heute Link kopieren — live only on the writer. */
export function leitungPublicShowsLive(anzeige?: boolean) {
  return !anzeige;
}

export const DESK_LEITUNG_FEHLT_ID = "desk-leitung-fehlt";

/** Unknown /leitung/$slug — never Huber demo, even on the writer. */
export function leitungMissingShowsDemo(_anzeige?: boolean) {
  return false;
}

/** Missing public line — no header/footer Anrufen into Huber /sprechen. */
export function leitungMissingShowsAnrufen(_anzeige?: boolean) {
  return false;
}

/** Tafel chrome Silvia anrufen — live only on the writer. */
export function sprechenDeskOpenVisible(anzeige?: boolean) {
  return !anzeige;
}

export const HEUTE_ZEITEN_WALKIN_ID = "heute-zeiten-walkin";
export const HEUTE_LEER_ID = "heute-leer";
export const HEUTE_EMPTY_COPY =
  "Anrufen, den öffentlichen Link teilen, oder auf der Tafel einen Walk-in legen.";
export const HEUTE_EMPTY_COPY_ANZEIGE =
  "Anrufe, Termine und Protokolle erscheinen hier, sobald sie auf dem Schreib-Rechner liegen.";

/** Heute Zeiten — Walk-in legen only on the writer. Anzeige form is hidden. */
export function heuteWalkInLinkVisible(anzeige?: boolean) {
  return !anzeige;
}

export const WALKIN_TITLE = "Walk-in · Slot legen";
export const WALKIN_TITLE_ANZEIGE = "Walk-in";

/** Heute / Kalender Walk-in-Formular — only on the writer. Anzeige keeps the line. */
export function walkInFormVisible(anzeige?: boolean) {
  return !anzeige;
}

export function walkInTitle(anzeige?: boolean) {
  return anzeige ? WALKIN_TITLE_ANZEIGE : WALKIN_TITLE;
}

export function heuteEmptyCopy(anzeige?: boolean) {
  return anzeige ? HEUTE_EMPTY_COPY_ANZEIGE : HEUTE_EMPTY_COPY;
}

export const NACHRICHTEN_EMPTY_ID = "protokoll-leer";
export const NACHRICHTEN_MAIL_EMPTY_ID = "protokoll-mail-leer";
export const NACHRICHTEN_EMPTY_COPY =
  "Noch kein Protokoll. Rufen Sie Silvia an oder legen Sie einen Walk-in.";
export const NACHRICHTEN_MAIL_EMPTY_COPY = "Noch kein Protokoll. Rufen Sie an.";
export const NACHRICHTEN_EMPTY_COPY_ANZEIGE =
  "Noch kein Protokoll. Einträge erscheinen hier, sobald sie auf dem Schreib-Rechner liegen.";

/** Protokoll-Leer — Empfang never sees Walk-in legen / Silvia anrufen. */
export function nachrichtenEmptyCopy(anzeige?: boolean) {
  return anzeige ? NACHRICHTEN_EMPTY_COPY_ANZEIGE : NACHRICHTEN_EMPTY_COPY;
}

export function nachrichtenMailEmptyCopy(anzeige?: boolean) {
  return anzeige ? NACHRICHTEN_EMPTY_COPY_ANZEIGE : NACHRICHTEN_MAIL_EMPTY_COPY;
}

export const NACHRICHTEN_LEAD_ID = "protokoll-lead";
export const NACHRICHTEN_LEAD =
  "Nach dem Telefonat oder Walk-in liegt das Protokoll hier. Intern geht an die Frau Doktor aus den Einstellungen (Anrufen, WhatsApp, SMS, E-Mail). Die Terminbestätigung geht an das Telefon der Halterin in der Akte – nicht an die Praxis. Silvia sendet nicht selbst.";
export const NACHRICHTEN_LEAD_ANZEIGE =
  "Protokolle liegen auf der Praxistafel. Intern geht an die Frau Doktor aus den Einstellungen (Anrufen, WhatsApp, SMS, E-Mail). Die Terminbestätigung geht an das Telefon der Halterin in der Akte – nicht an die Praxis. Silvia sendet nicht selbst.";

/** Protokoll-Lead — Empfang never sees Walk-in als Auftrag. */
export function nachrichtenLead(anzeige?: boolean) {
  return anzeige ? NACHRICHTEN_LEAD_ANZEIGE : NACHRICHTEN_LEAD;
}

export const NACHRICHTEN_UNREAD_ID = "protokoll-ungelesen";
export const NACHRICHTEN_UNREAD_COPY =
  "Ungelesen – WhatsApp, E-Mail oder Gelesen markiert fertig.";
export const NACHRICHTEN_UNREAD_COPY_ANZEIGE =
  "Ungelesen. Gelesen auf dem Schreib-Rechner.";

/** Protokoll-Ungelesen — Empfang never sees Gelesen markiert fertig. */
export function nachrichtenUnreadCopy(anzeige?: boolean) {
  return anzeige ? NACHRICHTEN_UNREAD_COPY_ANZEIGE : NACHRICHTEN_UNREAD_COPY;
}

export const KALENDER_LEAD_ID = "kalender-lead";
export const KALENDER_LEAD =
  "Silvia legt Slots, die Tierarzthelferin bestätigt sie. Die Tafel zeigt etwa gestern bis zwei Wochen voraus, nicht die ältesten Einträge. Die Suche findet Tier, Halterin, Anliegen, Handy, E-Mail und Status in genau diesem Fenster. Walk-in tragen Sie selbst ein – Tag und Uhrzeit stehen im Formular, nicht nur in den Tageschips. Bestätigen und Absagen öffnen WhatsApp; SMS und E-Mail liegen hinter **SMS und E-Mail** (wa.me / sms: / mailto:), nicht an die Praxis. Falsche Uhrzeit: umlegen – gleiche Belegung und Zeiten wie beim Walk-in. Extra geschlossen, Wochenende und Feiertag legen den nächsten Werktag, nicht den Fehler geschlossen hinterlegt. War der Slot bestätigt, wird er wieder gelegt, damit die Tierarzthelferin neu bestätigt. Liegt die Uhrzeit außerhalb der hinterlegten Fenster oder ist der Slot schon belegt, nennt Silvia den nächsten freien Slot. Ohne Handy bleiben WhatsApp Bestätigen und Absagen zu; E-Mail-Bestätigung ist der Weg (To: leer tippt die Tierarzthelferin). Kein Twilio, Silvia sendet nicht selbst.";
export const KALENDER_LEAD_ANZEIGE =
  "Termine liegen auf der Praxistafel. Die Suche findet Tier, Halterin, Anliegen, Handy, E-Mail und Status in genau diesem Fenster. Bestätigen, Absagen, Umlegen und Walk-in auf dem Schreib-Rechner.";

/** Kalender-Lead — Empfang never sees Walk-in tragen / To: leer tippt. */
export function kalenderLead(anzeige?: boolean) {
  return anzeige ? KALENDER_LEAD_ANZEIGE : KALENDER_LEAD;
}

export const HEUTE_ZU_ANZEIGE_ID = "heute-zu-anzeige";
export const KALENDER_ZU_ANZEIGE_ID = "kalender-zu-anzeige";
export const HEUTE_ZU_TITLE = "Extra geschlossen hinterlegen.";
export const HEUTE_ZU_TITLE_ANZEIGE = "Extra geschlossen.";
export const HEUTE_ZU_ANZEIGE =
  "Nur Anzeige. Extra-Tage hinterlegt die Tafel am Schreib-Rechner.";

/** Heute / Kalender Extra-zu-Formular und Wieder öffnen — only on the writer. Anzeige keeps the list. */
export function heuteZuFormVisible(anzeige?: boolean) {
  return !anzeige;
}

export function heuteZuTitle(anzeige?: boolean) {
  return anzeige ? HEUTE_ZU_TITLE_ANZEIGE : HEUTE_ZU_TITLE;
}

/** Staff /sprechen — live only on the writer. Anzeige goes to the Tafel. */
export function sprechenStaffShowsLive(anzeige?: boolean) {
  return !anzeige;
}

/** After Anmelden — Anzeige must not bounce through /sprechen. */
export function sprechenLoginDest(input: { dest?: string; anzeige?: boolean }) {
  const dest = input.dest;
  if (
    !sprechenStaffShowsLive(input.anzeige) &&
    dest &&
    (dest === "/sprechen" || dest.startsWith("/sprechen?"))
  ) {
    return "/app";
  }
  return dest;
}

export const DESK_HEADER_ANRUFEN_ID = "desk-header-anrufen";
export const DESK_HEADER_ANRUFEN_MOBILE_ID = "desk-header-anrufen-mobile";
export const DESK_FOOTER_ANRUFEN_ID = "desk-footer-anrufen";
export const DESK_HEADER_DEMO_ID = "desk-header-demo";
export const DESK_HEADER_DEMO_MOBILE_ID = "desk-header-demo-mobile";

/** Marketing lead form — writer only. Anzeige is the practice PC. */
export function headerShowsDemoRequest(anzeige?: boolean) {
  return !anzeige;
}

/** Marketing Anrufen — Huber /sprechen only on the writer. Anzeige goes to the Tafel. */
export function sprechenPublicNavTo(anzeige?: boolean): "/sprechen" | "/app" {
  return sprechenLoginDest({ dest: "/sprechen", anzeige }) === "/app"
    ? "/app"
    : "/sprechen";
}

/** Clock on the Anzeige banner after a successful copy. Vienna wall time. */
export function anzeigeStandLabel(at: number, now = Date.now()) {
  const copied = Number(at);
  if (!Number.isFinite(copied) || copied <= 0) return "";
  if (copied > now + 60_000) return "";
  const time = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Vienna",
  }).format(new Date(copied));
  return `Stand ${time}`;
}

/** Disable Speichern / Eintragen / Merken / Zugang / Tafel sichern / Tafel holen / Notfall Übernommen / Heute Wieder öffnen / Walk-in-Felder / Nächsten Slot / Walk-in-Bestätigung / Akte-Felder / Einstellungen-Felder on the second PC. */
export function anzeigeControl(anzeige?: boolean) {
  if (!anzeige) return { disabled: false as const, title: undefined };
  return { disabled: true as const, title: TAFEL_ANZEIGE_ERROR };
}

export const HEUTE_BACKUP_ANZEIGE_ID = "heute-backup-anzeige";
export const HEUTE_BACKUP_TITLE_ID = "heute-backup-title";
export const HEUTE_BACKUP_TITLE_ANZEIGE = "Praxistafel.";
export const SETTINGS_BACKUP_ANZEIGE_ID = "settings-backup-anzeige";

/** Heute backup card title — Empfang never sees sichern/gesichert. */
export function heuteBackupTitle(anzeige?: boolean, writerTitle?: string) {
  if (anzeige) return HEUTE_BACKUP_TITLE_ANZEIGE;
  return String(writerTitle ?? "").trim();
}
export const AKTE_NEU_ANZEIGE_ID = "akte-neu-anzeige";
export const SETTINGS_FELDER_ANZEIGE_ID = "settings-felder-anzeige";
export const SETTINGS_FELDER_ANZEIGE =
  "Nur Anzeige. Einstellungen auf dem Schreib-Rechner ändern.";
export const SETTINGS_EMAIL_HINT_ID = "email-hint";
export const SETTINGS_EMAIL_HINT =
  "Intern-Protokoll (mailto) geht an diese Inbox, nicht an die Halterin und nicht an die Anmelde-E-Mail. Speichern setzt sie nicht auf Anmelden zurück. Anmelden bleibt unter Zugang.";
export const SETTINGS_EMAIL_HINT_ANZEIGE =
  "Intern-Protokoll (mailto) geht an diese Inbox, nicht an die Halterin und nicht an die Anmelde-E-Mail. Anmelden bleibt unter Zugang.";

/** Einstellungen Inbox-Hinweis — Empfang never sees Speichern. */
export function settingsEmailHint(anzeige?: boolean) {
  return anzeige ? SETTINGS_EMAIL_HINT_ANZEIGE : SETTINGS_EMAIL_HINT;
}

export function settingsAnzeigeId(field: string) {
  return `settings-anzeige-${field}`;
}

/** Einstellungen-Profilfelder — only on the writer. Anzeige keeps the values. */
export function settingsFelderVisible(anzeige?: boolean) {
  return !anzeige;
}
export const AKTE_NEU_TITLE = "Akte anlegen";
export const AKTE_NEU_TITLE_ANZEIGE = "Akte";
export const AKTE_EMPTY_COPY =
  "Noch keine Akte. Ein Anruf mit Tiernamen, ein Walk-in oder das Formular oben legt den ersten Eintrag an.";
export const AKTE_EMPTY_COPY_ANZEIGE =
  "Noch keine Akte. Einträge erscheinen hier, sobald sie auf dem Schreib-Rechner liegen.";

/** Akte-anlegen-Formular — only on the writer. Anzeige keeps the line. */
export function akteNeuFormVisible(anzeige?: boolean) {
  return !anzeige;
}

export function akteNeuTitle(anzeige?: boolean) {
  return anzeige ? AKTE_NEU_TITLE_ANZEIGE : AKTE_NEU_TITLE;
}

export function akteEmptyCopy(anzeige?: boolean) {
  return anzeige ? AKTE_EMPTY_COPY_ANZEIGE : AKTE_EMPTY_COPY;
}

export const AKTE_LEAD_ID = "akte-lead";
export const AKTE_LEAD =
  "Zuletzt am Apparat oder als Walk-in, nicht die ersten Namen im Alphabet. Handy, E-Mail, Art, Chip und Hinweis der Tierarzthelferin gehören hierher – der Kalender nimmt Handy und E-Mail für WhatsApp, SMS und E-Mail-Bestätigung. Speichern liest die Felder. Suche findet Name, Halterin, Handy, E-Mail und Chip in der ganzen Kartei. Kein PMS-Sync.";
export const AKTE_LEAD_ANZEIGE =
  "Akten liegen auf der Praxistafel. Die Suche findet Name, Halterin, Handy, E-Mail und Chip in der ganzen Kartei. Ändern auf dem Schreib-Rechner.";

/** Akte-Lead — Empfang never sees Speichern liest die Felder. */
export function akteLead(anzeige?: boolean) {
  return anzeige ? AKTE_LEAD_ANZEIGE : AKTE_LEAD;
}

export const AKTE_SEARCH_EMPTY_ID = "akte-suche-leer";
export const AKTE_SEARCH_EMPTY_COPY =
  "Name, Halterin, Handy oder Chip anders schreiben – oder neu anlegen per Anruf oder Walk-in.";
export const AKTE_SEARCH_EMPTY_COPY_ANZEIGE =
  "Name, Halterin, Handy oder Chip anders schreiben. Neue Akten auf dem Schreib-Rechner.";

/** Akte-Suche ohne Treffer — Empfang never sees neu anlegen / Walk-in. */
export function akteSearchEmptyCopy(anzeige?: boolean) {
  return anzeige ? AKTE_SEARCH_EMPTY_COPY_ANZEIGE : AKTE_SEARCH_EMPTY_COPY;
}

/** Akte-Karte Kontakt speichern / Slot-Bestätigung — only on the writer. */
export function akteContactSaveVisible(anzeige?: boolean) {
  return !anzeige;
}

export const AKTE_FELDER_ANZEIGE_ID = "akte-felder-anzeige";
export const AKTE_FELDER_ANZEIGE =
  "Nur Anzeige. Akte auf dem Schreib-Rechner ändern.";

/** Akte-Karte Edit-Felder — only on the writer. Anzeige keeps the values. */
export function akteFelderVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Heute / Kalender Bestätigen, Absagen, Umlegen, Wieder einsetzen — only on the writer. */
export function slotWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Heute / Notfall Übernommen und Abschließen — only on the writer. */
export function notfallWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Heute / Nachrichten Intern Gelesen — only on the writer. */
export function internGelesenVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Heute / Anrufe Erledigt and An-der-Leitung Übernommen — only on the writer. */
export function callErledigtVisible(anzeige?: boolean) {
  return !anzeige;
}

export const SETTINGS_GELERNT_ANZEIGE_ID = "settings-gelernt-anzeige";
export const SETTINGS_GELERNT_LEAD_ID = "settings-gelernt-lead";
export const SETTINGS_GELERNT_LEAD =
  "Ohne Anruf merken – gilt beim nächsten Gespräch der Klientel.";
export const SETTINGS_GELERNT_LEAD_ANZEIGE =
  "Gilt beim nächsten Gespräch der Klientel.";
export const HEUTE_NOTIZ_ANZEIGE_ID = "heute-notiz-anzeige";
export const SETTINGS_GELERNT_ANZEIGE =
  "Nur Anzeige. Hinweise auf dem Schreib-Rechner merken.";

export function settingsGelerntLead(anzeige?: boolean) {
  return anzeige ? SETTINGS_GELERNT_LEAD_ANZEIGE : SETTINGS_GELERNT_LEAD;
}
export const HEUTE_NOTIZ_TITLE = "Hausregel fehlt.";
export const HEUTE_NOTIZ_TITLE_ANZEIGE = "Hausregel.";

export function heuteNotizTitle(anzeige?: boolean) {
  return anzeige ? HEUTE_NOTIZ_TITLE_ANZEIGE : HEUTE_NOTIZ_TITLE;
}

/** Einstellungen / Heute Hausregel merken und löschen — only on the writer. */
export function gelerntWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

export const SETTINGS_ZUGANG_ANZEIGE_ID = "settings-zugang-anzeige";
export const SETTINGS_ZUGANG_ANZEIGE =
  "Nur Anzeige. Zugang auf dem Schreib-Rechner ändern.";

/** Einstellungen Kollegin, Passwort, Reset — only on the writer. */
export function zugangWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

export const SETTINGS_SAVE_ANZEIGE_ID = "settings-save-anzeige";

/** Einstellungen Speichern — only on the writer. Anzeige keeps the line. */
export function settingsSaveVisible(anzeige?: boolean) {
  return !anzeige;
}

export const HEUTE_KURZ_ANZEIGE =
  "Nur Anzeige. Auf dem Schreib-Rechner hinterlegen.";
export const HEUTE_WHATSAPP_TITLE_ID = "heute-whatsapp-title";
export const HEUTE_WHATSAPP_TITLE =
  "WhatsApp an die Frau Doktor braucht ein Handy.";
export const HEUTE_WHATSAPP_TITLE_ANZEIGE = "WhatsApp.";

export function heuteWhatsappTitle(anzeige?: boolean) {
  return anzeige ? HEUTE_WHATSAPP_TITLE_ANZEIGE : HEUTE_WHATSAPP_TITLE;
}

export function heuteKurzAnzeigeId(card: string) {
  return `heute-${card}-anzeige`;
}

/** Heute Kurzspeichern-Felder und Speichern — only on the writer. */
export function heuteKurzspeichernVisible(anzeige?: boolean) {
  return !anzeige;
}

export const HEUTE_ZEITEN_VORLAGE_ANZEIGE_ID = "heute-zeiten-vorlage-anzeige";
export const HEUTE_ZEITEN_VORLAGE_TITLE_ID = "heute-zeiten-vorlage-title";
export const HEUTE_ZEITEN_VORLAGE_TITLE =
  "Ordinationszeiten sind noch die Vorlage.";
export const HEUTE_ZEITEN_VORLAGE_TITLE_ANZEIGE = "Zeiten.";
export const HEUTE_ZEITEN_VORLAGE_ANZEIGE =
  "Nur Anzeige. Zeiten auf dem Schreib-Rechner übernehmen.";

export function heuteZeitenVorlageTitle(anzeige?: boolean) {
  return anzeige
    ? HEUTE_ZEITEN_VORLAGE_TITLE_ANZEIGE
    : HEUTE_ZEITEN_VORLAGE_TITLE;
}

export const HEUTE_ZEITEN_VORLAGE_SETTINGS_ID = "heute-zeiten-vorlage-settings";
export const HEUTE_ZEITEN_VORLAGE_SETTINGS = "Zeiten anpassen";
export const HEUTE_ZEITEN_VORLAGE_SETTINGS_ANZEIGE = "In den Einstellungen";

export function heuteZeitenVorlageSettings(anzeige?: boolean) {
  return anzeige
    ? HEUTE_ZEITEN_VORLAGE_SETTINGS_ANZEIGE
    : HEUTE_ZEITEN_VORLAGE_SETTINGS;
}

/** Heute Mo–Fr voll übernehmen — only on the writer. The Vorlage card stays. */
export function heuteZeitenVorlageWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

export const HEUTE_VQUADRAT_SPIEGEL_ID = "heute-vquadrat-spiegel";
export const SETTINGS_VQUADRAT_SPIEGEL_ID = "settings-vquadrat-spiegel";
export const HEUTE_VQUADRAT_ANZEIGE_ID = "heute-vquadrat-anzeige";
export const SETTINGS_VQUADRAT_ANZEIGE_ID = "settings-vquadrat-anzeige";
export const VQUADRAT_SPIEGEL_TITLE = "Vquadrat.";
export const VQUADRAT_SPIEGEL_LEAD =
  "Walk-in, Akte und Telefon legen hier eine Spiegelzeile. Die Kopplung selbst ist noch zu.";
export const VQUADRAT_SPIEGEL_LEAD_ANZEIGE = "Spiegelzeilen der Tafel.";
export const VQUADRAT_SPIEGEL_ANZEIGE =
  "Nur Anzeige. Spiegelzeilen legt die Tafel am Schreib-Rechner.";
export const VQUADRAT_SPIEGEL_EMPTY =
  "Noch keine Spiegelzeile. Eintragen auf Heute legt die erste.";
export const VQUADRAT_SPIEGEL_EMPTY_ANZEIGE = "Noch keine Spiegelzeile.";
export const VQUADRAT_SPIEGEL_WALKIN = "Walk-in legen";
export const VQUADRAT_SPIEGEL_AKTE = "Akte anlegen";
export const VQUADRAT_SPIEGEL_AKTE_ANZEIGE = "Akte";

export function vquadratSpiegelLead(anzeige?: boolean) {
  return anzeige ? VQUADRAT_SPIEGEL_LEAD_ANZEIGE : VQUADRAT_SPIEGEL_LEAD;
}

export function vquadratSpiegelEmptyCopy(anzeige?: boolean) {
  return anzeige ? VQUADRAT_SPIEGEL_EMPTY_ANZEIGE : VQUADRAT_SPIEGEL_EMPTY;
}

export function vquadratSpiegelAkteLabel(anzeige?: boolean) {
  return anzeige ? VQUADRAT_SPIEGEL_AKTE_ANZEIGE : VQUADRAT_SPIEGEL_AKTE;
}

/** Walk-in / Akte-anlegen knobs — only on the writer. The card stays. */
export function vquadratSpiegelWriteVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Heute / Einstellungen — Sichern und Holen stay on the writer PC. */
export function deskBackupAnzeigeLine(anzeige?: boolean) {
  return anzeige ? TAFEL_ANZEIGE_ERROR : "";
}

export const SETTINGS_BACKUP_LAST_ID = "settings-backup-last";

/** Einstellungen last-backup line — Empfang never sees sichern/gesichert. */
export function settingsBackupLastVisible(anzeige?: boolean) {
  return !anzeige;
}
