/**
 * Gemeinsamer Aufbau für alles, was einen `SyncEngine` für eine Praxis braucht
 * (AP 45, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.6): die API-Route
 * `routes/api/pms-sync.ts` und der Hintergrund-Scheduler (`bridge/scheduler.ts`)
 * teilen sich diesen Aufbau statt ihn zu duplizieren.
 *
 * Lazy: `@/lib/db` bootet PGLite/pg — darf beim reinen Import (Tests, Typprüfung)
 * nicht ausgeführt werden, deshalb kein Top-Level-Import hier.
 */
import type { Sql } from "@/lib/db";
import { adapterFor } from "./adapters.ts";
import { bridgeRepo, type BridgeRepo, type Scope } from "./repo.ts";
import { syncEngine, type SyncEngine } from "./sync.ts";

export function bridgeSyncForWith(
  sql: Sql,
  practiceId: string,
  pmsLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): { engine: SyncEngine; scope: Scope; repo: BridgeRepo } {
  const adapter = adapterFor(pmsLabel, env);
  const scope: Scope = { practiceId, pmsKind: adapter.kind };
  const repo = bridgeRepo(sql);
  const engine = syncEngine({ repo, adapter, scope });
  return { engine, scope, repo };
}

export async function bridgeSyncFor(
  practiceId: string,
  pmsLabel: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ engine: SyncEngine; scope: Scope }> {
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  return bridgeSyncForWith(sql, practiceId, pmsLabel, env);
}
