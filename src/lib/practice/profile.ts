import { createServerFn } from "@tanstack/react-start";
import { PRACTICE } from "@/lib/alma/data";
import { parseHoursJson as parseHoursJsonRaw, SIGNUP_HOURS, MAX_HOUR_ROWS, prunePastExtraClosed, removeExtraClosedDay, upsertExtraClosedDay, type HourRow } from "@/lib/alma/hours";

export type { HourRow };

export type PracticeProfile = {
  id: string;
  name: string;
  ownerName: string;
  street: string;
  zip: string;
  city: string;
  bundesland: string;
  phone: string;
  whatsapp: string;
  email: string;
  pms: string;
  hours: HourRow[];
  /** Freitext-Liste, eine Zeile je Eintrag. Aus der Praxissoftware übernommen oder von Hand gepflegt. */
  vets: string;
  resources: string;
  nachtdienstName: string;
  nachtdienstPhone: string;
  nachtdienstNote: string;
  notes: string;
  locationHint: string;
  slug: string;
  retentionDays: number;
  /** AP 51: Freitext der Inhaberin, eigener Block im System-Prompt nach den Fakten. */
  behavior: string;
  /** AP 53: Einwilligungsansage nach der Begrüßung. */
  consentEnabled: boolean;
  consentNote: string;
};

/** Huber demo hours. Live signup uses SIGNUP_HOURS, not this. */
export const DEFAULT_HOURS: HourRow[] = PRACTICE.hours.map((h) => ({
  day: h.day,
  time: h.time,
}));

export { SIGNUP_HOURS };

export function parseHoursJson(raw: string | null | undefined): HourRow[] {
  return prunePastExtraClosed(parseHoursJsonRaw(raw, SIGNUP_HOURS));
}

export const loadPublicLine = createServerFn({ method: "GET" })
  .validator((input: { slug?: string }) => ({
    slug: String(input?.slug ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48),
  }))
  .handler(async ({ data }) => {
    if (!data.slug) return { ok: false as const, profile: null as null };
    const profile = await (await import("./profile-data.server")).fetchProfileBySlug(data.slug);
    return profile ? { ok: true as const, profile } : { ok: false as const, profile: null as null };
  });

export const loadPracticeProfile = createServerFn({ method: "GET" }).handler(async () => {
  const { readPracticeSession } = await import("./session.server");
  const session = await readPracticeSession();
  if (!session) return { ok: false as const, profile: null as null, facts: [] as { id: string; fact: string; at: string }[], staff: [] as { id: string; name: string; email: string; role: "inhaberin" | "kassa"; self: boolean }[], storage: null, llm: null, pms: null };
  const profile = await (await import("./profile-data.server")).fetchProfile(session.practiceId);
  const { fetchFacts } = await import("./facts.server");
  const { fetchStaff } = await import("./staff");
  const facts = await fetchFacts(session.practiceId);
  const staff = await fetchStaff(session.practiceId, session.userId);
  const { getDbSource } = await import("./profile-sql.server");
  const dbSource = await getDbSource();
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const { deskStorage } = await import("./desk-storage");
  const { llmStatusView } = await import("@/lib/alma/llm");
  const { hasPraxissoftwareAdapter } = await import("./praxissoftware");
  const { praxissoftwareStatusView } = await import("./bridge/status");
  const storage = deskStorage({ dbSource, dataDir: resolvePgliteDataDir() });
  const pms =
    profile && hasPraxissoftwareAdapter(profile.pms)
      ? await praxissoftwareStatusView(profile.id, profile.pms)
      : null;
  return { ok: true as const, profile, facts, staff, storage, llm: llmStatusView(), pms };
});

