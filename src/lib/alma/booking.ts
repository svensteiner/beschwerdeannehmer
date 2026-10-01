/**
 * AP 7d Teil 2 — Connector-Buchung: eigene Zustandsmaschine pro Anruf (`callId`).
 *
 * Governance/Risikobegrenzung: dieser Pfad greift NUR wenn `SILVIA_BOOKING=connector`,
 * `SILVIA_BOOKING_LIVE_APPROVED=1` UND `capabilities.write.appointment === true` gelten
 * (siehe `bookingEnabled()`). Ohne alle Schalter
 * bleibt ask-alma.ts beim bisherigen Verhalten (Tafel-Vormerkung) — dieses Modul wird dann
 * gar nicht aufgerufen. ask-alma.ts ruft ausschliesslich `advanceBooking()` an klar
 * abgegrenzter Stelle auf; die Bestandslogik in ask-alma.ts bleibt unveraendert.
 *
 * Zustaende je callId: wunsch -> vorschlag -> (bestaetigt ->) gebucht | zurueck zu wunsch
 * (Ablehnung/kein Slot mehr) | `null` (kein Buchungsversuch, z. B. unbekannte
 * Halterin/Patient) | `failed:true` (echter Schreibversuch oder Transportfehler).
 */
import { formatSlot, SLOT_MINUTES, viennaInstant, viennaNow } from "./hours.ts";
import { appointmentPreference } from "./appointment-preference.ts";
import type { BookingGuard, BookingGuardEntry } from "./booking-guard.ts";
import type { ConnectorOwner, ConnectorPatient, ConnectorVet, PraxissoftwarePort } from "../practice/praxissoftware.ts";
import { appointmentWriteApproved } from "../practice/booking-approval.ts";

export type BookingStep = "wunsch" | "vorschlag" | "gebucht";

