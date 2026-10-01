import { test } from "node:test";
import { strictEqual, throws, deepStrictEqual } from "node:assert";
import {
  buildLiveAuditRecord,
  assertNoPii,
  type LiveAuditRecord,
} from "./audit.ts";

test("audit: buildLiveAuditRecord happy path", async (t) => {
  await t.test("creates valid frozen record", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 60_000);
    const end = now;

    const record = buildLiveAuditRecord({
      tenantId: "practice-123",
      sessionId: "session-456",
      startedAt: start,
      endedAt: end,
      voiceSeconds: 45,
      closeReason: "completed",
      emergencyHandoff: false,
      toolCalls: ["book", "identity"],
    });

    strictEqual(record.tenantId, "practice-123");
    strictEqual(record.sessionId, "session-456");
    strictEqual(record.voiceSeconds, 45);
    strictEqual(record.closeReason, "completed");
    strictEqual(record.emergencyHandoff, false);
    strictEqual(record.toolCallCount, 2);
    strictEqual(record.schema, 1);
  });

  await t.test("sets region to EU", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: null,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });
    strictEqual(record.region, "EU");
  });

  await t.test("sets audioStored and transcriptStored to false", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: null,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });
    strictEqual(record.audioStored, false);
    strictEqual(record.transcriptStored, false);
  });

  await t.test("calculates durationSeconds", () => {
    const start = new Date("2026-01-01T10:00:00Z");
    const end = new Date("2026-01-01T10:05:30Z");

    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: start,
      endedAt: end,
      voiceSeconds: null,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });

    strictEqual(record.durationSeconds, 330);
  });

  await t.test("freezes the record", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: null,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });

    throws(
      () => {
        (record as any).tenantId = "hacked";
      },
      { name: "TypeError" },
    );
  });
});

test("audit: buildLiveAuditRecord validation", async (t) => {
  const validInput = {
    tenantId: "t1",
    sessionId: "s1",
    startedAt: new Date(),
    endedAt: new Date(),
    voiceSeconds: null,
    closeReason: null,
    emergencyHandoff: false,
    toolCalls: [] as string[],
  };

  await t.test("throws on missing tenantId", () => {
    const input = { ...validInput, tenantId: "" };
    throws(() => buildLiveAuditRecord(input), /tenantId required/);
  });

  await t.test("throws on missing sessionId", () => {
    const input = { ...validInput, sessionId: "" };
    throws(() => buildLiveAuditRecord(input), /sessionId required/);
  });

  await t.test("throws on missing toolCalls array", () => {
    const input = { ...validInput, toolCalls: null as any };
    throws(() => buildLiveAuditRecord(input), /toolCalls required/);
  });
});

test("audit: buildLiveAuditRecord guards against PII", async (t) => {
  const validInput = {
    tenantId: "t1",
    sessionId: "s1",
    startedAt: new Date(),
    endedAt: new Date(),
    voiceSeconds: null,
    closeReason: null,
    emergencyHandoff: false,
    toolCalls: [] as string[],
  };

  await t.test("throws if input contains 'transcript'", () => {
    const input = { ...validInput, transcript: "hello world" } as any;
    throws(
      () => buildLiveAuditRecord(input),
      /PII fields.*transcript/,
    );
  });

  await t.test("throws if input contains 'audio'", () => {
    const input = { ...validInput, audioData: new Uint8Array() } as any;
    throws(
      () => buildLiveAuditRecord(input),
      /PII fields.*audio/,
    );
  });

  await t.test("throws if input contains 'phone'", () => {
    const input = { ...validInput, phoneNumber: "+43123456" } as any;
    throws(
      () => buildLiveAuditRecord(input),
      /PII fields.*phone/,
    );
  });

  await t.test("throws if input contains 'name'", () => {
    const input = { ...validInput, callerName: "John" } as any;
    throws(
      () => buildLiveAuditRecord(input),
      /PII fields/,
    );
  });
});

test("audit: assertNoPii", async (t) => {
  await t.test("accepts clean object", () => {
    assertNoPii({
      tenantId: "t1",
      sessionId: "s1",
      region: "EU",
      schema: 1,
    });
  });

  await t.test("throws on 'transcript' key", () => {
    throws(
      () => assertNoPii({ transcript: "hello" }),
      /PII fields.*transcript/,
    );
  });

  await t.test("throws on 'audio' key (case-insensitive)", () => {
    throws(
      () => assertNoPii({ AudioContent: "xyz" }),
      /PII fields/,
    );
  });

  await t.test("throws on 'text' key", () => {
    throws(
      () => assertNoPii({ text: "content" }),
      /PII fields.*text/,
    );
  });

  await t.test("throws on 'email' key", () => {
    throws(
      () => assertNoPii({ email: "test@example.com" }),
      /PII fields.*email/,
    );
  });

  await t.test("throws on 'address' key", () => {
    throws(
      () => assertNoPii({ address: "Main St" }),
      /PII fields.*address/,
    );
  });
});

test("audit: edge cases", async (t) => {
  await t.test("handles null voiceSeconds", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: null,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });
    strictEqual(record.voiceSeconds, null);
  });

  await t.test("handles null closeReason", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: 30,
      closeReason: null,
      emergencyHandoff: false,
      toolCalls: [],
    });
    strictEqual(record.closeReason, null);
  });

  await t.test("handles empty toolCalls array", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: 0,
      closeReason: "silent",
      emergencyHandoff: false,
      toolCalls: [],
    });
    strictEqual(record.toolCallCount, 0);
  });

  await t.test("converts dates to ISO strings", () => {
    const start = new Date("2026-01-15T14:30:00Z");
    const end = new Date("2026-01-15T14:35:00Z");

    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: start,
      endedAt: end,
      voiceSeconds: 300,
      closeReason: "completed",
      emergencyHandoff: true,
      toolCalls: ["book"],
    });

    strictEqual(record.startedAt, "2026-01-15T14:30:00.000Z");
    strictEqual(record.endedAt, "2026-01-15T14:35:00.000Z");
    strictEqual(record.emergencyHandoff, true);
  });

  await t.test("counts multiple toolCalls", () => {
    const record = buildLiveAuditRecord({
      tenantId: "t1",
      sessionId: "s1",
      startedAt: new Date(),
      endedAt: new Date(),
      voiceSeconds: 120,
      closeReason: "completed",
      emergencyHandoff: false,
      toolCalls: ["book", "identity", "nachtdienst", "connect"],
    });
    strictEqual(record.toolCallCount, 4);
  });
});
