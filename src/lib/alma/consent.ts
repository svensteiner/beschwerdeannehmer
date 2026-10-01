/** AP 53: Einwilligungsansage. Reiner Helper, keine DB/Netz-Zugriffe. */
export type ConsentDesk = {
  consentEnabled: boolean;
  consentNote?: string;
};

/** Wird nach dem Grüß Gott gesagt, wenn `consentEnabled` und eine Notiz hinterlegt ist. */
export function greetingWithConsent(greeting: string, desk: ConsentDesk): string {
  if (!desk.consentEnabled) return greeting;
  const note = String(desk.consentNote ?? "").trim();
  if (!note) return greeting;
  const withPeriod = /[.!?]$/.test(note) ? note : `${note}.`;
  return `${greeting} ${withPeriod}`;
}
