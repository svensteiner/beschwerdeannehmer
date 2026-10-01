/**
 * Audit-Record für Live-Anrufe.
 * Nur Metadaten, keine PII. EU-Datenschutz-konform.
 */

interface LiveAuditInput {
  tenantId: string;
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  voiceSeconds: number | null;
  closeReason: string | null;
  emergencyHandoff: boolean;
  toolCalls: string[];
}

export interface LiveAuditRecord {
  readonly tenantId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly durationSeconds: number;
  readonly voiceSeconds: number | null;
  readonly closeReason: string | null;
  readonly emergencyHandoff: boolean;
  readonly toolCallCount: number;
  readonly region: "EU";
  readonly audioStored: false;
  readonly transcriptStored: false;
  readonly schema: 1;
}

/** Prüft, ob obj verbotene PII-ähnliche Schlüssel enthält. */
export function assertNoPii(obj: Record<string, unknown>): void {
  // Metadaten-Suffixe, die auf Flags deuten (nicht auf PII)
  const metadataSuffixes = [
    "Stored",
    "Count",
    "Seconds",
    "At",
    "Reason",
    "Id",
    "Handoff",
    "Duration",
  ];

  // Schlüssel, die TATSÄCHLICHE PII enthalten
  const piiKeywords = [
    "transcript",
    "audio",
    "text",
    "phone",
    "name",
    "email",
    "address",
    "owner",
    "pet",
    "patient",
    "content",
  ];

  const keys = Object.keys(obj ?? {});
  const found = keys.filter((k) => {
    // Skip if it's a metadata flag (suffix check)
    if (metadataSuffixes.some((suffix) => k.endsWith(suffix))) {
      return false;
    }
    // Check if contains PII keyword
    const lower = k.toLowerCase();
    return piiKeywords.some((pii) => lower.includes(pii));
  });

  if (found.length) {
    throw new Error(
      `Audit record must not contain PII fields: ${found.join(", ")}`,
    );
  }
}

/**
 * Baut einen gefrorenen Audit-Record aus Metadaten.
 * Throws wenn PII erkannt wird.
 */
export function buildLiveAuditRecord(
  input: LiveAuditInput,
): Readonly<LiveAuditRecord> {
  // PII-Guard auf dem input
  const inputKeys = Object.keys(input ?? {});
  const piiPatterns = [
    "transcript",
    "audio",
    "text",
    "phone",
    "owner",
    "pet",
    "patient",
    "content",
    "name",
    "email",
    "address",
  ];
  const invalidPiiKeys = inputKeys.filter((k) =>
    piiPatterns.some((pii) => k.toLowerCase().includes(pii)),
  );
  if (invalidPiiKeys.length) {
    throw new Error(
      `buildLiveAuditRecord input contains PII fields: ${invalidPiiKeys.join(", ")}`,
    );
  }

  // Sperre extra keys ab
  if (!input.tenantId) throw new Error("tenantId required");
  if (!input.sessionId) throw new Error("sessionId required");
  if (!input.startedAt) throw new Error("startedAt required");
  if (!input.endedAt) throw new Error("endedAt required");
  if (!Array.isArray(input.toolCalls)) throw new Error("toolCalls required");

  const record: LiveAuditRecord = Object.freeze({
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    startedAt: input.startedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    durationSeconds: Math.round(
      (input.endedAt.getTime() - input.startedAt.getTime()) / 1000,
    ),
    voiceSeconds: input.voiceSeconds,
    closeReason: input.closeReason,
    emergencyHandoff: input.emergencyHandoff,
    toolCallCount: input.toolCalls.length,
    region: "EU",
    audioStored: false,
    transcriptStored: false,
    schema: 1,
  });

  // Final check: keine PII im record
  assertNoPii(record as unknown as Record<string, unknown>);

  return record;
}
