/**
 * `/api/pms-sync` (AP 45, siehe docs/PLAN_PMS_Bridge.md Abschnitt 4.6). Manueller
 * Anstoß für `syncMasterData()` + `flushOutbox()` — dieselben Bausteine
 * (`bridge/runtime.ts`) wie der Hintergrund-Scheduler (`bridge/scheduler.ts`).
 * Nur die Inhaberin darf das auslösen (Session-Prüfung wie `tafel-backup.ts`/
 * `desk-backup-dump.server.ts`, plus Rollen-Gate wie bei Adresse/Zeiten).
 */
import type { SyncRun } from "./bridge/schema.ts";

export type PmsSyncBuild =
  | { ok: true; master: SyncRun; outbox: SyncRun }
  | { ok: false; error: string; status: number };

export async function runPmsSync(): Promise<PmsSyncBuild> {
  try {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { isInhaberin, INHABERIN_SETTINGS_ERROR } = await import("./staff-role");
    if (!isInhaberin(session.role)) {
      return { ok: false, error: INHABERIN_SETTINGS_ERROR, status: 403 };
    }
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    const { hasPraxissoftwareAdapter } = await import("./praxissoftware");
    if (!profile || !hasPraxissoftwareAdapter(profile.pms)) {
      return { ok: false, error: "Keine Praxissoftware hinterlegt (Einstellungen → Praxissoftware).", status: 400 };
    }
    const { bridgeSyncFor } = await import("./bridge/runtime.ts");
    const { engine } = await bridgeSyncFor(profile.id, profile.pms);
    const master = await engine.syncMasterData();
    const outbox = await engine.flushOutbox();
    return { ok: true, master, outbox };
  } catch (err) {
    if (err instanceof Error && err.name === "UnauthorizedError") {
      return { ok: false, error: "Bitte neu anmelden.", status: 401 };
    }
    return { ok: false, error: "Synchronisierung fehlgeschlagen.", status: 500 };
  }
}

function syncRunJson(run: SyncRun) {
  const stats = { ...run.stats };
  // Externe Halter-/Patienten-IDs gehören nicht in die HTTP-Antwort.
  if (stats.patients && typeof stats.patients === "object") {
    const patientStats = Object.values(stats.patients as Record<string, unknown>);
    stats.patients = { owners: patientStats.length };
  }
  return {
    id: run.id,
    practiceId: run.practiceId,
    pmsKind: run.pmsKind,
    scope: run.scope,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    ok: run.ok,
    stats,
    error: run.error,
  };
}

export function pmsSyncHttpResponse(built: PmsSyncBuild): Response {
  if (!built.ok) {
    return Response.json({ error: built.error }, { status: built.status });
  }
  return Response.json({ master: syncRunJson(built.master), outbox: syncRunJson(built.outbox) }, { status: 200 });
}
