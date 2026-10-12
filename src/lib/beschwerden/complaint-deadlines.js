/**
 * Einfache Bearbeitungsfristen für die Betreiber-Tafel.
 *
 * Die Fristen sind nur ein sichtbarer Vorschlag. Dieses Modul verständigt
 * niemanden und verändert keine gespeicherten Beschwerden.
 */

/** @type {Record<string, number>} */
export const complaintDeadlineHours = Object.freeze({
  sicherheit: 1,
  dringend: 4,
  normal: 48,
});

/** @type {Record<string, string>} */
const defaultOwners = Object.freeze({
  sicherheit: "Sicherheit / Technik",
  dringend: "Technik / Kundenservice",
  normal: "Kundenservice",
});

/** @param {string} priority */
export function vorgeschlageneZustaendigkeit(priority) {
  const owner = defaultOwners[priority];
  if (!owner) throw new RangeError("Unbekannte Dringlichkeitsstufe für die Bearbeitungsfrist.");
  return owner;
}

/** @param {Date | string} value @param {string} name */
function validDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${name} muss ein gültiger Zeitpunkt sein.`);
  return date;
}

/**
 * @param {{ createdAt: string, priority: string, owner?: string, now?: Date | string }} complaint
 */
export function berechneBeschwerdefrist({ createdAt, priority, owner = "", now = new Date() }) {
  const created = validDate(createdAt, "Erstellt am");
  const checkedAt = validDate(now, "Prüfzeitpunkt");
  const hours = complaintDeadlineHours[priority];
  if (!hours) throw new RangeError("Unbekannte Dringlichkeitsstufe für die Bearbeitungsfrist.");

  const dueAt = new Date(created.getTime() + hours * 60 * 60 * 1000);
  const assignedOwner = owner.trim() || vorgeschlageneZustaendigkeit(priority);

  return {
    owner: assignedOwner,
    dueAt: dueAt.toISOString(),
    isOverdue: checkedAt.getTime() > dueAt.getTime(),
  };
}
