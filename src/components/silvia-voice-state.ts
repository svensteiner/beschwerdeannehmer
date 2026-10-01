/**
 * Zustandsautomat fuer den Hoerproben-Knopf (HearSilvia).
 *
 * Warum getrennt: Der Knopf hing seinen "Pause"-Zustand bisher an das
 * aufgeloeste `audio.play()`-Promise. Bei der vorbereiteten WAV-Datei
 * (`silvia-live-marin.wav`) loest das erst nach Netzwerk und Dekodierung auf,
 * deshalb blieb der Knopf so lange auf "Marin anhoeren". Der Browseraudit sah
 * genau diesen verzoegerten Wechsel auf "Pause".
 *
 * Der Automat kapselt zwei Regeln:
 * 1. Der Klick schaltet sofort sichtbar auf "Pause"; erst ein echter
 *    Audiofehler oder das Ende der Wiedergabe schaltet zurueck.
 * 2. Meldet sich eine bereits abgeloeste Probe (der Nutzer hat inzwischen
 *    erneut geklickt), bleibt der sichtbare Zustand unveraendert.
 *
 * Die Anforderungs-ID wird bewusst vom Aufrufer vergeben (hier:
 * `beginAudioPreview()`), damit Knopf und Audiokoordination dieselbe Zahl
 * verwenden und keine zweite Zaehlung auseinanderlaufen kann.
 */

export type HearSilviaAction =
  | { readonly type: "press"; readonly requestId: number }
  | { readonly type: "stop"; readonly requestId: number }
  | { readonly type: "playing"; readonly requestId: number }
  /** `reason` trennt einen echten Tonfehler vom normalen Ende der Wiedergabe. */
  | { readonly type: "failed"; readonly requestId: number; readonly reason?: "error" | "ended" };

export interface HearSilviaState {
  /** Der Knopf zeigt "Pause". */
  readonly on: boolean;
  /** Die Anforderung, auf die sich der sichtbare Zustand bezieht. */
  readonly requestId: number;
  /** Der Klick hat die Wiedergabe angefordert, sie ist aber noch nicht bestaetigt. */
  readonly pending: boolean;
  /**
   * Die Tonquelle liess sich nicht laden oder abspielen. Wird sichtbar
   * gemeldet, damit nicht nur der Knopf zurueckspringt und der Nutzer raet,
   * warum nichts zu hoeren ist.
   */
  readonly failed: boolean;
}

export const INITIAL_HEAR_STATE: HearSilviaState = {
  on: false,
  requestId: 0,
  pending: false,
  failed: false,
};

/** Eine Antwort gehoert nur zur juengsten Anforderung. */
function isCurrent(state: HearSilviaState, requestId: number): boolean {
  return state.requestId === requestId;
}

export function hearSilviaReduce(
  state: HearSilviaState,
  action: HearSilviaAction,
): HearSilviaState {
  switch (action.type) {
    case "press":
      // Sofort sichtbar: "Pause", noch bevor audio.play() aufloest.
      // Ein neuer Versuch loescht die vorige Fehlermeldung.
      return { on: true, requestId: action.requestId, pending: true, failed: false };
    case "playing":
      // Bestaetigte Wiedergabe; eine abgeloeste Anforderung aendert nichts mehr.
      return isCurrent(state, action.requestId) ? { ...state, pending: false, failed: false } : state;
    case "failed":
      // Ein echter Fehler oder das Ende schaltet zurueck - nur fuer die
      // juengste Anforderung, nicht fuer eine ueberholte Probe.
      return isCurrent(state, action.requestId)
        ? { on: false, requestId: state.requestId, pending: false, failed: action.reason === "error" }
        : state;
    case "stop":
      // Der Stopp gehoert immer zu einer neuen, juengeren Anforderung und ist
      // kein Fehler.
      return { on: false, requestId: action.requestId, pending: false, failed: false };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Eine Antwort gilt nur, solange ihre Anforderung die aktuelle ist. */
export function isCurrentHearRequest(
  state: HearSilviaState,
  requestId: number,
): boolean {
  return isCurrent(state, requestId);
}
