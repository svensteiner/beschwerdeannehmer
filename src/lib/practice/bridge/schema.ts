/**
 * Bridge-DB — TS-Typen der `pms_*`-Zeilen und ein paar reine Hilfsfunktionen
 * (AP 42, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.2/4.3). Keine DB-Zugriffe
 * hier — die liegen in `repo.ts`.
 *
 * `Scope.pmsKind` ist bewusst `string` (nicht `PraxissoftwareKind` aus
 * `praxissoftware.ts`), um nicht von der Erweiterung des Kind-Literals durch
 * AP 41 (parallel laufender Agent, `registry.ts`) abhängig zu sein. Sobald
 * `PraxissoftwareKind` mehrere Werte kennt, kann dieses Feld verschärft werden.
 */

import { createHash } from "node:crypto";

/** Mandant + Adapter — Präfix für jede Bridge-Abfrage. */
export type Scope = { practiceId: string; pmsKind: string };

/** Read-Ergebnis mit Cache-Alter, wie im Plan (4.5) für den BridgeReader gebraucht. */
export type BridgeHit<T> =
  | { hit: true; data: T; syncedAt: Date }
  | { hit: false };

export type OutboxStatus = "pending" | "processing" | "sent" | "conflict" | "forbidden" | "failed";

export type OutboxRow = {
  id: string;
  practiceId: string;
  pmsKind: string;
  kind: "appointment";
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  result: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Besitzer der laufenden Reservierung (`processing`).
   *
   * `claim_pms_outbox` setzt beim Reservieren diese Kennung. `mark_pms_outbox`
   * schreibt nur, wenn sie noch dieselbe ist — sonst überschreibt ein langsamer
   * Prozess das Ergebnis eines neueren Laufs.
   */
  leaseOwner?: string | null;
};

export type SyncScope = "master" | "owner" | "outbox";

export type SyncRun = {
  id: string;
  practiceId: string;
  pmsKind: string;
  scope: SyncScope;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  stats: Record<string, unknown>;
  error: string | null;
};

export type Counts = { inserted: number; updated: number; unchanged: number };

/**
 * Stabiler SHA-256-Hash über `obj`, mit rekursiv nach Schlüssel sortierten
 * Objekten — Feldreihenfolge in Connector-Antworten darf sich nicht auf den
 * Hash auswirken. `undefined`-Werte werden wie in `JSON.stringify` behandelt
 * (ausgelassen).
 */
export function canonicalHash(obj: unknown): string {
  const json = JSON.stringify(sortKeysDeep(obj));
  return createHash("sha256").update(json).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, val] of entries) sorted[key] = sortKeysDeep(val);
    return sorted;
  }
  return value;
}

/**
 * Nur Ziffern. Führende "00" (internationaler Präfix) wird entfernt, eine
 * führende einzelne "0" (österreichische Inlandsschreibweise) durch "43"
 * ersetzt. Kein Ländercode-Raten darüber hinaus — bewusst konservativ.
 */
export function normalizePhone(s: string): string {
  const digits = String(s ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `43${digits.slice(1)}`;
  return digits;
}

/** Letzte 9 Ziffern — Basis für den Suffix-Vergleich verschiedener Vorwahlschreibweisen. */
export function phoneSuffix(s: string): string {
  const norm = normalizePhone(s);
  return norm.slice(-9);
}

/**
 * Suchtext fuer LIKE/ILIKE woertlich machen.
 *
 * `%` und `_` sind Platzhalter: ohne Maskierung liefert die Suche nach „%“ den
 * ganzen Bestand, und „_“ trifft beliebige Zeichen. Der Backslash muss ZUERST
 * maskiert werden, sonst zerstoert er die eigene Maskierung.
 *
 * Gehoert zusammen mit `escape '\'` in der Abfrage.
 */
export function escapeLikeNeedle(raw: string, maxLength = 80): string {
  return String(raw ?? "")
    .trim()
    .slice(0, maxLength)
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Obergrenze einer Haltersuche — ohne sie laedt eine breite Suche den ganzen Bestand. */
export const OWNER_SEARCH_LIMIT = 25;
