/** Why the live line could not turn speech into text. Client-safe — no Buffer. */
export type SttFailReason =
  | "no-speech"
  | "not-allowed"
  | "missing"
  | "rate"
  | "empty"
  | "quiet"
  | "network"
  | "error";

export const STT_FAIL_TOAST_ID = "sprechen-stt-fail";
/** Clientseitige Obergrenze zusätzlich zum serverseitigen STT-Timeout. */
export const STT_CLIENT_TIMEOUT_MS = 35_000;
/** Web Speech may use a browser/vendor service; never send practice audio there. */
const TOAST: Record<SttFailReason, string> = {
  "no-speech": "Nichts gehört. Nochmal sprechen oder hier tippen.",
  "not-allowed": "Mikrofon gesperrt. Bitte tippen, oder Mikrofon erlauben.",
  missing: "Spracherkennung ist derzeit nicht verfügbar. Bitte tippen Sie Ihre Nachricht ein.",
  rate: "Zu viele Transkriptionen. Kurz warten oder hier tippen.",
  empty: "Stimme nicht erkannt. Nochmal sprechen oder hier tippen.",
  quiet: "Zu leise. Näher ans Mikrofon oder hier tippen.",
  network: "Spracherkennung ohne Netz. Bitte tippen.",
  error: "Stimme nicht erkannt. Bitte tippen.",
};

export function sttFailToast(reason: SttFailReason) {
  return TOAST[reason];
}

/** Übersetzt Browser-Fehlercodes für weiterhin unterstützte STT-Hilfsfunktionen. */
export function sttBrowserError(error: string): SttFailReason | null {
  const code = String(error ?? "").trim().toLowerCase();
  if (!code || code === "aborted") return null;
  if (code === "not-allowed" || code === "service-not-allowed") return "not-allowed";
  if (code === "no-speech") return "no-speech";
  if (code === "network") return "network";
  return "error";
}

export function sttFailFromTranscribe(res: { ok?: boolean; text?: string; reason?: string }): SttFailReason {
  if (res.ok && String(res.text ?? "").trim()) return "error";
  const reason = String(res.reason ?? "").trim();
  if (reason === "missing" || reason === "rate" || reason === "empty" || reason === "quiet" || reason === "error") {
    return reason;
  }
  return "error";
}
