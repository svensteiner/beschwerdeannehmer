import {
  addDays,
  addMinutes,
  formatISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { PMS_OPTIONS as PRAXISSOFTWARE_PMS_OPTIONS } from "../practice/praxissoftware.ts";
import type {
  Appointment,
  Bundesland,
  CallRecord,
  ChatThread,
  EmergencyCase,
  Practice,
} from "./types";

export const CITIES = [
  "Wien",
  "Graz",
  "Linz",
  "Salzburg",
  "Innsbruck",
  "Klagenfurt",
  "Bregenz",
  "Eisenstadt",
  "St. Pölten",
  "Villach",
  "Wels",
  "Wiener Neustadt",
];

export const PRACTICE: Practice = {
  name: "Tierordination Huber",
  shortName: "Huber",
  owner: "Dr. med. vet. Anna Huber",
  street: "Josefstädter Straße 28",
  zip: "1080",
  city: "Wien",
  bundesland: "Wien",
  phone: "+43 1 405 12 88",
  whatsapp: "+43 664 181 20 08",
  email: "rezeption@huber.vet",
  hours: [
    { day: "Montag", time: "8:00–12:00, 14:00–18:00" },
    { day: "Dienstag", time: "8:00–12:00, 14:00–18:00" },
    { day: "Mittwoch", time: "8:00–12:00" },
    { day: "Donnerstag", time: "8:00–12:00, 14:00–18:00" },
    { day: "Freitag", time: "8:00–12:00, 14:00–17:00" },
    { day: "Samstag", time: "9:00–12:00" },
    { day: "Sonntag", time: "geschlossen · Nachtdienst" },
  ],
  nachtdienst: {
    name: "Tierspital der Vetmeduni Wien",
    phone: "+43 1 25077-5555",
    note: "Kleine Haustiere, 24 Stunden. Silvia verbindet und übergibt das Protokoll.",
  },
};

export const BUNDESLAENDER: Bundesland[] = [
  "Wien",
  "Niederösterreich",
  "Oberösterreich",
  "Steiermark",
  "Tirol",
  "Salzburg",
  "Kärnten",
  "Vorarlberg",
  "Burgenland",
];

/** Signup never copies `NACHTDIENSTE` place names onto the Tafel. Landing/killers still use the directory. */
export function defaultNachtdienst(_bundesland?: string | null): {
  name: string;
  phone: string;
  note: string;
} {
  return {
    name: "",
    phone: "",
    note: "",
  };
}

export const NACHTDIENSTE: {
  land: Bundesland;
  place: string;
  detail: string;
}[] = [
  {
    land: "Wien",
    place: "Tierspital Vetmeduni",
    detail: "Veterinärplatz 1, 1210 · Kleintier 24 h",
  },
  {
    land: "Niederösterreich",
    place: "Bereitschaft je Bezirk",
    detail: "St. Pölten, Wr. Neustadt, Baden",
  },
  {
    land: "Oberösterreich",
    place: "Linz und Wels",
    detail: "Klinik oder Nachtring der Ordination",
  },
  {
    land: "Steiermark",
    place: "Graz und Umgebung",
    detail: "hinterlegte Nachtklinik",
  },
  {
    land: "Tirol",
    place: "Innsbruck",
    detail: "Nachtklinik, von der Ordination gelegt",
  },
  {
    land: "Salzburg",
    place: "Stadt Salzburg",
    detail: "Klinik oder Bereitschaft",
  },
  {
    land: "Kärnten",
    place: "Klagenfurt / Villach",
    detail: "Nachtdienst hinterlegt",
  },
  {
    land: "Vorarlberg",
    place: "Feldkirch / Dornbirn",
    detail: "Landesbereitschaft",
  },
  {
    land: "Burgenland",
    place: "Eisenstadt und Bezirke",
    detail: "Nachtdienst hinterlegt",
  },
];

export const AT_FACTS = [
  {
    t: "Heimtierdatenbank",
    d: "Hunde sind seit 2010 chip- und registerpflichtig. Silvia nimmt die Nummer auf.",
  },
  {
    t: "Hundeabgabe",
    d: "In Wien bei der MA 6. Silvia erklärt es, das Amt bleibt das Amt.",
  },
  {
    t: "Wiener Linien",
    d: "Leine und Maulkorb. U2 Rathaus, Josefstädter Straße – der Weg zur Ordination.",
  },
  {
    t: "EU-Heimtierausweis",
    d: "Tollwut, Ausweis, Termin vor der Reise – rechtzeitig eingeplant.",
  },
  {
    t: "Feiertage wie im Gesetz",
    d: "Stefanitag, nicht zweiter Weihnachtstag. Karfreitag ist kein gesetzlicher Feiertag.",
  },
  {
    t: "Mittagspause",
    d: "12 bis 14 Uhr ist Normalität. Silvia hebt trotzdem ab.",
  },
];

export const PRACTICE_LOCAL = {
  bezirk: "8. Bezirk, Josefstadt",
  transit: "U2 Rathaus, Straßenbahn 2 und 5",
  parking: "Kurzparkzone Mo–Fr. Parkpickerl oder Ticket.",
};

export const PMS_OPTIONS: readonly (typeof PRAXISSOFTWARE_PMS_OPTIONS)[number][] =
  [...PRAXISSOFTWARE_PMS_OPTIONS];
export {
  PMS_DEFAULT,
  PMS_HINT_ID,
  PRAXISSOFTWARE_HINT,
  VQUADRAT_KIND,
  VQUADRAT_LABEL,
} from "../practice/praxissoftware.ts";

export const AT_HOLIDAYS = [
  { name: "Neujahr", date: "1. Jänner" },
  { name: "Heilige Drei Könige", date: "6. Jänner" },
  { name: "Ostermontag", date: "beweglich" },
  { name: "Staatsfeiertag", date: "1. Mai" },
  { name: "Christi Himmelfahrt", date: "beweglich" },
  { name: "Pfingstmontag", date: "beweglich" },
  { name: "Fronleichnam", date: "beweglich" },
  { name: "Mariä Himmelfahrt", date: "15. August" },
  { name: "Nationalfeiertag", date: "26. Oktober" },
  { name: "Allerheiligen", date: "1. November" },
  { name: "Mariä Empfängnis", date: "8. Dezember" },
  { name: "Heiliger Abend", date: "24. Dezember, ab Mittag zu" },
  { name: "Weihnachten", date: "25. Dezember" },
  { name: "Stefanitag", date: "26. Dezember" },
];

export const ADDON_AKTE = {
  id: "akte",
  name: "Sonderedition Akte",
  tagline: "Silvia kennt Fritz.",
  monthlyText: "Preis und Integrationsumfang nach Abstimmung.",
  features: [
    "Wissensdatenbank der Ordination – nicht nur Termine",
    "Anrufer: „Wie geht’s dem Kater Fritz?“ – Silvia weiß: nur in der Box transportieren",
    "Chip, letzte Impfung, Hinweise der Tierarzthelferin, bevorzugter Slot",
    "Eigene Tiere nachtragen",
    "Praxissoftware-Anbindung separat zu prüfen",
  ],
};

export const FAQS = [
  {
    q: "Wann habt ihr offen?",
    a: "Von 8:00 bis 12:00 und von 14:00 bis 18:00. Mittwoch nur vormittags, Freitag bis 17:00, Samstag 9:00–12:00.",
  },
  {
    q: "Darf der Hund in die U-Bahn?",
    a: "Wiener Linien: Leine und Maulkorb, außer in der Transportbox. Aussteigen U2 Rathaus.",
  },
  {
    q: "Wie kommt der Kater Fritz her?",
    a: "Nur in der Transportbox. Nicht frei tragen, nicht in der Tasche. Frau Berger nicht in der Früh.",
  },
  {
    q: "Wohin bei Notfall in der Nacht?",
    a: "Tierspital der Vetmeduni Wien, Veterinärplatz 1, 1210, +43 1 25077-5555.",
  },
];

/** Startseite: Wortlaut der Homepage-Fragen. */
export const FAQ = [
  {
    q: "Ist Silvia eine tierärztliche Beratung?",
    a: "Nein. Silvia ist die Rezeption: Termine, Zeiten, Rückrufhinweise, Dokumentation. Keine Diagnose.",
  },
  {
    q: "Was passiert, wenn Silvia einen Notfall falsch einordnet?",
    a: "Silvia beurteilt nichts medizinisch. Die Demo prüft fest hinterlegte Schlagwörter wie Atemnot, Blutung, Krampf, Gift, Unfall und aufgebläht; diese Liste ist noch nicht über die Oberfläche konfigurierbar. Andere Formulierungen oder Erkennungsfehler können dazu führen, dass ein Notfall nicht erkannt wird. Bei einem Treffer liegt ein Notfallhinweis auf der Praxistafel; das ist keine automatische Alarmierung. Die Tierarzthelferin prüft die Lage und öffnet den hinterlegten Nachtdienstkontakt bei Bedarf selbst. Die tierärztliche Verantwortung bleibt bei der Ordination. In der Praxistafel werden Gespräche als Mitschrift protokolliert.",
  },
  {
    q: "Was ist anders als bei Lösungen aus Deutschland?",
    a: "Österreichisches Deutsch, Mittagspause, unsere Feiertage und Nachtdienst je Bundesland. WhatsApp ist ein manueller Entwurf an die Halterin. 20 % USt.",
  },
  {
    q: "Wie funktioniert der Nachtdienst?",
    a: "Die Gesprächs-Demo zeigt außerhalb der hinterlegten Zeiten Hinweise und Terminwünsche auf der Praxistafel. Ein öffentlicher Telefonbetrieb ist noch nicht abgenommen. SMS und WhatsApp werden nicht automatisch versendet; die Tierarzthelferin kann Entwürfe selbst öffnen. Im Notfall liegt ein Hinweis auf der Praxistafel und die Tierarzthelferin öffnet den hinterlegten Nachtdienstkontakt bei Bedarf selbst.",
  },
  {
    q: "Welche Ordinationssoftware wird unterstützt?",
    a: "Eine Praxissoftware-Anbindung wird je Ordination geprüft. Termine liegen zunächst auf der Praxistafel; eine allgemeine Zwei-Wege-Synchronisation ist nicht zugesagt.",
  },
  {
    q: "Ist WhatsApp datenschutzkonform?",
    a: "Silvia schreibt einen Entwurf an die Halterin (wa.me). Eine WhatsApp-Business-API ist keine Pflicht.",
  },
  {
    q: "Wie schnell ist sie live?",
    a: "Startzeit, Einrichtung und Testdauer stimmen wir gemeinsam nach den Anforderungen Ihrer Ordination ab.",
  },
  {
    q: "Was passiert nach der Testphase mit meinen Anrufen?",
    a: "Export, Aufbewahrung und Löschung sowie Anbieter, Speicherort und Auftragsverarbeitung vereinbaren wir vor dem Praxisbetrieb gemeinsam.",
  },
  {
    q: "Gilt die Chippflicht?",
    a: "Hunde brauchen seit 2010 Chip und Eintrag in der Heimtierdatenbank. Silvia nimmt die Nummer auf, die Meldung ans Amt macht die Ordination.",
  },
  {
    q: "Hundeabgabe und Öffis?",
    a: "In Wien läuft die Hundeabgabe über die MA 6, bei den Wiener Linien gelten Leine und Maulkorb. Silvia erklärt es, ersetzt aber kein Amt.",
  },
  {
    q: "Ist Silvia in der Tierärztekammer?",
    a: "Nein. Silvia ist Rezeptionssoftware. Impressum in Wien, DSGVO und DSG.",
  },
];

export const FEATURES = [
  {
    title: "Gesprächs-Demo für die Rezeption",
    body: "Die Demo zeigt Gesprächsnotizen und Terminwünsche auf der Praxistafel. Bestehende Termine verschiebt oder storniert die Tierarzthelferin.",
  },
  {
    title: "Nachrichten als Entwurf",
    body: "WhatsApp als wa.me-Entwurf an die Halterin; Silvia führt keinen Chat und verschickt keine Terminlinks.",
  },
  {
    title: "Notfall, nicht Mobilbox",
    body: "Atemnot, Blutung, Krampf, Gift: Silvia legt die Lage auf die Praxistafel. Die Tierarzthelferin öffnet den hinterlegten Nachtdienstkontakt.",
  },
  {
    title: "Kalender, der Österreich kennt",
    body: "Hl. Drei Könige, Fronleichnam, Nationalfeiertag, Mariä Empfängnis. Keine Feiertags-Termine außer der Nachtdienst ist offen.",
  },
  {
    title: "Systeme, die Sie schon haben",
    body: "Eine Praxissoftware-Anbindung wird je Ordination geprüft. Termine liegen zunächst auf der Praxistafel.",
  },
  {
    title: "Ein Ton für Ihre Ordination",
    body: "Österreichisches Hochdeutsch mit Sie. Hörtest und Qualitätsprüfung vor dem Einsatz; ein Akzent wird nicht garantiert.",
  },
];

export const DIFFERENCE = [
  {
    title: "Sprache",
    ours: "Begrüßung und Formulierungen auf Österreichisch",
    other: "Hörtest und Formulierungen vor dem Einsatz klären",
  },
  {
    title: "Kanäle",
    ours: "Demo und manuelle WhatsApp-Nachrichtenentwürfe",
    other: "Telefonbetrieb und Kanäle separat prüfen",
  },
  {
    title: "Kalender",
    ours: "Ordinationszeiten und Terminregeln",
    other: "Eigene Zeiten und Sonderregeln hinterlegen und prüfen",
  },
  {
    title: "Nacht",
    ours: "Tafelhinweis und hinterlegten Kontakt manuell öffnen",
    other: "Nachtdienstkontakt und Zuständigkeit manuell klären",
  },
  {
    title: "Recht",
    ours: "Keine Konformitätszusage",
    other: "Datenwege und Rechtsgrundlagen vor dem Einsatz prüfen",
  },
  {
    title: "Register",
    ours: "Chip in der Akte, keine Registerübermittlung",
    other: "Eigene Register- und Übergabewege klären",
  },
  {
    title: "Feiertage",
    ours: "Kalenderregeln und Sonderöffnungen",
    other: "Eigene Feiertage und Sonderöffnungen prüfen",
  },
];

export const STATS = [
  { value: "Ihr Test", label: "Abläufe vor dem Einsatz prüfen" },
  { value: "Test", label: "nach Abstimmung" },
  { value: "9 Länder", label: "alle Bundesländer, eine Nummer" },
  { value: "20 %", label: "USt, klar auf der Rechnung" },
];

function atDay(offset: number, hour: number, minute: number) {
  return formatISO(
    setMinutes(setHours(addDays(startOfDay(new Date()), offset), hour), minute),
  );
}

export function seedAppointments(): Appointment[] {
  return [
    {
      id: "a1",
      start: atDay(0, 9, 0),
      minutes: 20,
      owner: "Frau Leitner",
      pet: "Wastl",
      type: "Lahmheit",
      vet: "Dr. Huber",
      channel: "telefon",
    },
    {
      id: "a2",
      start: atDay(0, 9, 30),
      minutes: 15,
      owner: "Herr Pichler",
      pet: "Mizzi",
      type: "Impfung Katze",
      vet: "Dr. Huber",
      channel: "whatsapp",
    },
    {
      id: "a3",
      start: atDay(0, 10, 0),
      minutes: 30,
      owner: "Familie Gruber",
      pet: "Bella",
      type: "Kontrolle nach OP",
      vet: "Dr. Huber",
      channel: "web",
    },
    {
      id: "a4",
      start: atDay(0, 11, 0),
      minutes: 20,
      owner: "Mag. Steiner",
      pet: "Felix",
      type: "Zahnstein",
      vet: "Dr. Huber",
      channel: "telefon",
    },
    {
      id: "a5",
      start: atDay(0, 14, 30),
      minutes: 40,
      owner: "Frau Steiner",
      pet: "Luna",
      type: "Ultraschall",
      vet: "Dr. Huber",
      channel: "telefon",
    },
    {
      id: "a6",
      start: atDay(1, 9, 0),
      minutes: 20,
      owner: "Herr Moser",
      pet: "Strolchi",
      type: "Impfung Hund",
      vet: "Dr. Huber",
      channel: "whatsapp",
    },
    {
      id: "a7",
      start: atDay(1, 10, 30),
      minutes: 25,
      owner: "Frau Koller",
      pet: "Hasi",
      type: "Kastration Vorgespräch",
      vet: "Dr. Huber",
      channel: "web",
    },
  ];
}

export const CALLS: CallRecord[] = [
  {
    id: "c1",
    at: atDay(0, 8, 12),
    channel: "telefon",
    caller: "Elisabeth Leitner",
    pet: "Wastl",
    species: "Dackel, 7 Jahre",
    concern: "Lahmheit vorne rechts seit heuer Früh",
    status: "erledigt",
    durationSec: 94,
    action: "Termin heute 9:00 bei Dr. Huber",
    transcript: [
      {
        from: "anrufer",
        text: "Grüß Gott, Leitner mein Name. Mein Wastl lahmt seit heuer Früh vorne rechts.",
      },
      {
        from: "alma",
        text: "Grüß Gott, Frau Leitner. Silvia von der Ordination Huber. Tut mir leid wegen Wastl – belastet er die Pfote noch, oder schont er sie deutlich?",
      },
      {
        from: "anrufer",
        text: "Er schont sie. Fressen tut er, Fieber hab ich keines gemessen.",
      },
      {
        from: "alma",
        text: "Gut, dass Sie anrufen. Der Terminwunsch für heute um 9:00 liegt auf der Demo-Tafel. Das Team prüft ihn und meldet sich bei Bedarf.",
      },
    ],
  },
  {
    id: "c2",
    at: atDay(0, 7, 48),
    channel: "whatsapp",
    caller: "Thomas Pichler",
    pet: "Mizzi",
    species: "EKH, 3 Jahre",
    concern: "Jährliche Impfung",
    status: "erledigt",
    durationSec: 40,
    action: "Termin heute 9:30, Impfpass mitbringen",
    transcript: [
      {
        from: "anrufer",
        text: "Servus, Mizzi braucht die jährliche Impfung. Geht's heuer noch vor dem Urlaub?",
      },
      {
        from: "alma",
        text: "Servus, Herr Pichler – heute 9:30 passt. Bitte Impfpass mitnehmen. Falls Mizzi einen Chip hat, prüfen wir den Eintrag im Heimtierregister gleich mit.",
      },
    ],
  },
  {
    id: "c3",
    at: atDay(0, 6, 4),
    channel: "telefon",
    caller: "Nina Horvath",
    pet: "Boni",
    species: "Labrador, 2 Jahre",
    concern: "Atemnot nach Spaziergang",
    status: "notfall",
    durationSec: 128,
    action: "Notfallhinweis: hinterlegten Kontakt manuell prüfen",
    transcript: [
      {
        from: "anrufer",
        text: "Bitte, mein Hund schnauft ganz komisch, die Zunge ist fast blau.",
      },
      {
        from: "alma",
        text: "Ich bleibe bei Ihnen. Das ist ein Notfall. Atmet er noch? Auf der Demo-Tafel liegt der hinterlegte Nachtdienstkontakt zur manuellen Prüfung bereit.",
      },
      { from: "anrufer", text: "Ja, er atmet, aber schwer. Bitte schnell." },
      {
        from: "alma",
        text: "Bitte lassen Sie das Team den hinterlegten Kontakt und das weitere Vorgehen selbst prüfen.",
      },
    ],
  },
  {
    id: "c4",
    at: atDay(-1, 18, 41),
    channel: "telefon",
    caller: "Familie Gruber",
    pet: "Bella",
    species: "Mischling, 9 Jahre",
    concern: "OP-Kontrolle, Naht juckt",
    status: "erledigt",
    durationSec: 71,
    action: "Termin heute 10:00",
    transcript: [
      {
        from: "anrufer",
        text: "Bella hat letzte Woche die Kreuzband-OP gehabt, sie leckt an der Naht.",
      },
      {
        from: "alma",
        text: "Bitte den Kragen auflassen. Ich lege eine Kontrolle heute um 10:00. Falls die Naht nässt oder stark riecht, rufen Sie uns sofort wieder an.",
      },
    ],
  },
  {
    id: "c5",
    at: atDay(-1, 16, 2),
    channel: "whatsapp",
    caller: "David Koller",
    pet: "Hasi",
    species: "Zwergkaninchen, 1 Jahr",
    concern: "Kastration Termin",
    status: "erledigt",
    durationSec: 55,
    action: "Vorgespräch morgen 10:30",
    transcript: [
      {
        from: "anrufer",
        text: "Wir möchten Hasi kastrieren lassen. Was brauchen Sie von uns?",
      },
      {
        from: "alma",
        text: "Ein Vorgespräch reicht. Morgen 10:30 bei Dr. Huber. Nüchtern muss Hasi dafür nicht sein.",
      },
    ],
  },
  {
    id: "c6",
    at: atDay(-1, 12, 17),
    channel: "telefon",
    caller: "Karin Moser",
    pet: "—",
    species: "—",
    concern: "Haben Sie am Nationalfeiertag offen?",
    status: "erledigt",
    durationSec: 32,
    action: "Info: 26. Oktober geschlossen, Nachtdienst hinterlegt",
    transcript: [
      { from: "anrufer", text: "Seid ihr am Nationalfeiertag da?" },
      {
        from: "alma",
        text: "Am 26. Oktober bleibt die Ordination geschlossen. Der Nachtdienst läuft über das Tierspital der Vetmeduni Wien, +43 1 25077-5555. Am 27. sind wir wieder ab 8:00 für Sie da.",
      },
    ],
  },
  {
    id: "c7",
    at: atDay(-1, 11, 8),
    channel: "telefon",
    caller: "Anna Böhm",
    pet: "Burschi",
    species: "Mischling, 4 Jahre",
    concern: "Anreise U2, Maulkorb",
    status: "erledigt",
    durationSec: 48,
    action: "Info Wiener Linien, Termin gehalten",
    transcript: [
      {
        from: "anrufer",
        text: "Muss Burschi in der U2 einen Maulkorb? Wir kommen aus Floridsdorf.",
      },
      {
        from: "alma",
        text: "In Wien ja – Wiener Linien: Leine und Maulkorb, außer er fährt in der Box. Steigen Sie an Rathaus aus, Josefstädter Straße zu Fuß. Wir warten auf Sie.",
      },
    ],
  },
];

export const THREADS: ChatThread[] = [
  {
    id: "t1",
    name: "Thomas Pichler",
    pet: "Mizzi",
    preview: "Impfpass liegt im Auto, wir sind in 10 Minuten da.",
    unread: 0,
    messages: [
      {
        from: "owner",
        text: "Servus, Mizzi braucht die jährliche Impfung.",
        at: atDay(0, 7, 40),
      },
      {
        from: "alma",
        text: "Servus, Herr Pichler. Heute 9:30 bei Dr. Huber. Bitte Impfpass mitnehmen.",
        at: atDay(0, 7, 41),
      },
      {
        from: "owner",
        text: "Impfpass liegt im Auto, wir sind in 10 Minuten da.",
        at: atDay(0, 9, 18),
      },
    ],
  },
  {
    id: "t2",
    name: "Julia Reiter",
    pet: "Oskar",
    preview: "Danke, dann kommen wir am Samstag.",
    unread: 1,
    messages: [
      {
        from: "owner",
        text: "Oskar hat Durchfall seit gestern, muss der heute noch schauen?",
        at: atDay(0, 8, 55),
      },
      {
        from: "alma",
        text: "Wenn er noch trinkt und kein Blut im Kot ist, reicht der nächste freie Slot. Samstag 9:20 wäre frei. Bei Erbrechen, Apathie oder Blut bitte sofort anrufen.",
        at: atDay(0, 8, 56),
      },
      {
        from: "owner",
        text: "Danke, dann kommen wir am Samstag.",
        at: atDay(0, 9, 2),
      },
    ],
  },
  {
    id: "t3",
    name: "Michael Weiss",
    pet: "Asta",
    preview: "Chip-Nummer habe ich: 040 123 000 000 123",
    unread: 0,
    messages: [
      {
        from: "owner",
        text: "Asta ist neu bei uns, müssen wir den Chip ummelden?",
        at: atDay(-1, 19, 12),
      },
      {
        from: "alma",
        text: "Ja – in Österreich gehört der Chip ins Heimtierregister. Bringen Sie den Nachweis mit, wir tragen die Halterdaten bei uns ein und erinnern Sie an die Ummeldung.",
        at: atDay(-1, 19, 13),
      },
      {
        from: "owner",
        text: "Chip-Nummer habe ich: 040 123 000 000 123",
        at: atDay(-1, 19, 20),
      },
    ],
  },
];

export const EMERGENCIES: EmergencyCase[] = [
  {
    id: "e1",
    at: atDay(0, 6, 4),
    owner: "Nina Horvath",
    pet: "Boni",
    species: "Labrador",
    summary: "Atemnot, Zunge zyanotisch nach Spaziergang",
    urgency: "notfall",
    routedTo: "Vetmeduni Wien · Tierspital",
    status: "neu",
  },
  {
    id: "e2",
    at: atDay(-1, 22, 18),
    owner: "Paul Eder",
    pet: "Gretl",
    species: "Katze",
    summary: "Krampfanfall, 3 Minuten, jetzt benommen",
    urgency: "notfall",
    routedTo: "Vetmeduni Wien · Tierspital",
    status: "dokumentiert",
  },
  {
    id: "e3",
    at: atDay(-2, 21, 44),
    owner: "Sabine Fuchs",
    pet: "Waldi",
    species: "Beagle",
    summary: "Verdacht Giftköder, frothiger Speichel",
    urgency: "notfall",
    routedTo: "Vetmeduni Wien · Tierspital",
    status: "dokumentiert",
  },
];

export const WEEKLY_VOLUME = [
  { day: "Mo", auto: 38, hand: 4 },
  { day: "Di", auto: 41, hand: 5 },
  { day: "Mi", auto: 29, hand: 3 },
  { day: "Do", auto: 36, hand: 6 },
  { day: "Fr", auto: 44, hand: 5 },
  { day: "Sa", auto: 22, hand: 2 },
  { day: "So", auto: 11, hand: 1 },
];

export const LIVE_TRANSCRIPT = [
  {
    from: "anrufer" as const,
    text: "Grüß Gott, Leitner. Mein Wastl lahmt seit heuer Früh.",
  },
  {
    from: "alma" as const,
    text: "Grüß Gott, Frau Leitner. Silvia von der Ordination Huber im achten Bezirk. Belastet er die Pfote noch?",
  },
  {
    from: "anrufer" as const,
    text: "Er schont sie. Fieber hab ich keines gemessen.",
  },
  {
    from: "alma" as const,
    text: "Der Terminwunsch für heute um 9:00 liegt auf der Demo-Tafel. Das Team prüft ihn.",
  },
];

export const SUGGESTED_PROMPTS = [
  "Wie geht’s dem Kater Fritz?",
  "Wastl, Chip 040098100123456 – Impfung?",
  "Maulkorb in der U2?",
  "Atemnot, Zunge bläulich.",
  "Rufen Sie mich zurück, bitte.",
];

export function nextSlotISO() {
  const base = setMinutes(setHours(addDays(startOfDay(new Date()), 1), 9), 30);
  return formatISO(addMinutes(base, 0));
}

export const COMPANY = {
  name: "Silvia Vet GmbH",
  street: "Lindengasse 41",
  zip: "1070",
  city: "Wien",
  fn: "FN 623847 z",
  court: "Handelsgericht Wien",
  uid: "ATU76543215",
  gf: "Mag. Lena Prinz",
  email: "hallo@silvia.vet",
  phone: "+43 1 997 12 00",
  chamber: "Wirtschaftskammer Wien",
};
