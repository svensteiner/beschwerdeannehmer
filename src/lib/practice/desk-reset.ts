import { TAFEL_ANZEIGE_ERROR } from "./tafel-anzeige.ts";

/** One-time password code on the Praxis-PC — no SMTP. */
export const DESK_RESET_FILE = "silvia-passwort.txt";
export const DESK_RESET_MS = 30 * 60 * 1000;
export const DESK_RESET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DESK_RESET_ANZEIGE_ID = "desk-reset-anzeige";
export const DESK_RESET_HINT_ID = "login-reset-hint";

export const DESK_RESET_HINT =
  "Kein E-Mail-Versand. Der Code liegt als Datei auf diesem Rechner, dort wo die Tafel gespeichert ist.";

/** Anzeige never writes silvia-passwort.txt — point staff to the writer. */
export const DESK_RESET_HINT_ANZEIGE =
  "Nur Anzeige. Den Code auf dem Schreib-Rechner legen, dort wo die Tafel gespeichert ist.";

export function deskResetHint(anzeige?: boolean) {
  return anzeige ? DESK_RESET_HINT_ANZEIGE : DESK_RESET_HINT;
}

/** Code legen / Passwort setzen stay on the writer. */
export function deskResetFormVisible(anzeige?: boolean) {
  return !anzeige;
}

/** Anzeige must not write silvia-passwort.txt into the copy folder. */
export function deskResetAnzeigeLine(error?: string | null) {
  const text = String(error ?? "").trim();
  return text === TAFEL_ANZEIGE_ERROR ? TAFEL_ANZEIGE_ERROR : "";
}

export function deskResetRefuseAnzeige(anzeige?: boolean) {
  if (!anzeige) return null;
  return { ok: false as const, error: TAFEL_ANZEIGE_ERROR };
}

export function formatDeskResetCode(raw: unknown) {
  const compact = String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "")
    .slice(0, 8);
  if (compact.length !== 8) return "";
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function deskResetCodeFromBytes(bytes: Uint8Array) {
  if (bytes.length < 8) return "";
  let compact = "";
  for (let i = 0; i < 8; i += 1) {
    compact += DESK_RESET_ALPHABET[bytes[i]! % DESK_RESET_ALPHABET.length];
  }
  return formatDeskResetCode(compact);
}

