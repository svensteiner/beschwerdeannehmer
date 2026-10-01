/**
 * AP 51: Freitext-Verhalten je Praxis. Die Inhaberin schreibt in eigenen Worten,
 * wie Silvia sich verhalten soll (Tonfall, Tabus, Besonderheiten). Reiner Textblock,
 * eingefügt nach den Fakten im System-Prompt — keine Prompt-Injection-Filterung
 * (das ist bewusste Inhaberin-Eingabe, kein Klientel-Input), nur Kontrollzeichen raus.
 */
// Kontrollzeichen (0x00-0x1F, 0x7F) ausserhalb von Tab/Zeilenumbruch — per Codepoint gebaut,
// damit keine rohen Steuerzeichen im Quelltext stehen.
const CONTROL_CHARS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g",
);

export function behaviorPromptBlock(text?: string | null): string {
  const stripped = String(text ?? "")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, 2000);
  if (!stripped) return "";
  return `Anweisungen der Praxisinhaberin:\n${stripped}`;
}
