export type Patient = {
  chip: string;
  name: string;
  species: string;
  breed: string;
  born: string;
  owner: string;
  phone: string;
  lastVaccine: string;
  rabies: string;
  registered: boolean;
  notes: string;
  lastVisit?: string;
  nextDue?: string;
  warnings?: string;
  source?: "stamm" | "telefon" | "kassa";
  lastCallAt?: string;
  lastCallNote?: string;
  /** Datenabgleich (identify.ts): Halterin-Adresse fuer die Identifikation am Telefon. */
  address?: string;
};

export const PATIENTS: Patient[] = [
  {
    chip: "040098100123456",
    name: "Wastl",
    species: "Hund",
    breed: "Golden Retriever",
    born: "2018",
    owner: "Frau Leitner",
    phone: "+43 664 512 88 21",
    address: "Lerchenfelder Straße 45, 1080 Wien",
    lastVaccine: "12. März 2026, Staupe/Parvo",
    rabies: "12. März 2026",
    registered: true,
    lastVisit: "9. August 2026, Lahmheit vorne links",
    nextDue: "Jahresschutz März 2027",
    warnings: "Maulkorb in den Wiener Linien. Ruhig, darf in den Warteraum.",
    notes: "Stammklientel, achter Bezirk.",
  },
  {
    chip: "040098100888777",
    name: "Fritz",
    species: "Kater",
    breed: "Europäisch Kurzhaar",
    born: "2019",
    owner: "Mag. Eva Berger",
    phone: "+43 664 221 09 44",
    address: "Lange Gasse 8, 1080 Wien",
    lastVaccine: "18. Jänner 2026, Katzenschnupfen",
    rabies: "fehlt (Wohnungskatze)",
    registered: true,
    lastVisit: "3. August 2026, Kontrolle, Gewicht 4,8 kg",
    nextDue: "Blutkontrolle, Frau Doktor will Gewicht sehen",
    warnings:
      "Nur in der Transportbox transportieren. Nicht frei tragen, nicht in der Tasche. Frau Berger nicht in der Früh legen – Kanzlei.",
    notes:
      "Wohnungskater, kein Freigang. Letztes Mal etwas dünner. Stammplatz 14:30.",
  },
  {
    chip: "040098100654321",
    name: "Mizzi",
    species: "Katze",
    breed: "EHK",
    born: "2021",
    owner: "Herr Pichler",
    phone: "+43 676 220 14 09",
    address: "Türkenstraße 3, 1090 Wien",
    lastVaccine: "4. Jänner 2026",
    rabies: "nicht nötig für Wohnungskatze, für Reise fehlt sie",
    registered: true,
    lastVisit: "4. Jänner 2026, Impfung",
    nextDue: "Tollwut vor Kroatien",
    notes: "Wohnungskatze. Für Kroatien Tollwut nachholen.",
  },
  {
    chip: "040012349876543",
    name: "Bella",
    species: "Hund",
    breed: "Mischling",
    born: "2016",
    owner: "Familie Gruber",
    phone: "+43 1 405 00 12",
    address: "Skodagasse 8, 1080 Wien",
    lastVaccine: "2. Oktober 2025",
    rabies: "2. Oktober 2025",
    registered: true,
    lastVisit: "OP-Nachkontrolle, Juli 2026",
    nextDue: "Fäden / Kontrolle",
    notes: "Nach OP. Kontrolle fällig.",
  },
  {
    chip: "978000000000111",
    name: "Rex",
    species: "Hund",
    breed: "Schäferhund",
    born: "2024",
    owner: "Herr Nowak",
    phone: "+43 699 110 22 33",
    address: "Währinger Straße 6, 1090 Wien",
    lastVaccine: "Grundimmunisierung offen",
    rabies: "fehlt",
    registered: false,
    lastVisit: "Chip gesetzt, Juni 2026",
    nextDue: "Heimtierdatenbank und Grundimmunisierung",
    notes: "Chip gesetzt, Heimtierdatenbank noch nicht gemeldet.",
  },
];

export function patientBlurb(list: Patient[]) {
  return list
    .map((p) => {
      const bits = [
        p.species,
        p.breed,
        p.born ? `geb. ${p.born}` : "",
        p.chip ? `Chip ${p.chip}` : "",
        p.owner,
        p.phone,
        p.lastVaccine ? `Impfung ${p.lastVaccine}` : "",
        p.rabies ? `Tollwut ${p.rabies}` : "",
        `Register ${p.registered ? "ja" : "nein"}`,
        p.lastVisit ? `letzter Besuch ${p.lastVisit}` : "",
        p.nextDue ? `als Nächstes ${p.nextDue}` : "",
        p.warnings ? `Hinweis: ${p.warnings}` : "",
        p.lastCallNote ? `letztes Telefonat: ${p.lastCallNote}` : "",
      ].filter(Boolean);
      const note = p.notes ? `. ${p.notes}` : "";
      return `${p.name} (${bits.join(", ")}${note})`;
    })
    .join("\n");
}

export const PATIENT_BLURB = patientBlurb(PATIENTS);

export function lookupPatient(
  query: string,
  extra: Patient[] = [],
  options: { includeDemo?: boolean } = {},
) {
  const includeDemo = options.includeDemo !== false;
  const list = includeDemo ? [...extra, ...PATIENTS] : extra;
  const q = query.replace(/\D/g, "");
  if (q.length >= 4) {
    const byChip = list.find(
      (p) => p.chip === q || p.chip.endsWith(q.slice(-4)),
    );
    if (byChip) return byChip;
  }
  const lower = query.toLowerCase();
  const named = list.find((p) => {
    const n = p.name.toLowerCase();
    return (
      lower.includes(n) &&
      (n.length >= 3 || new RegExp(`\\b${n}\\b`, "i").test(query))
    );
  });
  return named ?? null;
}

export type Edition = "standard" | "akte";
