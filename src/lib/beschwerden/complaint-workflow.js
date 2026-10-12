/**
 * Arbeitsanweisung für die Betreiber-Tafel.
 *
 * Diese Regeln entscheiden nur, was auf der Tafel steht. Sie verständigen
 * niemanden automatisch und sind deshalb sicher auch für eine Demo nutzbar.
 */

/** @param {{ location?: string, category?: string, occurredAt?: string, contactPhone?: string, priority?: string }} complaint */
export function complaintHandoff(complaint) {
  const missing = [];
  if (!complaint.location) missing.push("Standort");
  if (!complaint.category) missing.push("Kategorie");
  if (!complaint.occurredAt) missing.push("Zeitpunkt");
  if (!complaint.contactPhone) missing.push("Rückrufnummer");

  if (complaint.priority === "sicherheit") {
    return {
      owner: "Sicherheit / Technik",
      nextStep: "Sofort prüfen und gemäß interner Notfallregel weitergeben.",
      missing,
    };
  }

  if (complaint.priority === "dringend") {
    return {
      owner: "Technik / Kundenservice",
      nextStep: "Zeitnah prüfen und Rückruf veranlassen.",
      missing,
    };
  }

  if (missing.length) {
    return {
      owner: "Kundenservice",
      nextStep: `Angaben nachfassen: ${missing.join(", ")}.`,
      missing,
    };
  }

  return {
    owner: "Kundenservice",
    nextStep: "Vorgang prüfen und Rückmeldung vorbereiten.",
    missing,
  };
}
