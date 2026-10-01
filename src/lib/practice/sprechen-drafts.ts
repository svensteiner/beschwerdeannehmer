/** IDs of the last staff `/sprechen` drafts — hrefs are rebuilt from the Tafel, not stored. */
export const LAST_SPRECHEN_DRAFTS_KEY = "silvia.last-sprechen-drafts";

export type SprechenDraftIds = {
  confirmId: string;
  internId: string;
  reachId: string;
  kassaId: string;
};

export function parseSprechenDraftIds(raw: unknown): SprechenDraftIds | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const confirmId = String(v.confirmId ?? "").slice(0, 80);
  const internId = String(v.internId ?? "").slice(0, 80);
  const reachId = String(v.reachId ?? "").slice(0, 80);
  const kassaId = String(v.kassaId ?? "").slice(0, 80);
  if (!confirmId && !internId && !reachId && !kassaId) return null;
  return { confirmId, internId, reachId, kassaId };
}

export function readSprechenDraftIds(storage?: Pick<Storage, "getItem"> | null): SprechenDraftIds | null {
  if (!storage) return null;
  try {
    return parseSprechenDraftIds(JSON.parse(storage.getItem(LAST_SPRECHEN_DRAFTS_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeSprechenDraftIds(
  storage: Pick<Storage, "setItem" | "removeItem"> | null,
  ids: SprechenDraftIds | null,
) {
  if (!storage) return;
  const next = parseSprechenDraftIds(ids);
  if (!next) {
    storage.removeItem(LAST_SPRECHEN_DRAFTS_KEY);
    return;
  }
  storage.setItem(LAST_SPRECHEN_DRAFTS_KEY, JSON.stringify(next));
}

/** Keep the other card when a later persist only returns one draft. */
export function mergeSprechenDraftIds(
  prev: SprechenDraftIds | null,
  patch: { confirmId?: string; internId?: string; reachId?: string; kassaId?: string },
): SprechenDraftIds | null {
  return parseSprechenDraftIds({
    confirmId: patch.confirmId !== undefined ? patch.confirmId : (prev?.confirmId ?? ""),
    internId: patch.internId !== undefined ? patch.internId : (prev?.internId ?? ""),
    reachId: patch.reachId !== undefined ? patch.reachId : (prev?.reachId ?? ""),
    kassaId: patch.kassaId !== undefined ? patch.kassaId : (prev?.kassaId ?? ""),
  });
}

/** New `/sprechen` call: keep Slot/Rückruf for later Handy, drop intern/Kassa. */
export function draftsAfterNewCall(prev: SprechenDraftIds | null): SprechenDraftIds | null {
  if (!prev?.confirmId && !prev?.reachId) return null;
  return parseSprechenDraftIds({
    confirmId: prev.confirmId,
    internId: "",
    reachId: prev.reachId,
    kassaId: "",
  });
}

export function deskDraftStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}
