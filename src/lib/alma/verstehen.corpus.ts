/**
 * Verständnis-Korpus: so reden Halterinnen in Österreich wirklich am Telefon.
 * Jede Zeile: Äußerung, erwartete Absicht, Wörter, die in Silvias Antwort
 * vorkommen müssen (mindestens eines), und Wörter, die nicht vorkommen dürfen.
 * Der Korpus ist Testdaten für den lokalen Regelpfad (localReply) und Vorlage
 * für Few-Shot-Beispiele im Modell-Prompt.
 */
export type VerstehenIntent =
  | "zeiten"
  | "termin"
  | "symptom"
  | "notfall"
  | "weg"
  | "chip"
  | "impfung"
  | "preis"
  | "whatsapp"
  | "verschieben"
  | "absagen"
  | "feiertag"
  | "identifikation"
  | "abschluss"
  | "unklar";

export type VerstehenFall = {
  sagt: string;
  absicht: VerstehenIntent;
  erwartet: readonly string[];
  verboten?: readonly string[];
};

export const VERSTEHEN_KORPUS: readonly VerstehenFall[] = [
  {
    sagt: "Wann habts offen?",
    absicht: "zeiten",
    erwartet: ["8", "12", "14", "18"],
  },
  {
    sagt: "Is heut zu bei euch?",
    absicht: "zeiten",
    erwartet: ["Uhr", "offen", "geschlossen", "Mittagspause"],
  },
  {
    sagt: "Habts am Samstag auch auf?",
    absicht: "zeiten",
    erwartet: ["Samstag", "9", "12"],
  },
  {
    sagt: "Servus, i hätt gern an Termin für mein Hund.",
    absicht: "termin",
    erwartet: ["Termin", "passt", "Uhr", "Datenabgleich", "Name"],
  },
  {
    sagt: "Kann ich morgen vormittag vorbeikommen mit der Katze?",
    absicht: "termin",
    erwartet: ["Termin", "morgen", "Uhr", "Datenabgleich", "Name"],
  },
  {
    sagt: "Ich bräuchte einen Termin zur Kontrolle nächste Woche.",
    absicht: "termin",
    erwartet: ["Termin", "Uhr", "Datenabgleich", "Name"],
  },
  {
    sagt: "Mein Kater speibt seit gestern.",
    absicht: "symptom",
    erwartet: ["Termin", "erbr", "speib", "Uhr", "Datenabgleich"],
  },
  {
    sagt: "Die Hündin hat Durchfall, frisst aber.",
    absicht: "symptom",
    erwartet: ["Termin", "Durchfall", "Uhr", "Datenabgleich"],
  },
  {
    sagt: "Der Rudi hustet seit heute früh.",
    absicht: "symptom",
    erwartet: ["Termin", "Husten", "hustet", "Datenabgleich"],
  },
  {
    sagt: "Er humpelt seit dem Spaziergang.",
    absicht: "symptom",
    erwartet: ["Termin", "humpel", "Uhr", "Datenabgleich"],
  },
  {
    sagt: "Er hat an Giftköder gfressn!",
    absicht: "notfall",
    erwartet: ["Notfall", "Tierspital", "Vetmeduni", "sofort", "verbinde"],
    verboten: ["Termin morgen"],
  },
  {
    sagt: "Sie kriegt kane Luft, die Zunge is blau.",
    absicht: "notfall",
    erwartet: ["Notfall", "Tierspital", "Vetmeduni", "sofort", "verbinde"],
  },
  {
    sagt: "Der Hund blutet stark aus der Pfote.",
    absicht: "notfall",
    erwartet: ["Notfall", "Tierspital", "Vetmeduni", "sofort", "verbinde"],
  },
  {
    sagt: "Die Katze krampft, was soll ich tun?",
    absicht: "notfall",
    erwartet: ["Notfall", "Tierspital", "Vetmeduni", "sofort", "verbinde"],
  },
  {
    sagt: "Kann i mitn Hund in die U-Bahn fahren?",
    absicht: "weg",
    erwartet: ["Maulkorb", "Leine", "Box"],
  },
  {
    sagt: "Wie komm ich zu euch, gibts Parkplätze?",
    absicht: "weg",
    erwartet: ["U2", "Rathaus", "Josefstädter", "Kurzparkzone", "Parkpickerl"],
  },
  {
    sagt: "Muss der Welpe gechippt werden?",
    absicht: "chip",
    erwartet: ["Chip", "Heimtierdatenbank", "2010"],
  },
  {
    sagt: "Wo melde ich den Hund an, Hundeabgabe und so?",
    absicht: "chip",
    erwartet: ["MA 6", "M A sechs", "Hundeabgabe", "Amt"],
  },
  {
    sagt: "Wann is die Tollwutimpfung fällig?",
    absicht: "impfung",
    erwartet: ["Impf", "Tollwut", "Datenabgleich", "Name"],
  },
  {
    sagt: "Brauch ich für Kroatien was Besonderes für die Katze?",
    absicht: "impfung",
    erwartet: ["Heimtierausweis", "Tollwut", "Reise"],
  },
  {
    sagt: "Wos kost a Impfung ungefähr?",
    absicht: "preis",
    erwartet: ["Frau Doktor", "Preis", "Kosten", "sag", "nach"],
  },
  {
    sagt: "Was kostet die Kastration bei einem Kater?",
    absicht: "preis",
    erwartet: ["Frau Doktor", "Preis", "Kosten", "sag", "nach"],
  },
  {
    sagt: "Kann ich euch die Fotos vom Impfpass per WhatsApp schicken?",
    absicht: "whatsapp",
    erwartet: ["WhatsApp", "schicken", "Nummer"],
  },
  {
    sagt: "Ich muss den Termin am Donnerstag verschieben.",
    absicht: "verschieben",
    erwartet: ["verschieb", "Termin", "Datenabgleich", "Name"],
  },
  {
    sagt: "Bitte den Termin absagen, wir kommen nicht.",
    absicht: "absagen",
    erwartet: ["absag", "storn", "Termin", "Datenabgleich", "Name"],
  },
  {
    sagt: "Habts am Stefanitag offen?",
    absicht: "feiertag",
    erwartet: ["Stefanitag", "geschlossen", "Feiertag", "Nachtdienst"],
  },
  {
    sagt: "Is am Karfreitag offen?",
    absicht: "feiertag",
    erwartet: ["Karfreitag", "kein gesetzlicher", "offen"],
  },
  {
    sagt: "Leitner, Lerchenfelder Straße 45, im Achten.",
    absicht: "identifikation",
    erwartet: ["Frau Leitner", "hab Sie", "Danke"],
  },
  {
    sagt: "Berger, Eva Berger, Sie haben meine Handynummer, null sechs sechs vier.",
    absicht: "identifikation",
    erwartet: ["Berger", "Handynummer", "Ziffern", "hab Sie"],
  },
  {
    sagt: "Ich heiße Novak, wir waren noch nie bei Ihnen.",
    absicht: "identifikation",
    erwartet: ["neu", "anleg", "Tier"],
  },
  {
    sagt: "Passt, danke, pfiat di.",
    absicht: "abschluss",
    erwartet: ["Wiederhören", "Grüß Gott", "Danke", "Auf Wiederschauen"],
  },
  {
    sagt: "Nein danke, das wars.",
    absicht: "abschluss",
    erwartet: ["Wiederhören", "Danke", "Auf Wiederschauen"],
  },
  {
    sagt: "Äh, ich glaub ich hab mich verwählt.",
    absicht: "unklar",
    erwartet: ["Ordination Huber", "Wiederhören"],
  },
  {
    sagt: "Was?",
    absicht: "unklar",
    erwartet: ["verstanden", "nochmal", "wiederholen", "Was kann ich"],
  },
];
