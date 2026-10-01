/**
 * AP 34 — Geführte Ersteinrichtung.
 *
 * Reine Logik, kein Server-Zugriff: erkennt, ob eine Ordination die vier Seiten
 * (Anschrift, Praxissoftware-Übernahme, Stimme, Testanruf) noch braucht, merkt sich
 * den Fortschritt je Ordination im Browser (localStorage) und lässt die Einrichtung
 * jederzeit abbrechen und später an derselben Stelle fortsetzen.
 *
 * Bewusst kein Datenbank-Feld: die Erkennung stützt sich auf ohnehin vorhandene
 * Angaben (Ärzte/Räume noch nie aus der Praxissoftware übernommen), keine Migration.
 */

export const SETUP_WIZARD_STEP_COUNT = 4;

export type SetupWizardStep = 1 | 2 | 3 | 4;

export function isSetupWizardStep(value: number): value is SetupWizardStep {
  return Number.isInteger(value) && value >= 1 && value <= SETUP_WIZARD_STEP_COUNT;
}

/**
 * Noch nicht eingerichtet, solange weder Ärzte noch Räume hinterlegt sind — das ist die
 * eine Übernahme, die eine frische Ordination sonst nie von selbst anstößt. Sobald eine
 * der beiden Listen etwas enthält (übernommen oder von Hand in den Einstellungen
 * eingetragen), gilt die Ersteinrichtung als erledigt.
 */
export function practiceNeedsSetup(profile: { vets?: string | null; resources?: string | null }): boolean {
  const vets = String(profile.vets ?? "").trim();
  const resources = String(profile.resources ?? "").trim();
  return vets === "" && resources === "";
}

function storageKey(prefix: string, practiceId: string) {
  const id = String(practiceId ?? "").trim();
  return id ? `silvia.${prefix}:${id}` : "";
}

export function setupSkipKey(practiceId: string) {
  return storageKey("einrichtung-uebersprungen", practiceId);
}

export function setupStepKey(practiceId: string) {
  return storageKey("einrichtung-schritt", practiceId);
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Abgebrochen/„Später fortsetzen" — die Erinnerung bleibt weg, bis die Seite wieder besucht wird. */
export function readSetupSkipped(store: Store | null, practiceId: string): boolean {
  if (!store) return false;
  const key = setupSkipKey(practiceId);
  if (!key) return false;
  try {
    return store.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeSetupSkipped(store: Store | null, practiceId: string) {
  if (!store) return;
  const key = setupSkipKey(practiceId);
  if (!key) return;
  try {
    store.setItem(key, "1");
  } catch {
    /* private mode */
  }
}

/** Fortschritt merken, damit ein Abbruch mitten in Schritt 3 dort wieder aufmacht. */
export function readSetupStep(store: Store | null, practiceId: string): SetupWizardStep {
  if (!store) return 1;
  const key = setupStepKey(practiceId);
  if (!key) return 1;
  try {
    const raw = Number(store.getItem(key));
    return isSetupWizardStep(raw) ? raw : 1;
  } catch {
    return 1;
  }
}

export function writeSetupStep(store: Store | null, practiceId: string, step: SetupWizardStep) {
  if (!store) return;
  const key = setupStepKey(practiceId);
  if (!key) return;
  try {
    store.setItem(key, String(step));
  } catch {
    /* private mode */
  }
}

/** Fertig gemeldet (Schritt 4 abgeschlossen) räumt Fortschritt und Übersprungen-Merker weg. */
export function clearSetupProgress(store: Store | null, practiceId: string) {
  if (!store) return;
  for (const key of [setupSkipKey(practiceId), setupStepKey(practiceId)]) {
    if (!key) continue;
    try {
      store.removeItem(key);
    } catch {
      /* private mode */
    }
  }
}

/**
 * Schritt 4 abgeschlossen: das Banner darf nicht wiederkommen, selbst wenn ohne
 * Praxissoftware-Anbindung Ärzte/Räume weiterhin leer bleiben (`practiceNeedsSetup`
 * stützt sich nur auf diese beiden Felder). „Fertig" heißt also dasselbe wie
 * „Übersprungen" für das Banner — der Fortschritt (Schritt) wird trotzdem geräumt.
 */
export function markSetupComplete(store: Store | null, practiceId: string) {
  writeSetupSkipped(store, practiceId);
  const key = setupStepKey(practiceId);
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    /* private mode */
  }
}

/** Banner auf der Tafel: nur wenn wirklich nötig, noch nicht weggeklickt, und nur der Inhaberin gezeigt. */
export function setupBannerVisible(input: {
  needsSetup: boolean;
  skipped: boolean;
  isInhaberin: boolean;
}): boolean {
  return input.needsSetup && !input.skipped && input.isInhaberin;
}

export const SETUP_WIZARD_TITLES: Record<SetupWizardStep, string> = {
  1: "Name und Anschrift",
  2: "Ärzte, Räume und Öffnungszeiten",
  3: "Stimme wählen",
  4: "Testanruf",
};
