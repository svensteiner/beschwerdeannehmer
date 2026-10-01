export type HoerCorrectionInput = {
  heard: string;
  corrected: string;
  requestId?: string;
};

/** Signature used only in the browser to keep a retry tied to one UI event. */
export function hoerCorrectionSignature(input: HoerCorrectionInput & {
  lineId: string;
  callGeneration: number;
}): string {
  return JSON.stringify([
    input.callGeneration,
    input.lineId,
    input.heard,
    input.corrected,
  ]);
}

export function requestIdForSignature(
  previous: { signature: string; requestId: string } | null,
  signature: string,
  randomUuid: () => string,
): { signature: string; requestId: string } {
  if (previous?.signature === signature) return previous;
  return { signature, requestId: randomUuid() };
}

export function normalizeHeardForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function needsHoerCorrection(
  heard: string | null | undefined,
  corrected: string,
): boolean {
  return Boolean(
    heard &&
      heard.length <= 40 &&
      corrected.length <= 40 &&
      normalizeHeardForCompare(heard) !== normalizeHeardForCompare(corrected),
  );
}

export async function reportHoerCorrectionSafely(
  report: (input: HoerCorrectionInput) => Promise<{ ok: boolean; reason?: "capacity" }>,
  input: HoerCorrectionInput,
): Promise<{ ok: boolean; reason?: "capacity" }> {
  try {
    const result = await report(input);
    return result.ok === true ? { ok: true } : result;
  } catch {
    return { ok: false };
  }
}
