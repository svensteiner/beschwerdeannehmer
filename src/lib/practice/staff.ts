import { createServerFn } from "@tanstack/react-start";
import { sanitizeStaffRole, type StaffRow } from "./staff-role";

export async function fetchStaff(practiceId: string, selfId: string): Promise<StaffRow[]> {
  const { getSql } = await import("@/lib/db.server");
  const sql = await getSql();
  const rows = await sql<{ id: string; name: string; email: string; role: string }>`
    select id, name, email, role from practice_users
    where practice_id = ${practiceId}
    order by case when role = 'inhaberin' then 0 else 1 end, name asc
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: sanitizeStaffRole(row.role) ?? "kassa",
    self: row.id === selfId,
  }));
}

export const invitePracticeStaff = createServerFn({ method: "POST" })
  .validator((input: { name?: string; email?: string; password?: string; confirm?: string; role?: string }) => ({
    name: String(input?.name ?? ""),
    email: String(input?.email ?? ""),
    password: String(input?.password ?? ""),
    confirm: String(input?.confirm ?? ""),
    role: String(input?.role ?? ""),
  }))
  .handler(async ({ data }) => {
    const { inviteStaffCheck } = await import("./staff-check");
    const check = inviteStaffCheck(data);
    if (!check.ok) return check;
    const { requirePractice, clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    // Erst die Sitzung, dann das Limit: sonst teilen sich alle Personen
    // derselben Netzwerkadresse ein Limit, und ein einzelner Zugang koennte
    // die Kolleginnen aussperren. Die IP bleibt als grobe Rueckfallsperre.
    const session = await requirePractice();
    const ipLimited = rateLimitError(`staff-ip:${clientIp()}`, 20, 60_000);
    if (ipLimited) return { ok: false as const, error: ipLimited };
    const limited = rateLimitError(`staff:${session.practiceId}:${session.userId}`, 8, 60_000);
    if (limited) return { ok: false as const, error: limited };
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const me = await sql<{ role: string }>`
      select role from practice_users where id = ${session.userId} limit 1
    `;
    if (sanitizeStaffRole(me[0]?.role ?? "") !== "inhaberin") {
      return { ok: false as const, error: "Nur die Inhaberin legt Kolleginnen an." };
    }
    const { hashPasswordAsync, newId } = await import("./crypto");
    const { MAX_STAFF } = await import("./staff-role");
    // Grenze, doppelte E-Mail und Anlegen in EINER Anweisung (Migration 0029).
    // Getrennt konnten zwei gleichzeitige Einladungen die Grenze ueberschreiten
    // oder erst am unique-Index mit unverstaendlicher Meldung scheitern.
    const userId = newId();
    const inserted = await sql<{ status: string }>`
      select invite_practice_staff(
        ${session.practiceId},
        ${userId},
        ${check.name},
        ${check.email},
        ${await hashPasswordAsync(check.password)},
        ${check.role},
        ${MAX_STAFF}
      ) as status
    `;
    const status = inserted[0]?.status;
    if (status === "full") {
      return { ok: false as const, error: `Diese Ordination hat schon ${MAX_STAFF} Zugänge.` };
    }
    if (status === "email_taken") {
      return { ok: false as const, error: "Diese E-Mail ist schon registriert." };
    }
    if (status !== "invited") {
      return { ok: false as const, error: "Die Kollegin konnte nicht angelegt werden." };
    }
    const { recordStaffAction } = await import("./staff-audit");
    const auditLogged = await recordStaffAction(sql, {
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "invited",
      targetId: userId,
      targetEmail: check.email,
    });
    return { ok: true as const, auditLogged };
  });

export const removePracticeStaff = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, error: "Kollegin nicht gefunden." };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    if (data.id === session.userId) {
      return { ok: false as const, error: "Das eigene Konto bleibt. Abmelden geht oben." };
    }
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const me = await sql<{ role: string }>`
      select role from practice_users where id = ${session.userId} limit 1
    `;
    if (sanitizeStaffRole(me[0]?.role ?? "") !== "inhaberin") {
      return { ok: false as const, error: "Nur die Inhaberin entfernt Zugänge." };
    }
    // Pruefen und Loeschen in EINEM Schritt (Migration 0028). Getrennt konnten
    // zwei gleichzeitige Anfragen beide zwei Inhaberinnen sehen und beide
    // loeschen — danach blieb die Ordination ohne Inhaberin.
    const removed = await sql<{ status: string }>`
      select remove_practice_staff(${session.practiceId}, ${data.id}) as status
    `;
    const status = removed[0]?.status;
    if (status === "last_owner") {
      return { ok: false as const, error: "Die letzte Inhaberin bleibt." };
    }
    if (status !== "removed") {
      return { ok: false as const, error: "Kollegin nicht gefunden." };
    }
    const { recordStaffAction } = await import("./staff-audit");
    const auditLogged = await recordStaffAction(sql, {
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "removed",
      targetId: data.id,
    });
    return { ok: true as const, auditLogged };
  });

export const resetPracticeStaffPassword = createServerFn({ method: "POST" })
  .validator((input: { id?: string; password?: string; confirm?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    password: String(input?.password ?? ""),
    confirm: String(input?.confirm ?? ""),
  }))
  .handler(async ({ data }) => {
    const { resetStaffPasswordCheck } = await import("./staff-check");
    const check = resetStaffPasswordCheck(data);
    if (!check.ok) return check;
    const { requirePractice, clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`staff-reset:${clientIp()}`, 8, 60_000);
    if (limited) return { ok: false as const, error: limited };
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    if (check.id === session.userId) {
      return { ok: false as const, error: "Das eigene Passwort ändern Sie unten." };
    }
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const me = await sql<{ role: string }>`
      select role from practice_users where id = ${session.userId} limit 1
    `;
    if (sanitizeStaffRole(me[0]?.role ?? "") !== "inhaberin") {
      return { ok: false as const, error: "Nur die Inhaberin setzt Passwörter der Kolleginnen." };
    }
    const target = await sql<{ id: string; email: string }>`
      select id, email from practice_users
      where id = ${check.id} and practice_id = ${session.practiceId}
      limit 1
    `;
    if (!target[0]) return { ok: false as const, error: "Kollegin nicht gefunden." };
    const { hashPasswordAsync } = await import("./crypto");
    // Passwort und Sitzungswiderruf in EINEM Schritt (Migration 0028). Getrennt
    // konnte ein Fehler zwischen beiden den neuen Hash setzen und die alten
    // Sitzungen der Kollegin stehen lassen.
    const applied = await sql<{ ok: boolean }>`
      select set_practice_password(
        ${check.id},
        ${session.practiceId},
        ${await hashPasswordAsync(check.password)},
        ${null}::text
      ) as ok
    `;
    if (applied[0]?.ok !== true) {
      return { ok: false as const, error: "Das Passwort konnte nicht gesetzt werden." };
    }
    const { recordStaffAction } = await import("./staff-audit");
    const auditLogged = await recordStaffAction(sql, {
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "reset_password",
      targetId: check.id,
      targetEmail: target[0]?.email ?? "",
    });
    return { ok: true as const, auditLogged };
  });
