/**
 * Live-Wrapper, Stufe 3: Stimmen-Stufe je Praxis.
 *
 * Live (GPT-Live-1) ist die Hauptstimme. Die günstigere Variante ("budget",
 * lokale Stimme auf dem eigenen Server) wird als Paket mitangeboten und ist
 * zugleich der automatische Rückfall, sobald Live nicht sicher freigegeben ist.
 * Die Sprachschicht bleibt austauschbar: die Wahl fällt hier, nirgends sonst.
 */
import { canStartSession, type LiveBudget } from "./budget";
import type { LivePolicy } from "./policy";

export type VoiceTier = "live" | "budget";
export type TierReason = "plan_budget" | "policy_blocked" | "minutes_exhausted" | "provider_down" | "ok";

export type TierChoice = { tier: VoiceTier; reason: TierReason };

export function chooseVoiceTier(input: {
  /** Was die Praxis gebucht hat. */
  plan: VoiceTier;
  policy: LivePolicy;
  budget: LiveBudget;
  /** Nach wiederholten Live-Fehlern (z. B. SIP/Provider) gesetzt. */
  providerDown?: boolean;
}): TierChoice {
  if (input.plan === "budget") return { tier: "budget", reason: "plan_budget" };
  if (!input.policy.ok) return { tier: "budget", reason: "policy_blocked" };
  if (input.providerDown) return { tier: "budget", reason: "provider_down" };
  if (!canStartSession(input.budget).ok) return { tier: "budget", reason: "minutes_exhausted" };
  return { tier: "live", reason: "ok" };
}
