/** Die vier einfachen Spalten der Betreiber-Tafel. */
export const complaintBoardColumns = [
  { status: "neu", title: "Neu", next: "in_pruefung", action: "Prüfung starten" },
  { status: "in_pruefung", title: "In Prüfung", next: "beantwortet", action: "Als beantwortet markieren" },
  { status: "beantwortet", title: "Beantwortet", next: "geschlossen", action: "Vorgang schließen" },
  { status: "geschlossen", title: "Geschlossen", next: "neu", action: "Wieder öffnen" },
];

/** @param {Array<{ status: string }>} complaints */
export function complaintsByStatus(complaints) {
  return Object.fromEntries(complaintBoardColumns.map(({ status }) => [status, complaints.filter((complaint) => complaint.status === status)]));
}
