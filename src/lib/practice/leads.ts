import { createServerFn } from "@tanstack/react-start";
import { normalizeEmail } from "./crypto-shared";

export const submitLead = createServerFn({ method: "POST" })
  .validator((input: {
    practice: string;
    contact: string;
    email: string;
    phone?: string;
    bundesland?: string;
    pms?: string;
    message?: string;
    requestId?: string;
  }) => ({
    practice: String(input?.practice ?? "").trim().slice(0, 80),
    contact: String(input?.contact ?? "").trim().slice(0, 80),
    email: normalizeEmail(String(input?.email ?? "")).slice(0, 160),
    phone: String(input?.phone ?? "").trim().slice(0, 32),
    bundesland: String(input?.bundesland ?? "").trim().slice(0, 40),
    pms: String(input?.pms ?? "").trim().slice(0, 40),
    message: String(input?.message ?? "").trim().slice(0, 800),
    requestId: String(input?.requestId ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.practice || !data.contact || !data.email.includes("@")) {
      return { ok: false as const, error: "Bitte Ordination, Name und E-Mail angeben." };
    }
    if (data.requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId)) {
      return { ok: false as const, error: "Anfrage konnte nicht gespeichert werden." };
    }
    const { clientIp } = await import("./session.server");
    const ip = clientIp();
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`lead:${ip}`, 8, 60 * 60 * 1000);
    if (limited) return { ok: false as const, error: limited };
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { newId } = await import("./crypto");
    const id = newId();
    const payloadHash = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const { saveLead } = await import("./lead-storage");
    if (data.requestId) {
      const savedId = await saveLead(sql, { ...data, id, payloadHash });
      return savedId ? { ok: true as const, id: savedId } : { ok: false as const, error: "Anfrage konnte nicht gespeichert werden." };
    }
    await saveLead(sql, { ...data, id });
    return { ok: true as const, id };
  });
