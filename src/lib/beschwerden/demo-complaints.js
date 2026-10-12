/**
 * Ausschließlich erfundene Vorgänge für eine sichere Produktvorführung.
 *
 * Diese Daten werden nie gespeichert. Sie stehen nur zur Verfügung, wenn der
 * Betreiber den Demo-Modus ausdrücklich mit GARAGEN_DEMO_MODE=1 einschaltet.
 */
const syntheticDemoComplaints = [
  {
    reference: "DEMO-2026-001",
    createdAt: "2026-10-12T08:15:00.000Z",
    location: "Hauptbahnhof",
    category: "Ein-/Ausfahrt",
    description: "Die Ausfahrt öffnet trotz gültigem Ticket nicht. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 01",
    email: "demo-fall-01@example.invalid",
    occurredAt: "2026-10-12T08:05:00.000Z",
    contactPhone: "+43 000 000 001",
    priority: "dringend",
    status: "neu",
    history: [{ at: "2026-10-12T08:15:00.000Z", status: "neu" }],
  },
  {
    reference: "DEMO-2026-002",
    createdAt: "2026-10-12T07:30:00.000Z",
    location: "Stadtpark",
    category: "Sicherheit",
    description: "Eine Fluchttür lässt sich nicht schließen. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 02",
    email: "demo-fall-02@example.invalid",
    occurredAt: "2026-10-12T07:20:00.000Z",
    contactPhone: "+43 000 000 002",
    priority: "sicherheit",
    status: "in_pruefung",
    history: [
      { at: "2026-10-12T07:30:00.000Z", status: "neu" },
      { at: "2026-10-12T07:40:00.000Z", status: "in_pruefung" },
    ],
  },
  {
    reference: "DEMO-2026-003",
    createdAt: "2026-10-11T16:10:00.000Z",
    location: "Hauptbahnhof",
    category: "E-Laden",
    description: "Die Ladesäule startet den Ladevorgang nicht. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 03",
    email: "demo-fall-03@example.invalid",
    occurredAt: "2026-10-11T15:55:00.000Z",
    contactPhone: "+43 000 000 003",
    priority: "normal",
    status: "in_pruefung",
    history: [{ at: "2026-10-11T16:10:00.000Z", status: "in_pruefung" }],
  },
  {
    reference: "DEMO-2026-004",
    createdAt: "2026-10-10T12:45:00.000Z",
    location: "Stadtpark",
    category: "Abrechnung",
    description: "Die Demo-Parkgebühr wurde zweimal angezeigt. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 04",
    email: "demo-fall-04@example.invalid",
    occurredAt: "2026-10-10T12:30:00.000Z",
    contactPhone: "+43 000 000 004",
    priority: "normal",
    status: "beantwortet",
    history: [{ at: "2026-10-10T12:45:00.000Z", status: "beantwortet", response: "Rückmeldung als Demo vorbereitet." }],
  },
  {
    reference: "DEMO-2026-005",
    createdAt: "2026-10-09T09:00:00.000Z",
    location: "Hauptbahnhof",
    category: "Sauberkeit",
    description: "Im Stiegenhaus liegt Abfall. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 05",
    email: "demo-fall-05@example.invalid",
    occurredAt: "2026-10-09T08:45:00.000Z",
    contactPhone: "+43 000 000 005",
    priority: "normal",
    status: "geschlossen",
    history: [{ at: "2026-10-09T09:00:00.000Z", status: "geschlossen" }],
  },
  {
    reference: "DEMO-2026-006",
    createdAt: "2026-10-01T08:00:00.000Z",
    location: "Stadtpark",
    category: "Ein-/Ausfahrt",
    description: "Eine Schranke reagiert verzögert. Dieser offene Demo-Vorgang wirkt bewusst überfällig.",
    name: "Demo Fall 06",
    email: "demo-fall-06@example.invalid",
    occurredAt: "2026-10-01T07:45:00.000Z",
    contactPhone: "+43 000 000 006",
    priority: "dringend",
    status: "in_pruefung",
    history: [{ at: "2026-10-01T08:00:00.000Z", status: "in_pruefung" }],
  },
  {
    reference: "DEMO-2026-007",
    createdAt: "2026-10-12T06:50:00.000Z",
    location: "Hauptbahnhof",
    category: "Beleuchtung",
    description: "Eine Leuchte im dritten Untergeschoss ist ausgefallen. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 07",
    email: "demo-fall-07@example.invalid",
    occurredAt: "2026-10-12T06:40:00.000Z",
    contactPhone: "+43 000 000 007",
    priority: "normal",
    status: "neu",
    history: [{ at: "2026-10-12T06:50:00.000Z", status: "neu" }],
  },
  {
    reference: "DEMO-2026-008",
    createdAt: "2026-10-11T18:20:00.000Z",
    location: "Stadtpark",
    category: "Sonstiges",
    description: "Die Beschilderung zum Ausgang ist missverständlich. Der Vorgang ist rein synthetisch.",
    name: "Demo Fall 08",
    email: "demo-fall-08@example.invalid",
    occurredAt: "2026-10-11T18:00:00.000Z",
    contactPhone: "+43 000 000 008",
    priority: "normal",
    status: "neu",
    history: [{ at: "2026-10-11T18:20:00.000Z", status: "neu" }],
  },
];

/**
 * Liefert nur im ausdrücklich aktivierten Demo-Modus neue Kopien der
 * synthetischen Vorgänge. Außerhalb der Vorführung bleibt die Liste leer.
 */
export function demoComplaints() {
  if (process.env.GARAGEN_DEMO_MODE !== "1") return [];
  return structuredClone(syntheticDemoComplaints);
}
