import { createServerFn } from "@tanstack/react-start";
import { signupWhatsapp } from "@/lib/alma/phone";
import { isStrongEnoughPassword, normalizeEmail, passwordChangeCheck } from "./crypto-shared";
import { holenAuthWaitIfPending, pgliteRegisterBlocked } from "./desk-storage";
import { SIGNUP_HOURS } from "./profile";

async function refuseIfHolenPending() {
  const { isTafelAnzeige } = await import("@/lib/pglite-anzeige");
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { holenPendingIsOpen, holenPendingShouldWait } = await import("@/lib/pglite-holen-pending");
  return holenAuthWaitIfPending(
    holenPendingShouldWait({
      anzeige: isTafelAnzeige(),
      open: holenPendingIsOpen(resolvePgliteDataDir()),
    }),
  );
}

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionView = {
  userId: string;
  practiceId: string;
  email: string;
  userName: string;
  practiceName: string;
  bundesland: string;
  city: string;
  role: string;
};

export const getPracticeSession = createServerFn({ method: "GET" }).handler(async () => {
  const { readPracticeSession } = await import("./session.server");
  return readPracticeSession();
});

export const registerPractice = createServerFn({ method: "POST" })
  .validator((input: {
    practice: string;
    name: string;
    email: string;
    password: string;
    phone?: string;
    whatsapp?: string;
    inbox?: string;
    nachtdienst?: string;
    bundesland?: string;
    city?: string;
    street?: string;
    zip?: string;
    parkplatz?: string;
    pms?: string;
  }) => ({
    practice: String(input?.practice ?? "").trim().slice(0, 80),
    name: String(input?.name ?? "").trim().slice(0, 80),
    email: normalizeEmail(String(input?.email ?? "")).slice(0, 160),
    password: String(input?.password ?? ""),
    phone: String(input?.phone ?? "").trim().slice(0, 32),
    whatsapp: String(input?.whatsapp ?? "").trim().slice(0, 32),
    inbox: String(input?.inbox ?? "").trim().slice(0, 160),
    nachtdienst: String(input?.nachtdienst ?? "").trim().slice(0, 32),
    bundesland: String(input?.bundesland ?? "").trim().slice(0, 40),
    city: String(input?.city ?? "").trim().slice(0, 60),
    street: String(input?.street ?? "").trim().slice(0, 80),
    zip: String(input?.zip ?? "").trim().slice(0, 12),
    parkplatz: String(input?.parkplatz ?? "").trim().slice(0, 400),
    pms: String(input?.pms ?? "").trim().slice(0, 40),
  }))
  .handler(async ({ data }) => {
    if (!data.practice || !data.name || !data.email.includes("@")) {
      return { ok: false as const, error: "Bitte Ordination, Name und eine gültige E-Mail angeben." };
    }
    const { parsePracticeAnreise, parsePracticeLocationHint, parseRegisterPlace } = await import("@/lib/alma/desk");
    const place = parseRegisterPlace({ city: data.city, bundesland: data.bundesland });
    if (!place.ok) return { ok: false as const, error: place.error };
    const anreise = parsePracticeAnreise({ street: data.street, zip: data.zip });
    if (!anreise.ok) return { ok: false as const, error: anreise.error };
    const parkplatz = parsePracticeLocationHint({ hint: data.parkplatz });
    if (!parkplatz.ok) return { ok: false as const, error: parkplatz.error };
    const { parsePracticeInbox, parsePracticeNachtdienst, parsePracticePhone } = await import("@/lib/alma/phone");
    const leitung = parsePracticePhone(data.phone);
    if (!leitung.ok) return { ok: false as const, error: leitung.error };
    const inbox = parsePracticeInbox(data.inbox, data.email);
    if (!inbox.ok) return { ok: false as const, error: inbox.error };
    const night = parsePracticeNachtdienst({ phone: data.nachtdienst });
    if (!night.ok) return { ok: false as const, error: night.error };
    const { clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`register:${clientIp()}`, 8, 60 * 60 * 1000);
    if (limited) return { ok: false as const, error: limited };
    if (!isStrongEnoughPassword(data.password)) {
      return { ok: false as const, error: "Das Passwort braucht mindestens acht Zeichen." };
    }
    const holenWait = await refuseIfHolenPending();
    if (holenWait) return holenWait;
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { dbSource, getSql } = await import("@/lib/db.server");
    const { writeSessionCookie } = await import("./session.server");
    const sql = await getSql();
    const practices = await sql<{ n: number }>`select count(*)::int as n from practices`;
    const second = pgliteRegisterBlocked({
      dbSource,
      practiceCount: Number(practices[0]?.n ?? 0),
    });
    if (second) return { ok: false as const, error: second };
    const existing = await sql<{ id: string }>`
      select id from practice_users where email = ${data.email} limit 1
    `;
    if (existing[0]) {
      return { ok: false as const, error: "Diese E-Mail ist schon registriert. Bitte anmelden." };
    }
    const { hashPasswordAsync, hashToken, newId, newSessionToken } = await import("./crypto");
    const { slugifyPractice } = await import("./slug");
    const practiceId = newId();
    const userId = newId();
    const sessionId = newId();
    const token = newSessionToken();
    // scrypt beanstandet ~50–100 ms CPU. Synchron würde es den Server in dieser
    // Zeit blockieren; die Anfragepfade nutzen deshalb die asynchrone Variante.
    const passwordHash = await hashPasswordAsync(data.password);
    // Praxis, Benutzer und Sitzung entstehen in EINER Transaktion
    // (Migration 0026). Damit kann keine halbe Registrierung stehen bleiben,
    // und zwei gleichzeitige Anfragen koennen nicht beide die Pruefung
    // bestehen — die Funktion prueft E-Mail und Ein-Ordination-Regel innerhalb
    // derselben Sperre.
    const payload = {
      name: data.practice,
      owner_name: data.name,
      phone: leitung.value,
      email: inbox.value,
      bundesland: place.bundesland,
      city: place.city,
      street: anreise.street,
      zip: anreise.zip,
      pms: data.pms,
      whatsapp: signupWhatsapp(leitung.value, data.whatsapp),
      hours_json: JSON.stringify(SIGNUP_HOURS),
      nachtdienst_name: night.name,
      nachtdienst_phone: night.phone,
      nachtdienst_note: "",
      location_hint: parkplatz.hint,
    };
    const inserted = await sql<{ status: string }>`
      select register_practice_atomic(
        ${practiceId},
        ${userId},
        ${sessionId},
        ${JSON.stringify(payload)}::jsonb,
        ${slugifyPractice(data.practice)},
        ${data.email},
        ${passwordHash},
        ${hashToken(token)},
        ${new Date(Date.now() + SESSION_MS).toISOString()},
        ${dbSource === "pglite"}
      ) as status
    `;
    const status = inserted[0]?.status;
    if (status === "second_practice") {
      return { ok: false as const, error: pgliteRegisterBlocked({ dbSource, practiceCount: 1 }) };
    }
    if (status === "email_taken") {
      return { ok: false as const, error: "Diese E-Mail ist schon registriert. Bitte anmelden." };
    }
    if (status !== "created") {
      return { ok: false as const, error: "Die Ordination konnte nicht angelegt werden. Bitte erneut versuchen." };
    }
    writeSessionCookie(token);
    return {
      ok: true as const,
      session: {
        userId,
        practiceId,
        email: data.email,
        userName: data.name,
        practiceName: data.practice,
        bundesland: place.bundesland,
        city: place.city,
        role: "inhaberin",
      } satisfies SessionView,
    };
  });

