/**
 * Eine Begrüßung ist nur dann trainiert, wenn sie ausdrücklich als solche
 * hinterlegt wurde. `trainedFacts` ist im Store bereits absteigend sortiert:
 * der jüngste Eintrag steht daher an Position 0.
 */
const GREETING_RULE = /^bei\s+der\s+begr[üu]ßung\s+sagen\s+sie\s*:\s*(.+)$/i;
const MAX_FACT_LENGTH = 240;

export function trainedGreetingFromFacts(
  facts: readonly string[] = [],
): string | null {
  for (const fact of facts) {
    if (typeof fact !== "string") continue;

    const compact = fact.replace(/\s+/g, " ").trim();
    if (!compact || compact.length > MAX_FACT_LENGTH) continue;

    const match = compact.match(GREETING_RULE);
    const greeting = match?.[1]?.trim();
    if (greeting) return greeting;
  }
  return null;
}
