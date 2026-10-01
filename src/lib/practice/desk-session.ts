/** Marks this browser as a desk that has logged into a practice. */
export const DESK_SESSION_KEY = "silvia.desk";

export const DESK_LOGIN_PATHS = [
  "/sprechen",
  "/app",
  "/app/anrufe",
  "/app/kalender",
  "/app/nachrichten",
  "/app/notfall",
  "/app/akte",
  "/app/einstellungen",
] as const;

const PATH_SET = new Set<string>(DESK_LOGIN_PATHS);
const SEARCH_KEYS = ["d", "a", "p", "c", "t", "m", "e", "q"] as const;

export function deskBrowserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function rememberDeskSession(storage?: Pick<Storage, "setItem"> | null) {
  try {
    storage?.setItem(DESK_SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function forgetDeskSession(storage?: Pick<Storage, "removeItem"> | null) {
  try {
    storage?.removeItem(DESK_SESSION_KEY);
  } catch {
    /* private mode */
  }
}

export function hadDeskSession(storage?: Pick<Storage, "getItem"> | null) {
  try {
    return storage?.getItem(DESK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function cleanDeskSearch(key: string, raw: string) {
  const value = String(raw ?? "").slice(0, 120);
  if (key === "d") return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  if (key === "q") {
    const q = value.replace(/[<>\r\n]/g, "").trim().slice(0, 80);
    return q || undefined;
  }
  const id = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  return id || undefined;
}

/**
 * After an expired desk cookie, only staff Tafel paths — never an open redirect.
 * Unknown query keys are dropped; `d` must be a calendar day.
 */
export function deskLoginNext(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value, "https://desk.silvia.invalid");
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.hash) return undefined;
  if (!PATH_SET.has(url.pathname)) return undefined;
  const next = new URLSearchParams();
  for (const key of SEARCH_KEYS) {
    const item = url.searchParams.get(key);
    if (item == null) continue;
    const cleaned = cleanDeskSearch(key, item);
    if (cleaned) next.set(key, cleaned);
  }
  const qs = next.toString();
  return qs ? `${url.pathname}?${qs}` : url.pathname;
}

export function deskLoginNextFromLocation(location: {
  pathname?: unknown;
  href?: unknown;
  search?: unknown;
}) {
  const href = String(location.href ?? "");
  if (href) {
    try {
      const url = href.includes("://") ? new URL(href) : new URL(href, "https://desk.silvia.invalid");
      const fromHref = deskLoginNext(`${url.pathname}${url.search}`);
      if (fromHref) return fromHref;
    } catch {
      /* pathname + search */
    }
  }
  const path = String(location.pathname ?? "");
  const search = location.search;
  let qs = "";
  if (typeof search === "string") {
    qs = search.replace(/^\?/, "");
  } else if (search && typeof search === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search as Record<string, unknown>)) {
      if (value == null || value === "") continue;
      params.set(key, String(value));
    }
    qs = params.toString();
  }
  return deskLoginNext(qs ? `${path}?${qs}` : path);
}

const LEITUNG_WAIT_RE = /^\/leitung\/([a-z0-9-]{1,80})$/;

/**
 * After Tafel holen apply: staff paths, Anmelden, Registrieren, or the public
 * Leitung — never an open redirect. Login `next` still refuses `/leitung/…`.
 */
export function holenWaitNext(raw: unknown): string {
  const staff = deskLoginNext(raw);
  if (staff) return staff;
  const value = String(raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) {
    return "/app";
  }
  let url: URL;
  try {
    url = new URL(value, "https://desk.silvia.invalid");
  } catch {
    return "/app";
  }
  if (url.username || url.password || url.hash) return "/app";
  if (url.pathname === "/login" || url.pathname === "/registrieren") return url.pathname;
  const slug = LEITUNG_WAIT_RE.exec(url.pathname)?.[1];
  return slug ? `/leitung/${slug}` : "/app";
}