export function deskResetRequestCheck(email: unknown) {
  const value = String(email ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (!value.includes("@")) {
    return { ok: false as const, error: "Bitte eine gültige E-Mail angeben." };
  }
  return { ok: true as const, email: value };
}

export function deskResetApplyCheck(input: {
  email?: unknown;
  code?: unknown;
  password?: unknown;
  confirm?: unknown;
}) {
  const requested = deskResetRequestCheck(input.email);
  if (!requested.ok) return requested;
  const code = formatDeskResetCode(input.code);
  if (!code) {
    return { ok: false as const, error: "Bitte den Code aus der Datei eintippen." };
  }
  const password = String(input.password ?? "");
  const confirm = String(input.confirm ?? "");
  if (password !== confirm) {
    return { ok: false as const, error: "Die Passwörter stimmen nicht überein." };
  }
  if (password.length < 8 || password.length > 200) {
    return { ok: false as const, error: "Das Passwort braucht mindestens acht Zeichen." };
  }
  return { ok: true as const, email: requested.email, code, password };
}

export function renderDeskResetFile(input: { email: string; code: string; exp: Date }) {
  const code = formatDeskResetCode(input.code);
  const email = String(input.email ?? "")
    .trim()
    .toLowerCase();
  const exp = input.exp.toISOString();
  return [
    "Silvia — einmaliger Code für ein neues Passwort",
    "",
    `E-Mail: ${email}`,
    `Code: ${code}`,
    "Gültig 30 Minuten.",
    "",
    "Diesen Code unter Anmelden → Passwort setzen eintippen.",
    "Kein E-Mail-Versand. Die Datei liegt nur auf diesem Rechner.",
    "",
    "# silvia-reset 1",
    `# email=${email}`,
    `# code=${code.replace("-", "")}`,
    `# exp=${exp}`,
    "",
  ].join("\n");
}

export function parseDeskResetFile(raw: string, now = Date.now()) {
  const text = String(raw ?? "");
  const email = /# email=([^\s#]+)/i.exec(text)?.[1]?.trim().toLowerCase() ?? "";
  const code = formatDeskResetCode(/# code=([A-Z0-9-]+)/i.exec(text)?.[1] ?? "");
  const expRaw = /# exp=([^\s#]+)/i.exec(text)?.[1] ?? "";
  const exp = Date.parse(expRaw);
  if (!email.includes("@") || !code || !Number.isFinite(exp)) return null;
  if (exp <= now) return { ok: false as const, error: "expired" as const, email, code, exp };
  return { ok: true as const, email, code, exp };
}

/**
 * Punkt 10 — Codes je Benutzer statt einer gemeinsamen Datei.
 *
 * Die Datei enthielt genau EINEN Code. Forderten zwei Personen an, ueberschrieb
 * die zweite Anforderung den Code der ersten; die erste Person fand danach
 * einen fremden Code vor.
 *
 * Die Datei traegt jetzt mehrere Bloecke, je Person einer. Der Dateiname bleibt
 * `silvia-passwort.txt`, damit Hinweistext und Pfadanzeige unveraendert gelten.
 *
 * Kompatibel: Eine Datei im alten Format hat einen Block und wird weiterhin
 * gelesen.
 */
export type DeskResetEntry = { email: string; code: string; exp: number };

/** Position des Blockkennzeichens; Bloecke sind aneinandergehaengt. */
const DESK_RESET_MARKER = /#\s*silvia-reset\s+1/gi;

/**
 * Alle gueltig lesbaren Bloecke einer Datei.
 *
 * Gueltig heisst: E-Mail, Code und Ablauf sind vorhanden — unabhaengig davon,
 * ob der Code schon abgelaufen ist. Die Ablaufpruefung passiert beim Einloesen,
 * damit ein abgelaufener Code als `expired` gemeldet werden kann statt als
 * „unlesbar“.
 */
export function parseDeskResetEntries(raw: string): DeskResetEntry[] {
  const text = String(raw ?? "");
  const segments = text.split(DESK_RESET_MARKER).slice(1);
  const byEmail = new Map<string, DeskResetEntry>();
  for (const segment of segments) {
    const email = /# email=([^\s#]+)/i.exec(segment)?.[1]?.trim().toLowerCase() ?? "";
    const code = formatDeskResetCode(/# code=([A-Z0-9-]+)/i.exec(segment)?.[1] ?? "");
    const exp = Date.parse(/# exp=([^\s#]+)/i.exec(segment)?.[1] ?? "");
    if (!email.includes("@") || !code || !Number.isFinite(exp)) continue;
    // Bei doppeltem Block gewinnt der spaetere.
    byEmail.set(email, { email, code, exp });
  }
  return [...byEmail.values()];
}

/** Ein Block, identisch zum bisherigen Ein-Personen-Format. */
export function renderDeskResetEntry(entry: DeskResetEntry): string {
  return renderDeskResetFile({ email: entry.email, code: entry.code, exp: new Date(entry.exp) });
}

/** Bloecke stabil nach Adresse ordnen, damit die Datei nicht zufaellig springt. */
function renderDeskResetEntries(entries: DeskResetEntry[]): string {
  return [...entries]
    .sort((a, b) => a.email.localeCompare(b.email))
    .map(renderDeskResetEntry)
    .join("\n");
}

export const DESK_RESET_MAX_ENTRIES = 20;

/**
 * Einen Block setzen oder ersetzen — die uebrigen bleiben erhalten.
 *
 * Genau das verhindert, dass eine Anforderung den Code einer anderen Person
 * ueberschreibt.
 */
export function upsertDeskResetEntry(raw: string, entry: DeskResetEntry): string {
  const others = parseDeskResetEntries(raw).filter((e) => e.email !== entry.email);
  const all = [...others, entry].slice(-DESK_RESET_MAX_ENTRIES);
  return renderDeskResetEntries(all);
}

/** Einen Block entfernen — die uebrigen bleiben erhalten. */
export function removeDeskResetEntry(raw: string, email: string): string {
  const rest = parseDeskResetEntries(raw).filter((e) => e.email !== email);
  return renderDeskResetEntries(rest);
}

/**
 * Punkt 12 — einen zurueckgegebenen Code einmischen, ohne Neueres zu ersetzen.
 *
 * Gibt jemand einen beanspruchten Code zurueck (falsche Eingabe), darf sein
 * Block einen inzwischen NEU angeforderten Code nicht ueberschreiben. Deshalb
 * gewinnt der vorhandene Eintrag; der zurueckgegebene wird nur ergaenzt.
 */
export function mergeDeskResetEntry(raw: string, entry: DeskResetEntry): string {
  const current = parseDeskResetEntries(raw);
  const known = new Set(current.map((e) => e.email));
  const merged = known.has(entry.email) ? current : [...current, entry];
  return renderDeskResetEntries(merged);
}

/**
 * Wie `mergeDeskResetEntry`, aber fuer einen ganzen zurueckgegebenen Stand.
 *
 * Vorhandene Eintraege gewinnen; nur fehlende werden ergaenzt. `removeEmail`
 * laesst den Block dieser Person weg — so wird ein eingeloester Code
 * verbraucht, waehrend die uebrigen Personen ihren Code behalten.
 */
export function settleDeskResetEntries(
  currentRaw: string | null,
  claimedRaw: string,
  removeEmail?: string,
): string {
  const drop = String(removeEmail ?? "").trim().toLowerCase();
  const current = parseDeskResetEntries(currentRaw ?? "");
  const known = new Set(current.map((e) => e.email));
  const add = parseDeskResetEntries(claimedRaw).filter(
    (e) => e.email !== drop && !known.has(e.email),
  );
  return renderDeskResetEntries([...current, ...add]);
}

/**
 * Den Block einer Person heraussuchen.
 *
 * `missing` und `expired` werden unterschieden, damit die Oberflaeche den
 * richtigen Hinweis geben kann.
 */
export function deskResetEntryFor(raw: string, email: string, now = Date.now()) {
  const wanted = String(email ?? "").trim().toLowerCase();
  const entry = parseDeskResetEntries(raw).find((e) => e.email === wanted);
  if (!entry) return { ok: false as const, error: "missing" as const };
  if (entry.exp <= now) return { ok: false as const, error: "expired" as const, entry };
  return { ok: true as const, entry };
}
