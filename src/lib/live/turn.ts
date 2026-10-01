/**
 * Live-Wrapper, Stufe 4: Entscheidung pro Gesprächsrunde (protokollunabhängig).
 *
 * Live hört und spricht; entschieden wird hier, auf unserem Server: Notfall
 * zuerst, dann das Backend (localReply). Nur der geschwärzte Antworttext geht
 * zurück an Live. Der Transport (Sideband-Ereignisse) hängt außen an dieser
 * Funktion und muss gegen die echte API geprüft werden, bevor er produktiv ist.
 */
import { localReply } from "../alma/ask-alma";
import type { Desk } from "../alma/desk";
import type { SilviaAction } from "../alma/actions";
import type { Patient } from "../alma/patients";
import { detectEmergency } from "./emergency";
import { speakableServerReply } from "./prompt";
import { remainingSeconds, type LiveBudget } from "./budget";

export type LiveTurnInput = {
  text: string;
  desk: Desk;
  patients?: Patient[];
  /** Angaben, die Anrufende im Gespräch selbst genannt haben (dürfen zurückgesprochen werden). */
  callerSaid?: string[];
  budget: LiveBudget;
};

export type LiveTurnResult = {
  /** Text, den Live sprechen soll (bereits geschwärzt). */
  speak: string;
  /** true: Gespräch an Praxis oder Notdienst übergeben, keine weitere KI-Führung. */
  handoff: boolean;
  actionType: string;
  emergency: boolean;
  /** Aktion für die Praxistafel (Termin, Rückruf, Notfall); null bei reiner Auskunft/Übergabe ohne Backend. */
  action: SilviaAction | null;
};

const BUDGET_TEXT = "Ich verbinde Sie lieber direkt mit der Praxis, einen Moment bitte.";

export function decideLiveTurn(input: LiveTurnInput): LiveTurnResult {
  // Minutenkonto leer: kein weiteres Live-Gespräch, Mensch übernimmt.
  if (remainingSeconds(input.budget) <= 0) {
    return { speak: BUDGET_TEXT, handoff: true, actionType: "handoff", emergency: false, action: null };
  }
  const emergency = detectEmergency(input.text).emergency;
  const reply = localReply(input.text, input.patients ?? [], "standard", input.desk, false);
  const isEmergency = emergency || reply.action.type === "emergency";
  return {
    speak: speakableServerReply(reply.text, input.callerSaid ?? []),
    handoff: isEmergency,
    actionType: isEmergency ? "emergency" : reply.action.type,
    emergency: isEmergency,
    action: reply.action,
  };
}