type BookingState = {
  step: BookingStep;
  attempts: number;
  slotStart?: string;
  resourceId?: string;
  ownerId?: string;
  patientId?: string;
  requestedDate?: string;
  /**
   * Punkt 12: ALLE bereits abgelehnten Termine. Vorher wurde nur der zuletzt
   * abgelehnte ausgeschlossen — ein frueherer Vorschlag konnte dadurch erneut
   * auftauchen, obwohl die Anruferin ihn schon abgelehnt hatte.
   */
  rejected: string[];
  /**
   * Punkt 4: der zuletzt genannte Tiername. Wird im Vorschlag erneut ein Name
   * genannt, muss er geprueft werden, statt bei der alten Zuordnung zu bleiben.
   */
  spokenPet?: string;
  /** Punkt 5: der zuletzt genannte Haltername, fuer dieselbe Pruefung. */
  spokenOwner?: string;
  /** Punkt 5: die zuletzt genannte Telefonnummer, fuer dieselbe Pruefung. */
  spokenPhone?: string;
  /** Punkt 10: die zuletzt genannte Chipnummer, fuer dieselbe Pruefung. */
  spokenChip?: string;
  /** Punkt 8: wann der Vorschlag entstand, fuer die erneute Vorlaufpruefung. */
  proposedAt?: number;
  uncertain?: boolean;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_CONFLICT_RETRIES = 2;

/**
 * Punkt 1 — Buchungszustand je Praxis trennen.
 *
 * Der Speicher kannte nur `callId`. Zwei Ordinationen koennen dieselbe
 * Anrufkennung vergeben (z. B. fortlaufende Nummern im Gateway); sie haetten
 * sich denselben Zustand geteilt und damit fremde Vorschlaege bestaetigt.
 */
const store = new Map<string, BookingState>();
const inFlight = new Map<string, Promise<BookingTurnResult | null>>();

function stateKey(scope: string, callId: string): string {
  return `${scope}\u0000${callId}`;
}

function prune(now: number) {
  for (const [id, st] of store) if (st.expiresAt <= now) store.delete(id);
}

function getState(key: string): BookingState | null {
  const now = Date.now();
  prune(now);
  const st = store.get(key);
  if (!st || st.expiresAt <= now) return null;
  return st;
}

function setState(key: string, st: BookingState) {
  store.set(key, { ...st, expiresAt: Date.now() + TTL_MS });
}

export function clearBookingState(callId: string, scope = "") {
  store.delete(stateKey(scope, callId));
}

/** Test-only: leert den gesamten Prozess-Speicher zwischen Testfaellen. */
export function _resetBookingStoreForTests() {
  store.clear();
  inFlight.clear();
}

/** Test-only: liest den aktuellen Zustand (z. B. um Idempotenz zu pruefen). */
export function _peekBookingStateForTests(callId: string, scope = ""): BookingState | null {
  return getState(stateKey(scope, callId));
}

/** Governance-Gate: nur mit expliziter Freigabe UND Connector-Schreibrecht. */
export function bookingEnabled(caps: { write: { appointment: boolean } } | null | undefined): boolean {
  return appointmentWriteApproved(caps);
}

/**
 * Punkt 5 — Bestaetigung enger fassen.
 *
 * Vorher genuegte „bitte“ oder „gerne“ als Zustimmung. Beides steht aber
 * haeufig in einer FRAGE oder in einer Verzögerung („Koennen Sie das bitte
 * spaeter eintragen?“), nicht in einer Zusage. „bitte“ allein ist deshalb kein
 * Einverstaendnis mehr; es bleiben die eindeutigen Woerter.
 */
const CONFIRM_WORDS = /\b(ja|passt|genau|in ordnung|einverstanden|gerne|okay|ok)\b/i;

/**
 * Punkt 6 — Verneinungen vollstaendig erfassen.
 *
 * Vorher waren nur „nein“, „lieber“ und „anders“ bekannt. „Ja, aber bitte noch
 * nicht buchen“ bestand damit die Bestaetigungspruefung (es enthaelt „ja“ und
 * „bitte“) — und die Buchung lief los, obwohl die Anruferin sie ausdruecklich
 * aufhielt.
 */
const DENY_WORDS =
  /\b(nein|lieber|anders|doch nicht|nicht buchen|noch nicht|warte|warten|spaeter|später|nachher|verschieben|absagen|abbrechen|kein termin|keinen termin|nicht eintragen|auf keinen fall)\b/i;

/** Ein Fragezeichen am Ende deutet auf eine Rueckfrage, nicht auf eine Zusage. */
const QUESTION_LIKE = /\?\s*$/;

/**
 * Punkt 8 — bedingte Zustimmung.
 *
 * „Ja, wenn Sie mir den Vormittag freihalten“ ist ein Vorbehalt, keine Zusage.
 * Vorher buchte Silvia trotzdem sofort.
 */
const CONDITIONAL = /\b(?:wenn|falls|sofern|vorausgesetzt|unter der bedingung|nur wenn|aber nur)\b/i;

/**
 * Punkt 7 — ausdrueckliches Abbrechen.
 *
 * „Nein, lieber anders“ heisst: anderen Termin vorschlagen. „Abbrechen“ heisst:
 * kein Termin. Vorher bekam die Anruferin auf ein Abbrechen hin einen weiteren
 * Vorschlag.
 */
const CANCEL_WORDS =
  /\b(?:abbrechen|absagen|doch nicht|kein(?:en)? termin|auf keinen fall|nicht mehr|hat sich erledigt|vergessen sie(?: es)?|lass(?:en)? sie das)\b/i;

/** Verneinung geht vor Bestaetigung ("nein, lieber ... passt das?" ist keine Zusage). */
export function isDenial(message: string): boolean {
  return DENY_WORDS.test(message.toLowerCase());
}

/** Punkt 7: ein Abbruch beendet den Vorgang, er schlaegt nichts Neues vor. */
export function isCancel(message: string): boolean {
  return CANCEL_WORDS.test(message.toLowerCase());
}

export function isConfirmation(message: string): boolean {
  const t = message.toLowerCase();
  // Punkt 6: eine Verneinung schlaegt jede Zustimmung.
  if (DENY_WORDS.test(t)) return false;
  // Punkt 7: ein Abbruch ist keine Zustimmung.
  if (CANCEL_WORDS.test(t)) return false;
  // Punkt 8: ein Vorbehalt ist keine Zustimmung.
  if (CONDITIONAL.test(t)) return false;
  // Punkt 5: eine Rueckfrage ist keine Zusage, auch wenn ein Zustimmungswort
  // darin vorkommt („Koennten Sie das bitte machen?“).
  if (QUESTION_LIKE.test(t.trim())) return false;
  // Ein Datum oder eine Uhrzeit im Zustimmungsturn ist eine Änderung, keine
  // Bestätigung des alten Vorschlags. Dafür muss ein neuer Vorschlag folgen.
  const preference = appointmentPreference([message]);
  if (preference?.kind === "date" || preference?.kind === "unclear" ||
      /\b(uhr|halb|viertel|vormittag|nachmittag|\d{1,2}(?::|\.)\d{2})\b/i.test(t)) return false;
  return CONFIRM_WORDS.test(t);
}

/** Vorlauf: ein Slot, der in weniger als 15 Minuten beginnt, ist am Telefon nicht mehr sinnvoll. */
export const SLOT_LEAD_MINUTES = 15;
/** So viele Tage nach vorn suchen, wenn heute nichts Freies mehr in der Zukunft liegt. */
export const SLOT_LOOKAHEAD_DAYS = 7;

/**
 * STATUS.md Zeile 49: Der Connector liefert alle freien Slots eines Tages, auch die schon
 * vergangenen. Silvia darf nie eine Uhrzeit vorschlagen, die vor "jetzt + Vorlauf" liegt.
 *
 * Punkt 12: `excludeStart` kann jetzt MEHRERE Termine ausschliessen. Vorher wurde nur
 * der zuletzt abgelehnte gemerkt — ein frueherer Vorschlag konnte dadurch erneut
 * auftauchen, obwohl die Anruferin ihn schon abgelehnt hatte.
 */
export function pickFutureSlot<T extends { start: string }>(
  slots: readonly T[],
  now: Date,
  opts: { excludeStart?: string | readonly string[]; leadMinutes?: number } = {},
): T | null {
  const earliest = now.getTime() + (opts.leadMinutes ?? SLOT_LEAD_MINUTES) * 60_000;
  const raw = typeof opts.excludeStart === "string"
    ? [opts.excludeStart]
    : [...(opts.excludeStart ?? [])];
  const excluded = new Set(raw);
  // Punkt 15: Ein Vergleich nur ueber den Text griffe zu kurz. Derselbe Termin
  // kann als „2026-09-18T09:00:00“ und „2026-09-18T09:00:00+02:00“ geliefert
  // werden — dann galt er als nicht ausgeschlossen und wurde erneut
  // vorgeschlagen. Deshalb zusaetzlich ueber den tatsaechlichen Zeitpunkt.
  const excludedTimes = new Set<number>();
  for (const value of raw) {
    const t = Date.parse(String(value));
    if (Number.isFinite(t)) excludedTimes.add(t);
  }
  for (const slot of slots) {
    if (excluded.has(slot.start)) continue;
    const t = new Date(slot.start).getTime();
    if (Number.isNaN(t) || t < earliest) continue;
    if (excludedTimes.has(t)) continue;
    return slot;
  }
  return null;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Erster freier Slot in der Zukunft: heute ab jetzt + Vorlauf, sonst die naechsten Tage.
 * `now` injizierbar fuer Tests (Default Wiener Wanduhr).
 */
/**
 * Punkt 16: So viele Ressourcen werden gleichzeitig gefragt.
 *
 * Klein gehalten, damit ein Anschluss nicht mit Anfragen ueberflutet wird.
 */
export const SLOT_QUERY_CONCURRENCY = 3;

/**
 * Punkt 12 — traegt der gelieferte Termin seine Dauer?
 *
 * `freeSlots` liefert Start und Ende. Ein Eintrag, dessen Ende vor
 * `Beginn + Dauer` liegt, ist kein gueltiges Fenster — der Termin wuerde in
 * einen belegten Bereich hineinreichen. Fehlt das Ende, gilt der Eintrag als
 * brauchbar (manche Anschluesse liefern es nicht).
 */
export function slotCoversDuration(
  slot: { start: string; end?: string },
  minutes: number,
): boolean {
  const start = Date.parse(String(slot.start ?? ""));
  if (!Number.isFinite(start)) return false;
  const end = Date.parse(String(slot.end ?? ""));
  if (!Number.isFinite(end)) return true;
  return end - start >= minutes * 60_000;
}

/**
 * Punkt 11 — freie Termine ausdruecklich sortieren.
 *
 * Vorher uebernahm `pickFutureSlot` den ersten passenden Eintrag und vertraute
 * damit auf die Reihenfolge des Anschlusses. Lieferte der Connector die Termine
 * unsortiert, wurde ein spaeterer vorgeschlagen, obwohl ein frueherer frei war.
 */
export function sortSlotsByStart<T extends { start: string }>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => {
    const ta = new Date(a.start).getTime();
    const tb = new Date(b.start).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}

/**
 * Punkt 9 — alle geeigneten Ressourcen durchsuchen.
 *
 * Vorher wurde nur `resources.data[0]` gefragt. Hatte die zweite Ressource
 * freie Termine, blieb der Tag faelschlich als „nichts frei“ stehen.
 *
 * Punkt 10 — Tierarzt passend zum Termin. Die freie Zeit wird zusammen mit der
 * Ressource zurueckgegeben; die Auswahl des Tierarztes geschieht beim Buchen
 * anhand dieser Ressource statt aus dem ersten Listeneintrag.
 */
export type SlotSearchResult =
  | { kind: "slot"; start: string; resourceId: string }
  /** Kein freier Termin in den abgefragten Tagen. */
  | { kind: "none" }
  /** Punkt 11: die Praxissoftware war nicht erreichbar — kein „nichts frei“. */
  | { kind: "unavailable" };

/** Punkt 11: die ehrliche Antwort, wenn der Anschluss nicht erreichbar ist. */
export const CONNECTOR_UNAVAILABLE =
  "Die Praxissoftware ist gerade nicht erreichbar. Bitte lassen Sie den Termin von der Tierarzthelferin auf der Tafel eintragen.";

export async function nextConnectorSlot(
  adapter: PraxissoftwarePort,
  excludeStart?: string | readonly string[],
  /**
   * Nur für Tests: eine simulierte Wiener Wanduhr. Wird sie übergeben, gilt
   * derselbe Wert auch für den Vorlauf — eine Testumgebung simuliert EINE Zeit.
   * Der Produktionspfad lässt den Parameter weg und bekommt dadurch Wanduhr und
   * echten Zeitpunkt getrennt (Punkt 19).
   */
  now?: Date,
  requestedDate?: string,
): Promise<SlotSearchResult> {
  const resources = await adapter.resources();
  // Punkt 11: nicht erreichbar ist kein „kein Termin frei“.
  if (!resources.ok) return { kind: "unavailable" };
  if (!resources.data.length) return { kind: "none" };
  // Wiener Wanduhr für den Kalendertag.
  const wall = now ?? viennaNow();
  // Echter Zeitpunkt für den Vergleich mit den Zeitstempeln des Anschlusses.
  const instant = now ?? viennaInstant();
  const requestedDay = requestedDate
    ? new Date(`${requestedDate}T00:00:00`)
    : null;
  if (requestedDay && (Number.isNaN(requestedDay.getTime()) || isoDate(requestedDay) !== requestedDate)) return { kind: "none" };
  const days = requestedDay
    ? [requestedDay]
    : Array.from({ length: SLOT_LOOKAHEAD_DAYS + 1 }, (_, offset) =>
        new Date(wall.getFullYear(), wall.getMonth(), wall.getDate() + offset));
  const excluded = typeof excludeStart === "string"
    ? [excludeStart]
    : [...(excludeStart ?? [])];

  // Punkt 16: Die Abfragen laufen in kleinen Gruppen statt vollstaendig
  // nacheinander. Bei vielen Ressourcen summierte sich die Wartezeit sonst,
  // und die Anruferin hoerte nichts. Innerhalb einer Gruppe laufen sie
  // gleichzeitig, die Gruppen bleiben nacheinander — so bleibt die Last
  // begrenzt.
  const resourceIds = resources.data.map((r) => r.id);
  // Punkt 11: scheitert auch nur eine Ressourcen-Abfrage, ist „nichts frei“
  // keine belastbare Aussage mehr.
  let sawSlotsError = false;

  for (const day of days) {
    const dayKey = isoDate(day);
    const candidates: Array<{ start: string; resourceId: string }> = [];

    for (let i = 0; i < resourceIds.length; i += SLOT_QUERY_CONCURRENCY) {
      const group = resourceIds.slice(i, i + SLOT_QUERY_CONCURRENCY);
      const results = await Promise.all(
        group.map(async (resourceId) => {
          const slots = await adapter.freeSlots({ date: dayKey, resourceId, minutes: SLOT_MINUTES });
          return { resourceId, slots };
        }),
      );

      for (const { resourceId, slots } of results) {
        if (!slots.ok) {
          sawSlotsError = true;
          continue;
        }
        if (!slots.data.length) continue;
        // Punkt 14: ZUERST nach dem gewuenschten Tag filtern, dann auswaehlen.
        // Vorher konnte ein passender Treffer eines anderen Tages den ersten
        // Platz belegen und den richtigen verdraengen.
        const onDay = requestedDate
          ? slots.data.filter((s) => isoDate(new Date(s.start)) === requestedDate)
          : slots.data;
        // Punkt 12: Der gelieferte Termin muss seine DAUER tragen. Ein Eintrag,
        // dessen Ende vor dem Beginn plus Dauer liegt, ist kein gueltiges
        // Fenster.
        const usable = onDay.filter((s) => slotCoversDuration(s, SLOT_MINUTES));
        if (!usable.length) continue;
        const candidate = pickFutureSlot(sortSlotsByStart(usable), instant, {
          excludeStart: excluded,
        });
        if (!candidate) continue;
        candidates.push({ start: candidate.start, resourceId });
      }
    }
    if (!candidates.length) continue;
    const best = sortSlotsByStart(candidates)[0]!;
    return { kind: "slot", start: best.start, resourceId: best.resourceId };
  }
  return { kind: sawSlotsError ? "unavailable" : "none" };
}

/**
 * Ergebnis der Halter-/Patientensuche.
 *
 * Punkte 2 und 3: Vorher nahm die Funktion bei mehreren Treffern einfach den
 * ersten (`owners.data[0]`) und fiel bei unbekanntem Tiernamen auf das erste
 * Tier des Halters zurueck (`|| patients.data[0]`). Beides ordnet im Zweifel
 * der falschen Person oder dem falschen Tier einen Termin zu.
 *
 * Jetzt ist Mehrdeutigkeit ein eigenes Ergebnis, das eine Rueckfrage ausloest.
 */
export type OwnerLookup =
  | { kind: "found"; owner: ConnectorOwner; patient: ConnectorPatient }
  /** Mehrere Halterinnen passen: erst identifizieren, nicht raten. */
  | { kind: "ambiguous_owner"; count: number }
  /** Genannter Tiername passt zu keinem Tier dieser Halterin. */
  | { kind: "unknown_pet"; owner: ConnectorOwner; names: string[] }
  /** Mehrere Tiere mit demselben Namen: Chip oder Halterin noetig. */
  | { kind: "ambiguous_pet"; owner: ConnectorOwner; count: number }
  /** Kein Tier hinterlegt. */
  | { kind: "no_patient"; owner: ConnectorOwner }
  /** Punkt 9: Nur als verstorben gefuehrte Tiere — kein Termin. */
  | { kind: "deceased_only"; owner: ConnectorOwner; names: string[] }
  /**
   * Punkt 11: Der Anschluss war nicht erreichbar. Das ist KEIN „kenne ich
   * nicht“ — vorher entstanden daraus falsche Aussagen ueber fehlende Akten.
   */
  | { kind: "unavailable" }
  /** Nichts gefunden oder keine Suchkriterien. */
  | { kind: "missing" };

/** Punkt 9: als verstorben markierte Tiere sind keine Termin-Kandidaten. */
function isDeceased(patient: ConnectorPatient): boolean {
  return (patient as { deceased?: unknown }).deceased === true;
}

/** Punkt 10: Chipnummern sind reine Ziffern (volle oder letzte 4 Ziffern). */
function chipDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(0, 15);
}

/** Punkt 10: passt die genannte Chipnummer (voll oder letzte 4) zu einem Tier? */
function chipMatch(patient: ConnectorPatient, chip: string): boolean {
  if (chip.length < 4) return false;
  const p = chipDigits(patient.chip);
  if (!p) return false;
  return p === chip || p.endsWith(chip.slice(-4));
}

/** Punkt 10: genau EIN Chip-Treffer loest die Mehrdeutigkeit auf, sonst nicht. */
function disambiguateByChip(candidates: ConnectorPatient[], chip: string): ConnectorPatient | undefined {
  if (chip.length < 4) return undefined;
  const hits = candidates.filter((p) => chipMatch(p, chip));
  return hits.length === 1 ? hits[0] : undefined;
}

export async function findOwnerAndPatient(
  adapter: PraxissoftwarePort,
  spoken: { phone?: string; owner?: string; pet?: string; chip?: string },
): Promise<OwnerLookup> {
  if (!spoken.phone && !spoken.owner) return { kind: "missing" };
  const owners = await adapter.findOwners({ phone: spoken.phone, name: spoken.owner });
  // Punkt 11: Ein Verbindungsfehler ist kein leeres Ergebnis.
  if (!owners.ok) return { kind: "unavailable" };
  if (!owners.data.length) return { kind: "missing" };
  // Punkt 2: mehrere Treffer sind keine Auswahl. Telefonnummer oder Vorname
  // muessen sie unterscheiden.
  if (owners.data.length > 1) return { kind: "ambiguous_owner", count: owners.data.length };
  const owner = owners.data[0]!;
  const patients = await adapter.patientsOf(owner.id);
  // Auch hier: nicht erreichbar ist kein „kein Tier hinterlegt“.
  if (!patients.ok) return { kind: "unavailable" };
  const living = patients.data.filter((p) => !isDeceased(p));
  if (!patients.data.length) return { kind: "no_patient", owner };
  // Punkt 9: Gibt es nur verstorbene Tiere, wird kein Termin gebucht.
  if (!living.length) {
    return { kind: "deceased_only", owner, names: patients.data.map((p) => p.name).slice(0, 5) };
  }

  const wanted = String(spoken.pet ?? "").trim().toLowerCase();
  // Punkt 10: eine genannte Chipnummer unterscheidet gleichnamige Tiere.
  const chip = chipDigits(spoken.chip);
  if (wanted) {
    const named = living.filter((p) => p.name.toLowerCase() === wanted);
    if (named.length === 0) {
      // Punkt 9: Der genannte Name passt nur zu einem verstorbenen Tier.
      const dead = patients.data.find((p) => p.name.toLowerCase() === wanted);
      if (dead) return { kind: "deceased_only", owner, names: [dead.name] };
      // Punkt 3: der genannte Name passt zu keinem Tier. NICHT auf das erste
      // Tier ausweichen — das waere der falsche Patient.
      return {
        kind: "unknown_pet",
        owner,
        names: living.map((p) => p.name).slice(0, 5),
      };
    }
    if (named.length > 1) {
      const hit = disambiguateByChip(named, chip);
      if (hit) return { kind: "found", owner, patient: hit };
      return { kind: "ambiguous_pet", owner, count: named.length };
    }
    return { kind: "found", owner, patient: named[0]! };
  }

  // Ohne genannten Tiernamen bleibt nur ein eindeutiges lebendes Tier.
  if (living.length > 1) {
    const hit = disambiguateByChip(living, chip);
    if (hit) return { kind: "found", owner, patient: hit };
    return { kind: "ambiguous_pet", owner, count: living.length };
  }
  return { kind: "found", owner, patient: living[0]! };
}

export type BookingTurnResult = {
  text: string;
  actionPatch: { kind: string; summary: string; connectorStart: string; connectorApplied: boolean; connectorAppointmentId?: string };
  /** true nur nach erfolgreichem createAppointment() dieses Turns. */
  applied: boolean;
  /** true when a real createAppointment attempt failed; never implies a local booking. */
  failed?: boolean;
  /** true when transport failure leaves the remote write outcome unknown. */
  uncertain?: boolean;
  /** true when a same-call turn is already being processed; never a booking action. */
  pending?: boolean;
};

function bookingInFlightResult(): BookingTurnResult {
  return {
    text: "Die Buchungsanfrage wird noch verarbeitet – bitte warten Sie auf die Rückmeldung.",
    actionPatch: { kind: "Termin", summary: "Buchung wird verarbeitet", connectorStart: "", connectorApplied: false },
    applied: false,
    pending: true,
  };
}

function bookingFailure(connectorStart: string | null, text: string): BookingTurnResult {
  return {
    text,
    actionPatch: { kind: "Termin", summary: "Nicht eingetragen", connectorStart: connectorStart ?? "", connectorApplied: false },
    applied: false,
    failed: true,
  };
}

/**
 * Punkt 7 — Terminerkennung einheitlich auswerten.
 *
 * Vorher pruefte der Code an mehreren Stellen `kind === "date"` und daneben
 * einen eigenen Wortmuster-Regex. `dateTime` (Datum UND Uhrzeit genannt) fiel
 * dabei durch: „morgen um 15 Uhr“ verlor das Datum, und die Wortmuster fingen
 * nur einen Teil der Formulierungen.
 *
 * Hier steht die Auswertung an einer Stelle; alle Aufrufer nutzen sie.
 */
export type MessageIntent = {
  /** Genanntes Kalenderdatum, auch bei `dateTime`. */
  date: string | null;
  /** Es wurde ein Tag genannt, aber kein eindeutiger. */
  dayUnclear: boolean;
  /** Es wurde eine Uhrzeit genannt (eigene Angabe oder `dateTime`). */
  timeMentioned: boolean;
};

/** Uhrzeit-Wendungen, die die Terminerkennung nicht aufloest, aber anzeigen. */
const TIME_WORDS = /\b(uhr|halb|viertel|dreiviertel|vormittag|nachmittag|mittag|abend|fr(ü|ue)h|gegen|punkt)\b/i;
/**
 * Uhrzeit in Ziffern.
 *
 * Ein Doppelpunkt ist immer eine Uhrzeit. Ein PUNKT dagegen ist meist ein
 * Datum: „am 19.09.2026“ wurde vorher als Uhrzeit gelesen, und der genannte Tag
 * ging verloren. Deshalb zaehlt die gepunktete Form nur zusammen mit „Uhr“.
 */
const CLOCK_LIKE = /\b\d{1,2}:\d{1,2}\b|\b\d{1,2}\.\d{1,2}\s*Uhr\b/i;

export function readMessageIntent(message: string, now?: Date): MessageIntent {
  const text = String(message ?? "");
  const preference = appointmentPreference([text], now);
  const kind = preference?.kind;
  return {
    date: kind === "date" || kind === "dateTime" ? (preference as { date: string }).date : null,
    dayUnclear: kind === "unclear",
    // `dateTime` traegt eine Uhrzeit; sonst entscheiden die Wendungen.
    timeMentioned:
      kind === "dateTime" || TIME_WORDS.test(text) || CLOCK_LIKE.test(text),
  };
}

/** Punkt 12: einen abgelehnten Termin merken, ohne Dubletten. */
function appendRejected(rejected: readonly string[] | undefined, start: string | undefined): string[] {
  const list = [...(rejected ?? [])];
  if (start && !list.includes(start)) list.push(start);
  return list;
}

/**
 * Punkt 12: alle Termine, die nicht erneut vorgeschlagen werden duerfen.
 *
 * Die bereits abgelehnten UND der aktuell abgelehnte. Ohne den aktuellen wuerde
 * die Verneinung denselben Termin noch einmal nennen.
 */
function rejectedWithCurrent(state: BookingState): string[] {
  return appendRejected(state.rejected, state.slotStart);
}

/** Punkt 4: nur ein ANDERER, nicht leerer Tiername ist eine Korrektur. */
function correctionPet(known: string | undefined, incoming: string | undefined): string | null {
  const next = String(incoming ?? "").trim();
  if (!next) return null;
  const before = String(known ?? "").trim().toLowerCase();
  if (!before) return next;
  return before === next.toLowerCase() ? null : next;
}

/**
 * Punkt 5: nur eine ANDERE Telefonnummer ist eine Korrektur.
 *
 * Verglichen werden die Ziffern, damit Schreibweisen wie „0664 123“ und
 * „0664123“ nicht als Aenderung gelten.
 */
function correctionPhone(known: string | undefined, incoming: string | undefined): string | null {
  const next = String(incoming ?? "").trim();
  if (!next) return null;
  const digits = (v: string) => v.replace(/\D/g, "");
  const before = digits(String(known ?? ""));
  const after = digits(next);
  if (!before) return next;
  return before === after ? null : next;
}

/**
 * Punkt 10: nur eine ANDERE Chipnummer ist eine Korrektur. Wie bei der
 * Telefonnummer werden nur die Ziffern verglichen, damit „0400 098 …“ und
 * „0400098…“ nicht als Aenderung gelten.
 */
function correctionChip(known: string | undefined, incoming: string | undefined): string | null {
  const next = String(incoming ?? "").trim();
  if (!next) return null;
  const digits = (v: string) => v.replace(/\D/g, "");
  const before = digits(String(known ?? ""));
  const after = digits(next);
  if (!before) return next;
  return before === after ? null : next;
}

/**
 * Punkt 2/3: Mehrdeutigkeit in eine Rueckfrage uebersetzen.
 *
 * `null` heisst: die Zuordnung ist eindeutig (oder gar nichts gefunden, was der
 * Aufrufer als „kein Connector-Bezug“ behandelt).
 */
function ownerLookupBlock(lookup: OwnerLookup): string | null {
  switch (lookup.kind) {
    case "ambiguous_owner":
      return "Zu diesem Namen gibt es mehrere Halterinnen. Bitte nennen Sie die Telefonnummer oder den Vornamen.";
    case "unknown_pet":
      return lookup.names.length
        ? `Dieses Tier kenne ich bei dieser Halterin nicht. Hinterlegt sind: ${lookup.names.join(", ")}. Bitte nennen Sie das richtige Tier.`
        : "Dieses Tier kenne ich bei dieser Halterin nicht. Bitte nennen Sie das richtige Tier.";
    case "ambiguous_pet":
      return "Zu diesem Namen gibt es mehrere Tiere. Bitte nennen Sie die Chipnummer oder den vollständigen Namen.";
    case "no_patient":
      return "Bei dieser Halterin ist kein Tier hinterlegt. Bitte die Akte prüfen.";
    // Punkt 9: Ein verstorbenes Tier bekommt keinen Termin.
    case "deceased_only":
      return lookup.names.length === 1
        ? `${lookup.names[0]} ist in der Kartei als verstorben geführt. Bitte die Akte prüfen.`
        : "Diese Tiere sind in der Kartei als verstorben geführt. Bitte die Akte prüfen.";
    // Punkt 11: nicht erreichbar ist kein „kenne ich nicht“.
    case "unavailable":
      return CONNECTOR_UNAVAILABLE;
    case "found":
    case "missing":
      return null;
    default: {
      const never: never = lookup;
      return String(never);
    }
  }
}

/**
 * Punkt 8 — passt ein Vorschlag noch in den Vorlauf?
 *
 * Eigene, testbare Funktion: `advanceBooking` hat keinen injizierbaren
 * Zeitpunkt, deshalb bleibt die Grenze hier direkt pruefbar.
 */
export function slotWithinLead(slotStart: string | undefined, now: number): boolean {
  const start = Date.parse(String(slotStart ?? ""));
  if (!Number.isFinite(start)) return false;
  return start >= now + SLOT_LEAD_MINUTES * 60_000;
}

/**
 * Punkt 8 — der Vorschlag muss auch bei der Bestaetigung noch passen.
 *
 * Ein Vorschlag lebt bis zu 30 Minuten. Wurde er kurz vor Torschluss bestaetigt,
 * lag der Termin inzwischen in der Vergangenheit oder im Vorlauf.
 */
function slotStillInLead(state: BookingState, now: number): boolean {
  return slotWithinLead(state.slotStart, now);
}

/**
 * Punkt 10 — Tierarzt passend zum Termin.
 *
 * Vorher wurde `vets.data[0].id` genommen: der erste Listeneintrag, ohne Bezug
 * zum Termin. Ist der Tierarzt in der freien Zeit nicht verfuegbar, scheitert
 * die Buchung oder landet beim falschen Behandler.
 *
 * Ein Connector-Tierarzt kann eine Ressourcenbindung tragen (`resourceId`).
 * Passt genau einer zur gebuchten Ressource, wird er gewaehlt. Ist die
 * Zuordnung nicht eindeutig, bleibt `vetId` leer — der Anschluss entscheidet,
 * statt dass wir einen falschen Behandler setzen.
 */
export function pickVetForSlot(
  vets: readonly ConnectorVet[],
  resourceId: string | undefined,
): string {
  const wanted = String(resourceId ?? "").trim();
  if (!wanted) return "";
  const bound = vets.filter((vet) => {
    const ref = String((vet as { resourceId?: unknown }).resourceId ?? "").trim();
    return ref === wanted;
  });
  if (bound.length === 1) return bound[0]!.id;
  if (bound.length > 1) return "";
  // Keine Bindung hinterlegt: der erste Eintrag bleibt die beste bekannte
  // Angabe, aber nur wenn es ueberhaupt einen gibt.
  return vets.length > 0 ? vets[0]!.id : "";
}

/**
 * Punkt 14 — Programmname aus dem Anschluss.
 *
 * Die Erfolgsmeldung nannte fest „Vquadrat“. Bei einem anderen Adapter war das
 * schlicht falsch. `adapter.label` traegt den tatsaechlichen Namen.
 */
export function connectorLabelFor(adapter: PraxissoftwarePort): string {
  const label = String((adapter as { label?: unknown }).label ?? "").trim();
  return label || "Praxissoftware";
}

/** Punkt 13: unklaren Ausgang dauerhaft sichern (zusaetzlich zum Arbeitsspeicher). */
async function rememberUncertain(
  guard: BookingGuard | undefined,
  scope: string,
  callId: string,
  slotStart: string | undefined,
): Promise<void> {
  if (!guard) return;
  await guard.remember({ practiceId: scope, callId, slotStart });
}

/** Punkt 13: die Sperre aufheben, wenn der Ausgang geklaert ist. */
async function forgetGuard(
  guard: BookingGuard | undefined,
  scope: string,
  callId: string,
): Promise<void> {
  if (!guard) return;
  await guard.forget({ practiceId: scope, callId });
}

/**
 * Punkte 1 bis 3 — der Buchungsschutz vor jedem Schreibversuch.
 *
 * Rueckgabe `null` heisst: der Weg ist frei.
 */
async function guardBlock(
  params: {
    guard?: BookingGuard;
    scope: string;
    callId: string;
    resolveGuard?: (entry: BookingGuardEntry) => Promise<boolean>;
  },
): Promise<BookingTurnResult | null> {
  if (!params.guard) return null;
  const status = await params.guard.status({ practiceId: params.scope, callId: params.callId });

  if (status.kind === "unavailable") {
    // Punkt 1: Laesst sich der Schutz nicht lesen, ist unbekannt, ob schon ein
    // Termin geschrieben wurde. Dann wird NICHT gebucht.
    return bookingFailure(
      null,
      "Der Buchungsschutz ist derzeit nicht abrufbar. Bitte lassen Sie den Termin von der Tierarzthelferin auf der Tafel eintragen.",
    );
  }
  if (status.kind === "clear") return null;

  // Punkt 3: Eine Sperre darf den Weg zur Aufloesung nicht verschliessen.
  // Der Aufrufer kann pruefen, ob der Ausgang inzwischen belegt ist — etwa
  // durch einen bestaetigten Termin auf der Tafel. Dann faellt die Sperre.
  if (params.resolveGuard && (await params.resolveGuard(status.entry))) {
    await forgetGuard(params.guard, params.scope, params.callId);
    return null;
  }

  const slotStart = status.entry.slotStart || "";
  return {
    text: "Diese Buchung ist noch nicht geklärt – bitte prüfen Sie die Tafel, bevor erneut gebucht wird.",
    actionPatch: { kind: "Termin", summary: "Buchung nicht geklärt", connectorStart: slotStart, connectorApplied: false },
    applied: false,
    failed: true,
    uncertain: true,
  };
}

/**
 * Fuehrt die Zustandsmaschine fuer einen Gespraechs-Turn weiter.
 * Rueckgabe `null` heisst: kein Buchungsversuch/kein Override. Ein fehlgeschlagener
 * Schreibversuch wird dagegen als `failed:true` kenntlich gemacht. Bei einem
 * Transportabbruch bleibt der Ausgang unklar; `uncertain:true` verhindert
 * deshalb einen blinden Wiederholungsversuch.
 * Idempotent pro `callId`: nach `applied: true` ist der Zustand geloescht, ein zweiter
 * Aufruf mit demselben callId beginnt wieder bei "wunsch" (kein doppelter Insert, da der
 * Aufrufer `applied` nur einmal in einen Board-Eintrag uebersetzt).
 */
async function advanceBookingInternal(params: {
  scope: string;
  callId: string;
  adapter: PraxissoftwarePort;
  message: string;
  owner?: string;
  pet?: string;
  phone?: string;
  /** Punkt 10: eine genannte Chipnummer fuer die Tier-Zuordnung. */
  chip?: string;
  requestedDate?: string;
  guard?: BookingGuard;
  /** Punkt 3: prueft, ob ein unklarer Ausgang inzwischen belegt ist. */
  resolveGuard?: (entry: BookingGuardEntry) => Promise<boolean>;
}): Promise<BookingTurnResult | null> {
  const { callId, adapter, message, owner, pet, phone, chip, requestedDate } = params;
  if (!callId) return null;
  const key = stateKey(params.scope, callId);
  let state = getState(key);
  const intent = readMessageIntent(message);
  const effectiveRequestedDate = intent.date ?? requestedDate;

  // Punkt 13: Ein unklarer Ausgang kann auch aus einem frueheren Prozess
  // stammen. Die dauerhafte Sperre zaehlt deshalb mit — nicht nur der
  // Arbeitsspeicher, der bei einem Neustart leer ist.
  // Punkte 1 und 3: nicht pruefbarer Schutz lehnt ab; ein belegter Ausgang
  // loest die Sperre auf.
  const blocked = await guardBlock({
    guard: params.guard,
    scope: params.scope,
    callId,
    resolveGuard: params.resolveGuard,
  });
  if (blocked) return blocked;
  if (state?.uncertain) {
    const slotStart = state?.slotStart ?? "";
    return {
      text: "Die Buchung konnte nicht bestätigt werden – bitte prüfen Sie die Tafel, bevor erneut gebucht wird.",
      actionPatch: { kind: "Termin", summary: "Buchung nicht bestätigt", connectorStart: slotStart, connectorApplied: false },
      applied: false,
      failed: true,
      uncertain: true,
    };
  }

  if (!state) {
    if (intent.dayUnclear || intent.timeMentioned) {
      return bookingFailure(null, "Der gewünschte Zeitraum ist unklar. Bitte nennen Sie einen konkreten Tag und lassen Sie sich einen neuen Vorschlag geben.");
    }
    const found = await findOwnerAndPatient(adapter, { phone, owner, pet, chip });
    // Punkte 2 und 3: Mehrdeutigkeit ergibt eine Rueckfrage statt eines Rates.
    const block = ownerLookupBlock(found);
    if (block) return bookingFailure(null, block);
    const slot = await nextConnectorSlot(adapter, undefined, undefined, effectiveRequestedDate);
    if (slot.kind !== "slot") {
      return bookingFailure(null, slot.kind === "unavailable" ? CONNECTOR_UNAVAILABLE : "Für diesen gewünschten Tag ist kein freier Termin verfügbar.");
    }
    state = {
      step: "vorschlag",
      attempts: 0,
      slotStart: slot.start,
      resourceId: slot.resourceId,
      ownerId: found.kind === "found" ? found.owner.id : undefined,
      patientId: found.kind === "found" ? found.patient.id : undefined,
      requestedDate: effectiveRequestedDate,
      rejected: [],
      spokenPet: pet,
      spokenOwner: owner,
      spokenPhone: phone,
      spokenChip: chip,
      proposedAt: Date.now(),
      expiresAt: 0,
    };
    setState(key, state);
    const label = formatSlot(new Date(slot.start));
    return {
      text: `Ich haette ${label} frei. Soll ich das so eintragen?`,
      actionPatch: { kind: "Termin", summary: `Vorschlag ${label}`, connectorStart: slot.start, connectorApplied: false },
      applied: false,
    };
  }

  if (state.step === "vorschlag") {
    // Punkt 7: Ein ausdrueckliches Abbrechen beendet den Vorgang. Vorher folgte
    // darauf ein weiterer Vorschlag.
    if (isCancel(message)) {
      clearBookingState(callId, params.scope);
      await forgetGuard(params.guard, params.scope, callId);
      return {
        text: "In Ordnung, dann trage ich keinen Termin ein. Melden Sie sich gerne wieder.",
        actionPatch: { kind: "Termin", summary: "Kein Termin gewünscht", connectorStart: state.slotStart!, connectorApplied: false },
        applied: false,
      };
    }
    // Punkt 4: Ein im Vorschlag NEU genannter Tiername muss geprueft werden.
    // Vorher blieb die beim ersten Vorschlag gespeicherte Kennung bestehen.
    const petCorrection = correctionPet(state.spokenPet, pet);
    // Punkt 5: Auch ein geaenderter Haltername oder eine andere Telefonnummer
    // verlangt eine neue Zuordnung. Vorher loeste nur der Tiername sie aus.
    const ownerCorrection = correctionPet(state.spokenOwner, owner);
    const phoneCorrection = correctionPhone(state.spokenPhone, phone);
    // Punkt 10: auch eine (neue) Chipnummer verlangt eine neue Zuordnung.
    const chipCorrection = correctionChip(state.spokenChip, chip);
    const dateCorrection = intent.date !== null;
    const requestedCorrectionDate = intent.date;
    const unclearCorrection = intent.dayUnclear;
    const timeCorrection = intent.timeMentioned;
    if (petCorrection || ownerCorrection || phoneCorrection || chipCorrection || dateCorrection || unclearCorrection || timeCorrection) {
      if (unclearCorrection || timeCorrection) {
        clearBookingState(callId, params.scope);
        return bookingFailure(state.slotStart!, timeCorrection ? "Die gewünschte Uhrzeit ist eine Änderung. Bitte lassen Sie sich einen neuen Vorschlag geben." : "Der gewünschte Zeitraum ist unklar. Bitte lassen Sie sich einen neuen Vorschlag geben.");
      }
      // Punkte 4 und 5: Bei einer Korrektur wird die Zuordnung neu geprueft.
      if (petCorrection || ownerCorrection || phoneCorrection || chipCorrection) {
        const again = await findOwnerAndPatient(adapter, {
          phone: phoneCorrection ?? phone,
          owner: ownerCorrection ?? owner,
          pet: petCorrection ?? state.spokenPet,
          chip: chipCorrection ?? state.spokenChip,
        });
        const block = ownerLookupBlock(again);
        if (block) {
          clearBookingState(callId, params.scope);
          return bookingFailure(state.slotStart!, block);
        }
        state = {
          ...state,
          ownerId: again.kind === "found" ? again.owner.id : state.ownerId,
          patientId: again.kind === "found" ? again.patient.id : state.patientId,
          spokenPet: petCorrection ?? state.spokenPet,
          spokenOwner: ownerCorrection ?? state.spokenOwner,
          spokenPhone: phoneCorrection ?? state.spokenPhone,
          spokenChip: chipCorrection ?? state.spokenChip,
        };
      }
      // Punkt 6: Der gewuenschte Tag bleibt erhalten. Vorher ging er bei einer
      // reinen Tierkorrektur verloren, weil nur die Korrektur weitergereicht
      // wurde. `state.requestedDate` traegt den bisherigen Tag.
      const dayForSearch = requestedCorrectionDate ?? state.requestedDate;
      const slot = await nextConnectorSlot(adapter, rejectedWithCurrent(state), undefined, dayForSearch);
      if (slot.kind !== "slot") {
        clearBookingState(callId, params.scope);
        return bookingFailure(state.slotStart!, slot.kind === "unavailable" ? CONNECTOR_UNAVAILABLE : "Für den gewünschten Tag ist kein freier Termin verfügbar.");
      }
      if (dayForSearch && isoDate(new Date(slot.start)) !== dayForSearch) {
        clearBookingState(callId, params.scope);
        return bookingFailure(state.slotStart!, "Für den gewünschten Tag ist kein freier Termin verfügbar.");
      }
      // Punkt 12: der abgelehnte Vorschlag wandert in die Liste.
      state = {
        ...state,
        slotStart: slot.start,
        resourceId: slot.resourceId,
        requestedDate: requestedCorrectionDate ?? state.requestedDate,
        attempts: state.attempts + 1,
        rejected: appendRejected(state.rejected, state.slotStart),
        proposedAt: Date.now(),
      };
      setState(key, state);
      const label = formatSlot(new Date(slot.start));
      return {
        text: `Verstanden. ${label} wäre frei. Soll ich das so eintragen?`,
        actionPatch: { kind: "Termin", summary: `Vorschlag ${label}`, connectorStart: slot.start, connectorApplied: false },
        applied: false,
      };
    }
    if (isDenial(message)) {
      const slot = await nextConnectorSlot(adapter, rejectedWithCurrent(state), undefined, state.requestedDate);
      if (slot.kind !== "slot") {
        clearBookingState(callId, params.scope);
        return bookingFailure(state.slotStart!, slot.kind === "unavailable" ? CONNECTOR_UNAVAILABLE : "Für den gewünschten Tag ist kein freier Termin verfügbar.");
      }
      state = {
        ...state,
        slotStart: slot.start,
        resourceId: slot.resourceId,
        attempts: state.attempts + 1,
        rejected: appendRejected(state.rejected, state.slotStart),
        proposedAt: Date.now(),
      };
      setState(key, state);
      const label = formatSlot(new Date(slot.start));
      return {
        text: `Verstehe. Wie waere es mit ${label}? Soll ich das so eintragen?`,
        actionPatch: { kind: "Termin", summary: `Vorschlag ${label}`, connectorStart: slot.start, connectorApplied: false },
        applied: false,
      };
    }
    if (!isConfirmation(message)) {
      const label = formatSlot(new Date(state.slotStart!));
      return {
        text: `Soll ich ${label} so eintragen?`,
        actionPatch: { kind: "Termin", summary: `Vorschlag ${label}`, connectorStart: state.slotStart!, connectorApplied: false },
        applied: false,
      };
    }
    // Punkt 8: Der Vorschlag kann bis zu 30 Minuten alt sein. Vor der Buchung
    // muss der Vorlauf noch passen — sonst laege der Termin in der
    // Vergangenheit oder unmittelbar vor jetzt.
    if (!slotStillInLead(state, Date.now())) {
      clearBookingState(callId, params.scope);
      return bookingFailure(
        state.slotStart!,
        "Der Vorschlag ist nicht mehr aktuell. Bitte lassen Sie sich einen neuen Termin vorschlagen.",
      );
    }
    if (!state.ownerId || !state.patientId) {
      // Halterin/Patient nicht im Connector auffindbar -> Connector kann nicht buchen.
      clearBookingState(callId, params.scope);
      return null;
    }
    const vets = await adapter.vets();
    if (!vets.ok) {
      // Transportfehler, kein „keine Tierärzte hinterlegt“: laut machen, damit
      // ein Verbindungsproblem nicht als leere Liste untergeht und still ohne
      // bekannten Behandler gebucht wird.
      console.error("[booking] Tierärzte nicht abrufbar", vets.reason);
    }
    const vetId = pickVetForSlot(vets.ok ? vets.data : [], state.resourceId);
    // Punkt 2: Die Absicht wird gesichert, BEVOR geschrieben wird. Bricht der
    // Prozess dazwischen ab, steht der Eintrag bereits und ein blindes
    // Wiederholen ist ausgeschlossen. Vorher entstand der Eintrag erst NACH
    // einem Fehler — ein Absturz genau im Schreibversuch blieb ungeschuetzt.
    if (params.guard && !(await params.guard.beginWrite({
      practiceId: params.scope,
      callId,
      slotStart: state.slotStart,
    }))) {
      // Punkt 1: Laesst sich die Absicht nicht sichern, wird nicht geschrieben.
      return bookingFailure(
        state.slotStart!,
        "Der Buchungsschutz ist derzeit nicht abrufbar. Bitte lassen Sie den Termin von der Tierarzthelferin auf der Tafel eintragen.",
      );
    }
    let result: Awaited<ReturnType<PraxissoftwarePort["createAppointment"]>>;
    try {
      result = await adapter.createAppointment({
        ownerId: state.ownerId,
        patientId: state.patientId,
        resourceId: state.resourceId!,
        vetId,
        start: state.slotStart!,
        minutes: SLOT_MINUTES,
        reason: pet ? `Termin ${pet}` : undefined,
      });
    } catch {
      setState(key, { ...state, uncertain: true });
      // Punkt 13: der unklare Ausgang wird auch ausserhalb des Prozesses gesichert.
      await rememberUncertain(params.guard, params.scope, callId, state.slotStart);
      return {
        text: "Die Buchung konnte nicht bestätigt werden – bitte prüfen Sie die Tafel, bevor erneut gebucht wird.",
        actionPatch: { kind: "Termin", summary: "Buchung nicht bestätigt", connectorStart: state.slotStart!, connectorApplied: false },
        applied: false,
        failed: true,
        uncertain: true,
      };
    }
    if (result.ok) {
      clearBookingState(callId, params.scope);
      // Punkt 13: der Ausgang ist geklaert, die Sperre faellt.
      await forgetGuard(params.guard, params.scope, callId);
      // Punkt 14: der Name kommt aus dem Anschluss, nicht fest „Vquadrat“.
      const label = connectorLabelFor(adapter);
      return {
        text: `Alles klar, ich habe den Termin eingetragen.`,
        actionPatch: {
          kind: "Termin",
          summary: `in ${label} eingetragen (Nr. ${result.data.id})`,
          connectorStart: state.slotStart!,
          connectorApplied: true,
          connectorAppointmentId: String(result.data.id),
        },
        applied: true,
      };
    }
    if (result.reason === "conflict" && state.attempts < MAX_CONFLICT_RETRIES) {
      const slot = await nextConnectorSlot(adapter, rejectedWithCurrent(state), undefined, state.requestedDate);
      if (slot.kind !== "slot") {
        clearBookingState(callId, params.scope);
        return {
          text: slot.kind === "unavailable" ? CONNECTOR_UNAVAILABLE : "Der Termin konnte nicht eingetragen werden. Bitte lassen Sie ihn von der Tierarzthelferin auf der Tafel eintragen.",
          actionPatch: { kind: "Termin", summary: "Nicht eingetragen", connectorStart: state.slotStart!, connectorApplied: false },
          applied: false,
          failed: true,
        };
      }
      state = {
        ...state,
        slotStart: slot.start,
        resourceId: slot.resourceId,
        attempts: state.attempts + 1,
        // Punkt 12: der vergebene Termin wird gemerkt, damit er nicht erneut
        // vorgeschlagen wird.
        rejected: appendRejected(state.rejected, state.slotStart),
        proposedAt: Date.now(),
      };
      setState(key, state);
      const label = formatSlot(new Date(slot.start));
      return {
        text: `Der Termin ist gerade vergeben worden. ${label} waere frei. Soll ich das so eintragen?`,
        actionPatch: { kind: "Termin", summary: `Vorschlag ${label}`, connectorStart: slot.start, connectorApplied: false },
        applied: false,
      };
    }
    if (result.reason === "error") {
      // HTTP-/Transportfehler werden vom Connector als error zurückgegeben;
      // deshalb kann eine Speicherung bereits erfolgt sein.
      setState(key, { ...state, uncertain: true });
      // Punkt 13: auch dieser unklare Ausgang wird dauerhaft gesichert.
      await rememberUncertain(params.guard, params.scope, callId, state.slotStart);
      return {
        text: "Die Buchung konnte nicht bestätigt werden – bitte prüfen Sie die Tafel, bevor erneut gebucht wird.",
        actionPatch: { kind: "Termin", summary: "Buchung nicht bestätigt", connectorStart: state.slotStart!, connectorApplied: false },
        applied: false,
        failed: true,
        uncertain: true,
      };
    }
    // Explizite Ablehnung durch den Connector: sicher nicht als lokal gebucht darstellen.
    clearBookingState(callId, params.scope);
    // Punkt 13: der Ausgang ist eindeutig, also keine Sperre noetig.
    await forgetGuard(params.guard, params.scope, callId);
    return { text: "Der Termin konnte nicht eingetragen werden. Bitte lassen Sie ihn von der Tierarzthelferin auf der Tafel eintragen.", actionPatch: { kind: "Termin", summary: "Nicht eingetragen", connectorStart: state.slotStart!, connectorApplied: false }, applied: false, failed: true };
  }

  return null;
}

/**
 * Weist parallele Turns desselben Anrufs neutral ab, damit ein Schreibversuch nur einmal läuft.
 *
 * Punkt 1: `scope` ist die Ordination. Der Zustand UND die Parallelsperre
 * gelten je Ordination und Anruf — sonst teilten sich zwei Praxen mit
 * derselben Anrufkennung einen Zustand.
 */
export function advanceBooking(params: {
  scope: string;
  callId: string;
  adapter: PraxissoftwarePort;
  message: string;
  owner?: string;
  pet?: string;
  phone?: string;
  /** Punkt 10: eine genannte Chipnummer fuer die Tier-Zuordnung. */
  chip?: string;
  requestedDate?: string;
  /**
   * Punkt 13: dauerhafte Sperre fuer unklare Ausgaenge. Ohne Angabe gilt der
   * Arbeitsspeicher des Prozesses (bisheriges Verhalten).
   */
  guard?: BookingGuard;
  /** Punkt 3: prueft, ob ein unklarer Ausgang inzwischen belegt ist. */
  resolveGuard?: (entry: BookingGuardEntry) => Promise<boolean>;
}): Promise<BookingTurnResult | null> {
  if (!params.callId) return Promise.resolve(null);
  const key = stateKey(params.scope, params.callId);
  const running = inFlight.get(key);
  if (running) return Promise.resolve(bookingInFlightResult());
  const operation = advanceBookingInternal(params).finally(() => {
    if (inFlight.get(key) === operation) inFlight.delete(key);
  });
  inFlight.set(key, operation);
  return operation;
}
