export const TRAINED_FACTS_DB = "alma-trained-facts";
const STORE = "facts";
const KEY = "current";
const CHANNEL = "alma-trained-facts";

type RecordValue = { key: string; facts: string[] };
export type FactsResult = { ok: true; facts: string[] } | { ok: false };

let channel: BroadcastChannel | null | undefined;
function getChannel() {
  if (channel !== undefined) return channel;
  try { channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL); } catch { channel = null; }
  return channel;
}

export function announceTrainedFactsChange() {
  try { getChannel()?.postMessage("changed"); } catch { /* Speicherung bleibt trotzdem erfolgreich. */ }
}
export function onTrainedFactsChange(callback: () => void) {
  const current = getChannel();
  if (!current) return () => {};
  const listener = () => callback();
  current.addEventListener("message", listener);
  return () => current.removeEventListener("message", listener);
}

function available() {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!available()) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    let blocked = false;
    try { request = indexedDB.open(TRAINED_FACTS_DB, 1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      resolve(request.result);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => { blocked = true; resolve(null); };
  });
}

function validFacts(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 40 || value.some((fact) => typeof fact !== "string" || fact.trim().length < 8 || fact.length > 240)) return null;
  return [...value];
}

function withCurrentRecord(
  db: IDBDatabase,
  legacyFacts: string[] | null,
  mutate?: (facts: string[]) => string[] | null,
): Promise<RecordValue | null> {
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(STORE, "readwrite"); } catch { resolve(null); return; }
    let result: RecordValue | null = null;
    const store = tx.objectStore(STORE);
    const get = store.get(KEY);
    get.onsuccess = () => {
      const existing = get.result as RecordValue | undefined;
      const facts = existing ? validFacts(existing.facts) : legacyFacts;
      if (!facts) { try { tx.abort(); } catch { /* Abbruch ist nur best effort. */ } return; }
      const next = mutate ? mutate(facts) : facts;
      if (!next || !validFacts(next)) { try { tx.abort(); } catch { /* Abbruch ist nur best effort. */ } return; }
      result = { key: KEY, facts: [...next] };
      if (!existing || mutate) store.put(result);
    };
    get.onerror = () => { try { tx.abort(); } catch { /* Abbruch ist nur best effort. */ } };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => resolve(null);
  });
}

/** Existing DB record wins, including an intentionally empty fact list. */
export async function initializeTrainedFacts(legacyFacts: unknown): Promise<FactsResult> {
  const db = await openDb();
  if (!db) return { ok: false };
  try {
    const record = await withCurrentRecord(db, validFacts(legacyFacts));
    return record ? { ok: true, facts: record.facts } : { ok: false };
  } finally { db.close(); }
}

export async function mutateTrainedFacts(
  mutate: (facts: string[]) => string[] | null,
): Promise<FactsResult> {
  const db = await openDb();
  if (!db) return { ok: false };
  try {
    const record = await withCurrentRecord(db, null, mutate);
    if (!record) return { ok: false };
    return { ok: true, facts: record.facts };
  } finally { db.close(); }
}