export const signInPractice = createServerFn({ method: "POST" })
  .validator((input: { email: string; password: string }) => ({
    email: normalizeEmail(String(input?.email ?? "")).slice(0, 160),
    password: String(input?.password ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.email || !data.password) {
      return { ok: false as const, error: "E-Mail und Passwort angeben." };
    }
    const { clientIp } = await import("./session.server");
    const { loginAttemptStart, refundLoginAttempt } = await import("./rate-limit");
    const { MAX_PASSWORD_LENGTH } = await import("./crypto-shared");
    const ip = clientIp();
    // Den Versuch sofort zählen, nicht erst nach den Wartezeiten: sonst
    // bestehen parallele Anfragen alle die Prüfung, bevor der erste
    // Fehlversuch verbucht ist.
    const start = loginAttemptStart(ip, data.email);
    if (!start.allowed) return { ok: false as const, error: start.error, wait: true as const };

    // Ein Passwort über der Registriergrenze kann nie gesetzt worden sein. Es
    // gilt als falsches, die Rechenzeit bleibt aber gleich.
    const tooLong = data.password.length > MAX_PASSWORD_LENGTH;

    try {
      const holenWait = await refuseIfHolenPending();
      if (holenWait) {
        refundLoginAttempt(ip, data.email);
        return holenWait;
      }
      const { getSql } = await import("@/lib/db.server");
      const { writeSessionCookie } = await import("./session.server");
      const {
        hashToken,
        newId,
        newSessionToken,
        verifyPasswordAsync,
        TIMING_EQUALIZER_HASH,
      } = await import("./crypto");
      let sql;
      try {
        sql = await getSql();
      } catch (err) {
        const { isPgliteHeldError } = await import("@/lib/pglite-lock");
        if (isPgliteHeldError(err)) {
          refundLoginAttempt(ip, data.email);
          return { ok: false as const, error: (err as Error).message, held: true as const };
        }
        throw err;
      }
      const rows = await sql<{
        id: string;
        practice_id: string;
        password_hash: string;
        name: string;
        role: string;
        practice_name: string;
        bundesland: string;
        city: string;
      }>`
        select u.id, u.practice_id, u.password_hash, u.name, u.role,
               p.name as practice_name, p.bundesland, p.city
        from practice_users u
        join practices p on p.id = u.practice_id
        where u.email = ${data.email}
        limit 1
      `;
      const user = rows[0];
      // Auch bei unbekannter E-Mail wird gerechnet: sonst antwortet der Server
      // in diesem Fall spürbar schneller und verrät damit, ob eine Adresse
      // registriert ist.
      const passwordOk = await verifyPasswordAsync(
        tooLong ? "" : data.password,
        user?.password_hash ?? TIMING_EQUALIZER_HASH,
      );
      if (!user || tooLong || !passwordOk) {
        return { ok: false as const, error: "E-Mail oder Passwort stimmt nicht." };
      }
      const token = newSessionToken();
      await sql`
        insert into practice_sessions (id, user_id, token_hash, expires_at)
        values (
          ${newId()},
          ${user.id},
          ${hashToken(token)},
          ${new Date(Date.now() + SESSION_MS).toISOString()}
        )
      `;
      writeSessionCookie(token);
      // Eine erfolgreiche Anmeldung belastet das Limit nicht.
      refundLoginAttempt(ip, data.email);
      return {
        ok: true as const,
        session: {
          userId: user.id,
          practiceId: user.practice_id,
          email: data.email,
          userName: user.name,
          practiceName: user.practice_name,
          bundesland: user.bundesland,
          city: user.city,
          role: user.role || "inhaberin",
        } satisfies SessionView,
      };
    } catch (error) {
      // Ein technischer Fehler ist kein Fehlversuch: der Versuch wird
      // zurückgegeben, damit die Anmeldung nicht durch fremde Fehler sperrt.
      refundLoginAttempt(ip, data.email);
      throw error;
    }
  });

/**
 * Abmelden.
 *
 * Das Cookie fällt IMMER. Scheiterte früher das Löschen der Sitzungszeile,
 * blieb die Person angemeldet, obwohl sie abmelden wollte — und ein zweiter
 * Versuch scheiterte genauso.
 */
export const signOutPractice = createServerFn({ method: "POST" }).handler(async () => {
  const { getCookie } = await import("@tanstack/react-start/server");
  const { SESSION_COOKIE, clearSessionCookie } = await import("./session.server");
  const { hashToken } = await import("./crypto");
  const token = getCookie(SESSION_COOKIE);
  try {
    if (token) {
      const { getSql } = await import("@/lib/db.server");
      const sql = await getSql();
      await sql`delete from practice_sessions where token_hash = ${hashToken(token)}`;
    }
  } catch {
    // Die Sitzungszeile bleibt serverseitig liegen und läuft mit der Frist ab.
    // Das lokale Abmelden darf daran nicht scheitern.
  }
  clearSessionCookie();
  return { ok: true as const };
});

export const changePracticePassword = createServerFn({ method: "POST" })
  .validator((input: { current?: string; next?: string; confirm?: string }) => ({
    current: String(input?.current ?? ""),
    next: String(input?.next ?? ""),
    confirm: String(input?.confirm ?? ""),
  }))
  .handler(async ({ data }) => {
    const check = passwordChangeCheck(data.current, data.next, data.confirm);
    if (!check.ok) return check;
    const { requirePractice, clientIp } = await import("./session.server");
    const { rateLimitError } = await import("./rate-limit");
    const limited = rateLimitError(`pw:${clientIp()}`, 8, 60_000);
    if (limited) return { ok: false as const, error: limited };
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("@/lib/db.server");
    const { hashPasswordAsync, hashToken, verifyPasswordAsync } = await import("./crypto");
    const sql = await getSql();
    const rows = await sql<{ password_hash: string }>`
      select password_hash from practice_users where id = ${session.userId} limit 1
    `;
    const stored = rows[0]?.password_hash;
    if (!stored || !(await verifyPasswordAsync(data.current, stored))) {
      return { ok: false as const, error: "Das bisherige Passwort stimmt nicht." };
    }
    const { getCookie } = await import("@tanstack/react-start/server");
    const { SESSION_COOKIE } = await import("./session.server");
    const keep = getCookie(SESSION_COOKIE);
    // Passwort setzen und die uebrigen Sitzungen widerrufen in EINEM Schritt
    // (Migration 0028). Getrennt konnte ein Fehler dazwischen den neuen Hash
    // setzen und die alten Sitzungen bestehen lassen. Die eigene bleibt.
    const applied = await sql<{ ok: boolean }>`
      select set_practice_password(
        ${session.userId},
        ${session.practiceId},
        ${await hashPasswordAsync(data.next)},
        ${keep ? hashToken(keep) : null}::text
      ) as ok
    `;
    if (applied[0]?.ok !== true) {
      return { ok: false as const, error: "Das Passwort konnte nicht geändert werden." };
    }
    const { recordStaffAction } = await import("./staff-audit");
    const auditLogged = await recordStaffAction(sql, {
      practiceId: session.practiceId,
      actorId: session.userId,
      action: "changed_password",
      targetId: session.userId,
      targetEmail: session.email,
    });
    return { ok: true as const, auditLogged };
  });
