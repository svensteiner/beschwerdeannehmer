/**
 * AP 20 — Ersteinrichtung aus der Praxissoftware.
 * Read-only preview: holt Ärzte/Räume/Zeiten vom Connector, schreibt nichts.
 * Übernommen wird erst, wenn die Inhaberin den Review-Dialog bestätigt und danach
 * selbst auf Einstellungen-Speichern tippt (savePracticeProfile) — kein stiller Import.
 */
import { createServerFn } from "@tanstack/react-start";
import { SIGNUP_CLOSED_TIME, type HourRow } from "../alma/hours.ts";
import type { ConnectorHours } from "./praxissoftware.ts";

const GERMAN_DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

const DAY_ALIASES: Record<string, number> = {
  montag: 0, mon: 0, monday: 0, mo: 0, "1": 0,
  dienstag: 1, tue: 1, tuesday: 1, di: 1, "2": 1,
  mittwoch: 2, wed: 2, wednesday: 2, mi: 2, "3": 2,
  donnerstag: 3, thu: 3, thursday: 3, do: 3, "4": 3,
  freitag: 4, fri: 4, friday: 4, fr: 4, "5": 4,
  samstag: 5, sat: 5, saturday: 5, sa: 5, "6": 5,
  sonntag: 6, sun: 6, sunday: 6, so: 6, "0": 6, "7": 6,
};

/** Connector day strings are not specified by an API contract — accept common German/English/ISO forms. */
export function normalizeConnectorDay(raw: string): number | null {
  const key = raw.trim().toLowerCase();
  return key in DAY_ALIASES ? DAY_ALIASES[key] : null;
}

/** "08:00" -> "8:00" — same style as SIGNUP_WEEKDAY_TIME. Unknown formats pass through unchanged. */
export function formatConnectorTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return raw.trim();
  return `${Number(m[1])}:${m[2]}`;
}

/**
 * Connector `/hours` already falls back to connector.json's `opening` field on its own side
 * when COMPANY.OPENINGHOURS is empty (silvia-connector, not touched here) — so mapping the
 * `opening` array we get back is always the right source, never `closedDays` alone.
 */
export function mapConnectorHoursToRows(hours: ConnectorHours | null | undefined): HourRow[] {
  if (!hours || !Array.isArray(hours.opening) || !hours.opening.length) return [];
  const byDay = new Map<number, string[]>();
  for (const entry of hours.opening) {
    const idx = normalizeConnectorDay(entry.day);
    if (idx === null) continue;
    const window = `${formatConnectorTime(entry.start)}–${formatConnectorTime(entry.end)}`;
    const list = byDay.get(idx) ?? [];
    list.push(window);
    byDay.set(idx, list);
  }
  const closed = new Set(
    (hours.closedDays ?? [])
      .map((d) => normalizeConnectorDay(d))
      .filter((n): n is number => n !== null),
  );
  const rows: HourRow[] = [];
  for (let i = 0; i < 7; i++) {
    const windows = byDay.get(i);
    if (windows && windows.length) {
      rows.push({ day: GERMAN_DAYS[i]!, time: windows.join(", ") });
    } else if (closed.has(i)) {
      rows.push({ day: GERMAN_DAYS[i]!, time: SIGNUP_CLOSED_TIME });
    }
  }
  return rows;
}

/** Ärzte/Räume are Freitext-Listen (settings-form.ts) — one name per line, deduped blanks. */
export function praxissoftwareNamesFrom(rows: { name: string }[] | null | undefined): string {
  if (!Array.isArray(rows)) return "";
  return rows
    .map((r) => String(r?.name ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export type PraxissoftwareImportPreview =
  | { ok: true; vets: string; resources: string; hours: HourRow[]; hoursFound: boolean }
  | { ok: false; error: string };

/** Read-only: never writes. The Inhaberin still has to review and tap Speichern herself. */
export const fetchPraxissoftwareImportPreview = createServerFn({ method: "POST" }).handler(
  async (): Promise<PraxissoftwareImportPreview> => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { isInhaberin, INHABERIN_SETTINGS_ERROR } = await import("./staff-role");
    if (!isInhaberin(session.role)) return { ok: false, error: INHABERIN_SETTINGS_ERROR };
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    const { hasPraxissoftwareAdapter } = await import("./praxissoftware");
    if (!profile || !hasPraxissoftwareAdapter(profile.pms)) {
      return { ok: false, error: "Keine Praxissoftware hinterlegt (Einstellungen → Praxissoftware)." };
    }
    const { praxissoftwareRuntime } = await import("./praxissoftware-runtime");
    const adapter = await praxissoftwareRuntime(profile.id, profile.pms);
    const [vets, resources, hours] = await Promise.all([
      adapter.vets(),
      adapter.resources(),
      adapter.hours(),
    ]);
    if (!vets.ok && !resources.ok && !hours.ok) {
      return { ok: false, error: "Praxissoftware nicht erreichbar." };
    }
    return {
      ok: true,
      vets: vets.ok ? praxissoftwareNamesFrom(vets.data) : "",
      resources: resources.ok ? praxissoftwareNamesFrom(resources.data) : "",
      hours: hours.ok ? mapConnectorHoursToRows(hours.data) : [],
      hoursFound: Boolean(hours.ok && hours.data.opening.length),
    };
  },
);
