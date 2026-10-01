/**
 * AP 57: Server-Fn für den Hör-Check im Training. Nur eine angemeldete
 * Ordination darf kurze Wortkorrekturen speichern; sie bleiben damit getrennt
 * von Demos und anderen Ordinationen. Wirft nie.
 */
import { createServerFn } from "@tanstack/react-start";
import { HOER_LOG_CAP, isMeaningfulCorrection } from "./hoer-log-shared.ts";
import { speechPracticeId } from "./speech-scope.ts";

export const MAX_HOER_KORREKTUR_LEN = 40;

type HoerKorrekturInput = {
  heard: string;
  corrected: string;
  demo: boolean;
  requestId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Reject rather than alter a correction: a shortened medical term is wrong data. */
export function validateHoerKorrekturInput(input: unknown): HoerKorrekturInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (typeof value.heard !== "string" || typeof value.corrected !== "string") return null;
  if (value.heard.length > MAX_HOER_KORREKTUR_LEN || value.corrected.length > MAX_HOER_KORREKTUR_LEN) return null;
  if (!value.heard.trim() || !value.corrected.trim()) return null;
  if (value.requestId != null && typeof value.requestId !== "string") return null;
  const requestId = value.requestId?.trim() || undefined;
  if (requestId && !UUID_PATTERN.test(requestId)) return null;
  return {
    demo: value.demo === true,
    heard: value.heard,
    corrected: value.corrected,
    requestId,
  };
}

export const reportHoerKorrektur = createServerFn({ method: "POST" })
  .validator(validateHoerKorrekturInput)
  .handler(async ({ data }) => {
    try {
      if (!data) {
        return { ok: false as const };
      }
      if (!isMeaningfulCorrection(data.heard, data.corrected)) {
        return { ok: false as const };
      }
      const { readPracticeSession } = await import("@/lib/practice/session.server");
      const session = await readPracticeSession().catch(() => null);
      const practiceId = speechPracticeId(data.demo, session?.practiceId);
      if (!practiceId) return { ok: false as const };
      const { getSql } = await import("@/lib/db.server");
      const { hoerLogPath, importLegacyHoerKorrekturen, saveHoerKorrektur } = await import("./hoer-log.ts");
      const sql = await getSql();
      await importLegacyHoerKorrekturen(sql, hoerLogPath());
      const saved = await saveHoerKorrektur(
        sql,
        {
          ts: new Date().toISOString(),
          heard: data.heard,
          corrected: data.corrected,
          practiceId,
          requestId: data.requestId || undefined,
        },
      );
      if (!saved) {
        const rows = await sql.query<{ count: number }>(
          "select count(*)::int as count from hoer_corrections where practice_id = $1",
          [practiceId],
        );
        return rows[0]?.count >= HOER_LOG_CAP
          ? { ok: false as const, reason: "capacity" as const }
          : { ok: false as const };
      }
      const { clearSttCorrectionCache } = await import("./llm-runtime.ts");
      clearSttCorrectionCache(practiceId);
      return { ok: true as const };
    } catch (error) {
      return error instanceof Error && error.message.includes("Grenze von 2000")
        ? { ok: false as const, reason: "capacity" as const }
        : { ok: false as const };
    }
  });
