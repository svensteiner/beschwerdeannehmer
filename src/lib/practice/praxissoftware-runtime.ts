/**
 * Runtime-Fabrik für den `PraxissoftwarePort` (AP 44, siehe
 * docs/PLAN_PMS_Bridge.md Abschnitt 4.6). Baut den BridgeReader (Read-through,
 * `bridge/reader.ts`) über dem echten Adapter (`bridge/adapters.ts`) auf.
 * Aufrufer (`ask-alma.ts`, `praxissoftware-import.ts`) nutzen künftig diese
 * Fabrik statt `vquadratAdapter()` direkt — Bridge-DB wird so transparent
 * vorgeschaltet, ohne dass Alma/Buchung/Tafel etwas davon merken.
 *
 * Operator-Fluchtweg: `SILVIA_PMS_BRIDGE=0` überspringt die Bridge komplett
 * und liefert den nackten Adapter — für den Fall, dass die Bridge-DB selbst
 * Probleme macht und man schnell zurück auf den alten (AP <44) Pfad muss.
 */

import type { Sql } from "@/lib/db";
import { adapterFor } from "./bridge/adapters.ts";
import { bridgeReader } from "./bridge/reader.ts";
import { bridgeRepo } from "./bridge/repo.ts";
import type { PraxissoftwarePort } from "./praxissoftware.ts";

const logged = new Set<string>();
/** Eine Betriebszeile je Praxis und Prozess, ohne PII: welcher Adapter, live oder Stub, Bridge an/aus. */
function logOnce(practiceId: string, adapter: PraxissoftwarePort, env: NodeJS.ProcessEnv) {
  const key = `${practiceId}|${adapter.kind}`;
  if (logged.has(key)) return;
  logged.add(key);
  const live = adapter.kind !== "stub" && Boolean(String(env.SILVIA_PMS_URL ?? "").trim());
  console.info(
    `[bridge] Praxis ${practiceId.slice(0, 8)}… Adapter ${adapter.kind} (${live ? "live" : "Stub"}), Bridge ${bridgeDisabled(env) ? "aus" : "an"}`,
  );
}

function bridgeDisabled(env: NodeJS.ProcessEnv): boolean {
  return String(env.SILVIA_PMS_BRIDGE ?? "").trim() === "0";
}

/**
 * Baut den Port für eine Praxis auf, wie in `ask-alma.ts`/`praxissoftware-import.ts`
 * gebraucht: `practiceId` (Mandant) + `pmsLabel` (Dropdown-Wert aus dem Profil,
 * z. B. "Vquadrat Veterinär"). `env` bleibt injizierbar für Tests.
 */
export async function praxissoftwareRuntime(
  practiceId: string,
  pmsLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PraxissoftwarePort> {
  // Lazy: `@/lib/db` bootet PGLite/pg per Vite-Glob — darf beim reinen Import
  // (Tests, Typprüfung) nicht ausgeführt werden.
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  return praxissoftwareRuntimeWith(sql, practiceId, pmsLabel, env);
}

/** Für Tests: `sql` von außen injizierbar, kein `getSql()`-Serverzwang. */
export function praxissoftwareRuntimeWith(
  sql: Sql,
  practiceId: string,
  pmsLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): PraxissoftwarePort {
  const adapter = adapterFor(pmsLabel, env);
  logOnce(practiceId, adapter, env);
  if (bridgeDisabled(env)) return adapter;

  const scope = { practiceId, pmsKind: adapter.kind };
  return bridgeReader({ repo: bridgeRepo(sql), adapter, scope, log: (m) => console.info(m) });
}
