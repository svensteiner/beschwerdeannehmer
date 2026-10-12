import assert from "node:assert/strict";
import test from "node:test";
import { aggregateComplaintAnalytics, complaintAnalyticsCsv } from "./complaint-analytics.js";

test("wertet Beschwerden nur nach Standort, Kategorie, Monat und Status aus", () => {
  const complaints = [
    { location: "Hauptbahnhof", category: "E-Laden", createdAt: "2026-10-02T08:00:00.000Z", status: "neu", name: "Darf nicht erscheinen" },
    { location: "Hauptbahnhof", category: "E-Laden", createdAt: "2026-10-20T08:00:00.000Z", status: "geschlossen", email: "person@example.invalid" },
    { location: "Hauptbahnhof", category: "E-Laden", createdAt: "2026-11-01T08:00:00.000Z", status: "in_pruefung" },
    { location: "Stadtpark", category: "Sauberkeit", createdAt: "2026-10-02T08:00:00.000Z", status: "geschlossen" },
  ];
  const rows = aggregateComplaintAnalytics(complaints);

  assert.deepEqual(rows, [
    { location: "Hauptbahnhof", category: "E-Laden", month: "2026-10", count: 2, closed: 1, open: 1 },
    { location: "Hauptbahnhof", category: "E-Laden", month: "2026-11", count: 1, closed: 0, open: 1 },
    { location: "Stadtpark", category: "Sauberkeit", month: "2026-10", count: 1, closed: 1, open: 0 },
  ]);
});

test("CSV enthält ausschließlich die anonymen Summenfelder und schützt Anführungszeichen", () => {
  const csv = complaintAnalyticsCsv([
    { location: 'Garage "Mitte"', category: "E-Laden", month: "2026-10", count: 3, closed: 2, open: 1 },
  ]);

  assert.equal(
    csv,
    '"Standort","Kategorie","Monat","Anzahl","Abgeschlossen","Offen"\r\n"Garage ""Mitte""","E-Laden","2026-10","3","2","1"',
  );
  assert.doesNotMatch(csv, /name|email|telefon/i);
});
