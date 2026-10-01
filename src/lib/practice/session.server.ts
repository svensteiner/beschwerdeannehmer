import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { getRequestIP } from "@tanstack/react-start/server";
import { resolveClientIp } from "./client-ip";
import { cookieSecureForRequest } from "./cookie-secure";
import { getSql } from "@/lib/db.server";
import { hashToken } from "./crypto";
import { sanitizeStaffRole } from "./staff-role";

export const SESSION_COOKIE = "silvia.session";
const SESSION_DAYS = 30;

export type PracticeSession = {
  userId: string;
  practiceId: string;
  email: string;
  userName: string;
  practiceName: string;
  bundesland: string;
  city: string;
  role: string;
  /**
   * Punkt 20: true, wenn die gespeicherte Rolle unbrauchbar war und deshalb auf
   * die eingeschraenkte Rolle gesetzt wurde. Die Oberflaeche kann das melden.
   */
  roleInvalid?: boolean;
};

type SessionRow = {
  user_id: string;
  practice_id: string;
  email: string;
  user_name: string;
  practice_name: string;
  bundesland: string;
  city: string;
  role: string;
};

export async function readPracticeSession(): Promise<PracticeSession | null> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;
  const sql = await getSql();
  const rows = await sql<SessionRow>`
    select
      u.id as user_id,
      u.practice_id,
      u.email,
      u.name as user_name,
      u.role,
      p.name as practice_name,
      p.bundesland,
      p.city
    from practice_sessions s
    join practice_users u on u.id = s.user_id
    join practices p on p.id = u.practice_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  // Punkt 20: Eine fehlende oder unbekannte Rolle darf NIE zu Inhaberrechten
  // aufwerten. Vorher lautete der Ersatz „inhaberin“ — bei beschaedigtem
  // Datenbestand bekam die Person damit vollen Zugriff. Jetzt wird
  // eingeschraenkt; der Datenfehler ist ueber `roleInvalid` sichtbar.
  const role = sanitizeStaffRole(row.role);
  if (!role) {
    console.error("[session] Unbrauchbare Rolle in practice_users, Zugang eingeschraenkt");
  }
  return {
    userId: row.user_id,
    practiceId: row.practice_id,
    email: row.email,
    userName: row.user_name,
    practiceName: row.practice_name,
    bundesland: row.bundesland,
    city: row.city,
    role: role ?? "kassa",
    roleInvalid: !role,
  };
}

export async function requirePractice(): Promise<PracticeSession> {
  const session = await readPracticeSession();
  if (!session) {
    const err = new Error("Unauthorized");
    err.name = "UnauthorizedError";
    throw err;
  }
  return session;
}

export function writeSessionCookie(token: string): void {
  setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(): void {
  setCookie(SESSION_COOKIE, "", {
    path: "/",
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: 0,
  });
}

function cookieSecure(): boolean {
  const request = getRequest();
  return cookieSecureForRequest(
    request
      ? {
          url: request.url,
          forwardedProto: request.headers.get("x-forwarded-proto"),
        }
      : undefined,
    process.env.SILVIA_TRUST_PROXY_HEADERS === "1",
  );
}

export function clientIp(): string {
  const request = getRequest();
  if (!request) return "unknown";
  const peerIp = getRequestIP({ xForwardedFor: false }) || undefined;
  return resolveClientIp(
    peerIp,
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    process.env.SILVIA_TRUST_PROXY_HEADERS === "1",
  );
}