export const savePracticeProfile = createServerFn({ method: "POST" })
  .validator((input: Partial<PracticeProfile>) => ({
    name: String(input?.name ?? "").trim().slice(0, 80),
    ownerName: String(input?.ownerName ?? "").trim().slice(0, 80),
    street: String(input?.street ?? "").trim().slice(0, 80),
    zip: String(input?.zip ?? "").trim().slice(0, 12),
    city: String(input?.city ?? "").trim().slice(0, 60),
    bundesland: String(input?.bundesland ?? "").trim().slice(0, 40),
    phone: String(input?.phone ?? "").trim().slice(0, 32),
    whatsapp: String(input?.whatsapp ?? "").trim().slice(0, 32),
    email: String(input?.email ?? "").trim().slice(0, 160),
    pms: String(input?.pms ?? "").trim().slice(0, 40),
    hours: Array.isArray(input?.hours)
      ? input.hours.slice(0, MAX_HOUR_ROWS).map((h) => ({
          day: String(h?.day ?? "").slice(0, 24),
          time: String(h?.time ?? "").slice(0, 80),
        }))
      : SIGNUP_HOURS,
    nachtdienstName: String(input?.nachtdienstName ?? "").trim().slice(0, 80),
    nachtdienstPhone: String(input?.nachtdienstPhone ?? "").trim().slice(0, 32),
    nachtdienstNote: String(input?.nachtdienstNote ?? "").trim().slice(0, 240),
    notes: String(input?.notes ?? "").trim().slice(0, 400),
    locationHint: String(input?.locationHint ?? "").trim().slice(0, 400),
    retentionDays: String(input?.retentionDays ?? "").trim().slice(0, 8),
    vets: String(input?.vets ?? "").trim().slice(0, 4000),
    resources: String(input?.resources ?? "").trim().slice(0, 4000),
    behavior: String(input?.behavior ?? "").trim().slice(0, 2000),
    consentEnabled: Boolean(input?.consentEnabled),
    consentNote: String(input?.consentNote ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { INHABERIN_SETTINGS_ERROR, isInhaberin } = await import("./staff-role");
    if (!isInhaberin(session.role)) {
      return { ok: false as const, error: INHABERIN_SETTINGS_ERROR };
    }
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const current = await sql<{
      bundesland: string;
      location_hint: string;
      name: string;
      nachtdienst_name: string;
      nachtdienst_phone: string;
      notes: string;
      owner_name: string;
      whatsapp: string;
      nachtdienst_note: string;
      zip: string;
      street: string;
      email: string;
      phone: string;
      city: string;
      retention_days: number;
    }>`
      select bundesland, location_hint, name, nachtdienst_name, nachtdienst_phone, notes, owner_name, whatsapp, nachtdienst_note, zip, street, email, phone, city, retention_days
      from practices
      where id = ${session.practiceId}
      limit 1
    `;
    const { parseSettingsProfile, RETENTION_DAYS_DEFAULT } = await import("./settings-form");
    const parsed = parseSettingsProfile(data, {
      loginEmail: session.email,
      bundesland: current[0]?.bundesland ?? "",
      locationHint: current[0]?.location_hint ?? "",
      name: current[0]?.name ?? "",
      nachtdienstName: current[0]?.nachtdienst_name ?? "",
      nachtdienstPhone: current[0]?.nachtdienst_phone ?? "",
      notes: current[0]?.notes ?? "",
      ownerName: current[0]?.owner_name ?? "",
      whatsapp: current[0]?.whatsapp ?? "",
      nachtdienstNote: current[0]?.nachtdienst_note ?? "",
      zip: current[0]?.zip ?? "",
      street: current[0]?.street ?? "",
      email: current[0]?.email ?? "",
      phone: current[0]?.phone ?? "",
      city: current[0]?.city ?? "",
      retentionDays: Number(current[0]?.retention_days) || RETENTION_DAYS_DEFAULT,
    });
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const hours = prunePastExtraClosed(data.hours.length ? data.hours : SIGNUP_HOURS);
    const hoursJson = JSON.stringify(hours.length ? hours : SIGNUP_HOURS);
    await sql`
      update practices set
        name = ${parsed.value.name},
        owner_name = ${parsed.value.ownerName},
        street = ${parsed.value.street},
        zip = ${parsed.value.zip},
        city = ${parsed.value.city},
        bundesland = ${parsed.value.bundesland},
        phone = ${parsed.value.phone},
        whatsapp = ${parsed.value.whatsapp},
        email = ${parsed.value.email},
        pms = ${data.pms},
        hours_json = ${hoursJson},
        nachtdienst_name = ${parsed.value.nachtdienstName},
        nachtdienst_phone = ${parsed.value.nachtdienstPhone},
        nachtdienst_note = ${parsed.value.nachtdienstNote},
        notes = ${parsed.value.notes},
        location_hint = ${parsed.value.locationHint},
        retention_days = ${parsed.value.retentionDays},
        vets = ${data.vets},
        resources = ${data.resources},
        behavior = ${data.behavior},
        consent_enabled = ${data.consentEnabled},
        consent_note = ${data.consentNote}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Aktualisiert nur Ton und Verhalten, ohne die übrigen Praxiseinstellungen zu überschreiben. */
export const savePracticeBehavior = createServerFn({ method: "POST" })
  .validator((input: { behavior?: string }) => ({
    behavior: String(input?.behavior ?? "").trim().slice(0, 2000),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { INHABERIN_SETTINGS_ERROR, isInhaberin } = await import("./staff-role");
    if (!isInhaberin(session.role)) {
      return { ok: false as const, error: INHABERIN_SETTINGS_ERROR };
    }
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices set behavior = ${data.behavior}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

async function tafelViewOnly() {
  const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
  return tafelWriteBlock();
}

/** One-click leave Huber demo hours. Only while the Tafel still matches DEFAULT_HOURS. */
export const applySignupHours = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePractice } = await import("./session.server");
  const session = await requirePractice();
  const blocked = await tafelViewOnly();
  if (blocked) return { ok: false as const, error: blocked.error };
  const profile = await (await import("./profile-data.server")).fetchProfile(session.practiceId);
  if (!profile) return { ok: false as const, error: "Tafel nicht gefunden." };
  const { signupHoursIfStillHuber } = await import("@/lib/alma/hours");
  const next = signupHoursIfStillHuber(profile.hours, DEFAULT_HOURS);
  if (!next) {
    return { ok: false as const, error: "Zeiten sind schon angepasst." };
  }
  const { getSql } = await import("./profile-sql.server");
  const sql = await getSql();
  await sql`
    update practices set hours_json = ${JSON.stringify(next)}
    where id = ${session.practiceId}
  `;
  return { ok: true as const };
});

/** Kassa may hinterlegen one extra closed date without rewriting weekday hours. */
export const savePracticeClosedDay = createServerFn({ method: "POST" })
  .validator((input: { day?: string }) => ({
    day: String(input?.day ?? "").trim().slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const profile = await (await import("./profile-data.server")).fetchProfile(session.practiceId);
    if (!profile) return { ok: false as const, error: "Tafel nicht gefunden." };
    const next = upsertExtraClosedDay(profile.hours, data.day);
    if (!next.ok) return { ok: false as const, error: next.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    await sql`
      update practices set hours_json = ${JSON.stringify(next.hours)}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may reopen one extra closed date without rewriting weekday hours. */
export const savePracticeOpenDay = createServerFn({ method: "POST" })
  .validator((input: { day?: string }) => ({
    day: String(input?.day ?? "").trim().slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const profile = await (await import("./profile-data.server")).fetchProfile(session.practiceId);
    if (!profile) return { ok: false as const, error: "Tafel nicht gefunden." };
    const next = removeExtraClosedDay(profile.hours, data.day);
    if (!next.ok) return { ok: false as const, error: next.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    await sql`
      update practices set hours_json = ${JSON.stringify(next.hours)}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen Frau-Doktor-Handy without the full Inhaberin profile form. */
export const savePracticeWhatsapp = createServerFn({ method: "POST" })
  .validator((input: { whatsapp?: string }) => ({
    whatsapp: String(input?.whatsapp ?? "").trim().slice(0, 32),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeWhatsapp } = await import("@/lib/alma/phone");
    const parsed = parsePracticeWhatsapp(data.whatsapp);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices set whatsapp = ${parsed.value}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen the Inhaberin without the full profile form. No invented Anna Huber. */
export const savePracticeOwnerName = createServerFn({ method: "POST" })
  .validator((input: { name?: string }) => ({
    name: String(input?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeOwnerName } = await import("@/lib/alma/desk");
    const parsed = parsePracticeOwnerName(data.name);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices set owner_name = ${parsed.value}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen the Frau-Doktor inbox without the full Inhaberin profile form. */
export const savePracticeInbox = createServerFn({ method: "POST" })
  .validator((input: { email?: string }) => ({
    email: String(input?.email ?? "").trim().slice(0, 160),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeInbox } = await import("@/lib/alma/phone");
    const parsed = parsePracticeInbox(data.email, session.email);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices set email = ${parsed.value}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen the Leitung without the full Inhaberin profile form. No Huber Josefstadt number. */
export const savePracticePhone = createServerFn({ method: "POST" })
  .validator((input: { phone?: string }) => ({
    phone: String(input?.phone ?? "").trim().slice(0, 32),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticePhone } = await import("@/lib/alma/phone");
    const parsed = parsePracticePhone(data.phone);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices set phone = ${parsed.value}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen Nachtdienst without the full Inhaberin profile form. No invented default number. */
export const savePracticeNachtdienst = createServerFn({ method: "POST" })
  .validator((input: { phone?: string; name?: string }) => ({
    phone: String(input?.phone ?? "").trim().slice(0, 32),
    name: String(input?.name ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeNachtdienst } = await import("@/lib/alma/phone");
    const parsed = parsePracticeNachtdienst({ phone: data.phone, name: data.name });
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const current = await sql<{ nachtdienst_note: string; nachtdienst_name: string }>`
      select nachtdienst_note, nachtdienst_name from practices where id = ${session.practiceId} limit 1
    `;
    const { keepNachtdienstName, keepNachtdienstNote } = await import("@/lib/alma/desk");
    const note = keepNachtdienstNote(current[0]?.nachtdienst_note);
    const name = keepNachtdienstName(parsed.name, current[0]?.nachtdienst_name);
    await sql`
      update practices
      set nachtdienst_phone = ${parsed.phone},
          nachtdienst_name = ${name},
          nachtdienst_note = ${note}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen Straße without the full Inhaberin profile form. No invented Josefstadt. */
export const savePracticeAnreise = createServerFn({ method: "POST" })
  .validator((input: { street?: string; zip?: string; hint?: string }) => ({
    street: String(input?.street ?? "").trim().slice(0, 80),
    zip: String(input?.zip ?? "").trim().slice(0, 12),
    hint: String(input?.hint ?? "").trim().slice(0, 400),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeAnreise } = await import("@/lib/alma/desk");
    const parsed = parsePracticeAnreise(data);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const current = await sql<{ location_hint: string; zip: string }>`
      select location_hint, zip from practices where id = ${session.practiceId} limit 1
    `;
    const { keepLocationHint, keepZip } = await import("@/lib/alma/desk");
    const hint = keepLocationHint(parsed.hint, current[0]?.location_hint);
    const zip = keepZip(parsed.zip, current[0]?.zip);
    await sql`
      update practices
      set street = ${parsed.street},
          zip = ${zip},
          location_hint = ${hint}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Kassa may hinterlegen Ort without the full Inhaberin profile form. No invented Wien. */
export const savePracticeOrt = createServerFn({ method: "POST" })
  .validator((input: { city?: string; bundesland?: string }) => ({
    city: String(input?.city ?? "").trim().slice(0, 60),
    bundesland: String(input?.bundesland ?? "").trim().slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeOrt } = await import("@/lib/alma/desk");
    const parsed = parsePracticeOrt(data);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    const current = await sql<{ bundesland: string }>`
      select bundesland from practices where id = ${session.practiceId} limit 1
    `;
    const { keepBundesland } = await import("@/lib/alma/desk");
    const bundesland = keepBundesland(parsed.bundesland, current[0]?.bundesland);
    await sql`
      update practices
      set city = ${parsed.city},
          bundesland = ${bundesland}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Tierarzthelferin may hinterlegen Parkplatz/Öffi without the full Inhaberin profile form. Does not overwrite street/zip. */
export const savePracticeLocationHint = createServerFn({ method: "POST" })
  .validator((input: { hint?: string }) => ({
    hint: String(input?.hint ?? "").trim().slice(0, 400),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { parsePracticeLocationHint } = await import("@/lib/alma/desk");
    const parsed = parsePracticeLocationHint({ hint: data.hint });
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const blocked = await tafelViewOnly();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { getSql } = await import("./profile-sql.server");
    const sql = await getSql();
    await sql`
      update practices
      set location_hint = ${parsed.hint}
      where id = ${session.practiceId}
    `;
    return { ok: true as const };
  });
