import { createServerFn } from "@tanstack/react-start";
import { internPracticeInbox } from "@/lib/alma/phone";
import {
  parseRescheduleStart,
  parseWalkIn,
  sanitizeAppointmentStatus,
  sanitizeCallStatus,
  sanitizeEmergencyStatus,
} from "./desk-status";

export {
  APPOINTMENT_STATUSES,
  CALL_DESK_STATUSES,
  EMERGENCY_STATUSES,
  sanitizeAppointmentStatus,
  sanitizeCallStatus,
  sanitizeEmergencyStatus,
} from "./desk-status";
export type { AppointmentStatus, CallDeskStatus, EmergencyStatus } from "./desk-status";

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    status: String(input?.status ?? "").slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const status = sanitizeAppointmentStatus(data.status);
    if (!data.id || !status) return { ok: false as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const current = await sql<{
      id: string;
      start_at: string | Date;
      status: string;
      pet: string;
      owner_name: string;
      kind: string;
    }>`
      select id, start_at, status, pet, owner_name, kind
      from appointments
      where id = ${data.id} and practice_id = ${session.practiceId}
      limit 1
    `;
    if (!current[0]) return { ok: false as const, error: "Termin nicht gefunden." };
    const offerSlot = async (startAt: Date | string) => {
      const { fetchProfile } = await import("./profile-data.server");
      const profile = await fetchProfile(session.practiceId);
      const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
      const start = startAt instanceof Date ? startAt.toISOString() : new Date(String(startAt)).toISOString();
      await offerTafelToSpiegel(sql, session.practiceId, profile?.pms, {
        akte: { pet: current[0].pet, owner: current[0].owner_name },
        slot: {
          start,
          pet: current[0].pet,
          owner: current[0].owner_name,
          reason: current[0].kind,
          status,
        },
      });
    };
    if (status !== "abgesagt" && current[0].status === "abgesagt") {
      let start = current[0].start_at instanceof Date ? current[0].start_at : new Date(String(current[0].start_at));
      const prev = start;
      const { fetchProfile } = await import("./profile-data.server");
      const profile = await fetchProfile(session.practiceId);
      const { parseHourWindows, walkInBlocked, dayIsWalkInClosed, retargetClosedDayStart } = await import("@/lib/alma/hours");
      const { loadOccupiedSlots } = await import("./occupied");
      const occupied = await loadOccupiedSlots(sql, session.practiceId, data.id);
      const hours = profile?.hours ?? [];
      if (dayIsWalkInClosed(hours, start)) {
        start = retargetClosedDayStart(
          hours,
          occupied.map((slot) => ({
            start_at: slot.start.toISOString(),
            minutes: slot.minutes,
            pet: slot.pet,
          })),
          start,
        );
      }
      const blocked = walkInBlocked(start, parseHourWindows(hours), occupied);
      if (blocked) {
        return { ok: false as const, error: blocked.error, nextStart: blocked.next.toISOString() };
      }
      const moved = !Number.isNaN(+prev) && Math.abs(+start - +prev) >= 60_000;
      const claimed = await sql<{ outcome: string }>`
        select move_appointment_slot_atomic(
          ${data.id}, ${session.practiceId}, ${prev.toISOString()}, ${current[0].status},
          ${start.toISOString()}, ${status}
        ) as outcome
      `;
      if (claimed[0]?.outcome !== "applied") {
        return {
          ok: false as const,
          error: claimed[0]?.outcome === "conflict"
            ? "Dieser Slot wurde gerade belegt. Bitte aktualisieren Sie die Tafel."
            : "Der Termin wurde inzwischen geändert. Bitte aktualisieren Sie die Tafel.",
        };
      }
      await offerSlot(start);
      if (moved) return { ok: true as const, status, start: start.toISOString(), moved: true as const };
      return { ok: true as const, status };
    }
    const currentStart =
      current[0].start_at instanceof Date
        ? current[0].start_at
        : new Date(String(current[0].start_at));
    const updated = await sql<{ outcome: string }>`
      select update_appointment_status_atomic(
        ${data.id}, ${session.practiceId}, ${currentStart.toISOString()}, ${current[0].status}, ${status}
      ) as outcome
    `;
    if (updated[0]?.outcome !== "applied") {
      return {
        ok: false as const,
        error: updated[0]?.outcome === "stale"
          ? "Der Termin wurde inzwischen geändert. Bitte aktualisieren Sie die Tafel."
          : "Termin nicht geändert.",
      };
    }
    await offerSlot(current[0].start_at);
    return { ok: true as const, status };
  });

export const rescheduleAppointment = createServerFn({ method: "POST" })
  .validator((input: { id?: string; start?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    start: String(input?.start ?? "").slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const start = parseRescheduleStart(data.start);
    if (!data.id || !start) return { ok: false as const, error: "Uhrzeit brauchen wir." };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const current = await sql<{
      id: string;
      start_at: string | Date;
      owner_name: string;
      pet: string;
      kind: string;
      status: string;
    }>`
      select id, start_at, owner_name, pet, kind, status
      from appointments
      where id = ${data.id} and practice_id = ${session.practiceId}
      limit 1
    `;
    if (!current[0]) return { ok: false as const, error: "Termin nicht gefunden." };
    if (current[0].status === "abgesagt") {
      return { ok: false as const, error: "Abgesagten Termin zuerst wieder einsetzen." };
    }
    const prev =
      current[0].start_at instanceof Date ? current[0].start_at : new Date(String(current[0].start_at));
    if (!Number.isNaN(+prev) && Math.abs(+start - +prev) < 60_000) {
      return { ok: true as const, start: start.toISOString(), pet: current[0].pet, unchanged: true as const };
    }
    const { parseHourWindows, walkInBlocked, formatSlot, dayIsWalkInClosed, retargetClosedDayStart } = await import("@/lib/alma/hours");
    const { loadOccupiedSlots } = await import("./occupied");
    const occupied = await loadOccupiedSlots(sql, session.practiceId, data.id);
    const hours = profile?.hours ?? [];
    let next = start;
    if (dayIsWalkInClosed(hours, start)) {
      next = retargetClosedDayStart(
        hours,
        occupied.map((slot) => ({
          start_at: slot.start.toISOString(),
          minutes: slot.minutes,
          pet: slot.pet,
        })),
        start,
      );
    }
    if (!Number.isNaN(+prev) && Math.abs(+next - +prev) < 60_000) {
      return { ok: true as const, start: next.toISOString(), pet: current[0].pet, unchanged: true as const };
    }
    const blocked = walkInBlocked(next, parseHourWindows(hours), occupied);
    if (blocked) {
      return { ok: false as const, error: blocked.error, nextStart: blocked.next.toISOString() };
    }
    const nextStatus = current[0].status === "bestätigt" ? "gelegt" : current[0].status;
    const claimed = await sql<{ outcome: string }>`
      select move_appointment_slot_atomic(
        ${data.id}, ${session.practiceId}, ${prev.toISOString()}, ${current[0].status},
        ${next.toISOString()}, ${nextStatus}
      ) as outcome
    `;
    if (claimed[0]?.outcome !== "applied") {
      return {
        ok: false as const,
        error: claimed[0]?.outcome === "conflict"
          ? "Dieser Slot wurde gerade belegt. Bitte aktualisieren Sie die Tafel."
          : "Der Termin wurde inzwischen geändert. Bitte aktualisieren Sie die Tafel.",
      };
    }
    const { protocolBody, protocolSubject } = await import("@/lib/alma/protocol");
    const { writeInternProtocol } = await import("./write-protocol");
    const practiceName = profile?.name || session.practiceName;
    const ownerName = profile?.ownerName || session.userName || "Frau Doktor";
    const slot = formatSlot(next);
    const action = {
      type: "book" as const,
      owner: current[0].owner_name,
      pet: current[0].pet,
      kind: current[0].kind || "Termin",
      concern: `Umgelegt auf ${slot}`,
      summary: `Umgelegt ${slot}`,
    };
    const named = await sql<{
      id: string;
      phone: string;
      email: string;
      name: string;
      owner_name: string;
      chip: string;
    }>`
      select id, phone, email, name, owner_name, chip from patients
      where practice_id = ${session.practiceId}
        and lower(name) = ${current[0].pet.toLowerCase()}
    `;
    const { pickPatientMatch } = await import("./patient-query");
    const contact = pickPatientMatch(named, {
      name: current[0].pet,
      owner: current[0].owner_name,
    });
    const subject = protocolSubject(action);
    const body = protocolBody(
      {
        action,
        user: `Umgelegt: ${current[0].pet}`,
        reply: `Neuer Slot: ${slot}.`,
        akte: null,
        slot,
        channel: "Tafel",
        ownerPhone: contact?.phone,
        ownerEmail: contact?.email,
      },
      {
        practiceName,
        owner: ownerName,
        nachtdienstName: profile?.nachtdienstName?.trim() || "Nachtdienst",
      },
    );
    await writeInternProtocol(sql, {
      practiceId: session.practiceId,
      internName: `${ownerName} · intern`,
      pet: current[0].pet,
      subject,
      body,
      mailTo: internPracticeInbox(profile?.email, session.email),
    });
    const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
    await offerTafelToSpiegel(sql, session.practiceId, profile?.pms, {
      akte: { pet: current[0].pet, owner: current[0].owner_name, phone: contact?.phone, email: contact?.email },
      slot: {
        start: next.toISOString(),
        pet: current[0].pet,
        owner: current[0].owner_name,
        reason: current[0].kind,
        status: nextStatus === "bestätigt" || nextStatus === "abgesagt" ? nextStatus : "gelegt",
      },
      kontakt: { owner: current[0].owner_name, phone: contact?.phone, email: contact?.email },
    });
    return {
      ok: true as const,
      start: next.toISOString(),
      previousStart: prev.toISOString(),
      pet: current[0].pet,
      owner: current[0].owner_name,
      phone: contact?.phone || "",
      email: contact?.email || "",
      resetConfirm: nextStatus === "gelegt" && current[0].status === "bestätigt",
    };
  });

export const updateCallStatus = createServerFn({ method: "POST" })
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    status: String(input?.status ?? "").slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const status = sanitizeCallStatus(data.status);
    if (!data.id || !status) return { ok: false as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      update calls set status = ${status}
      where id = ${data.id} and practice_id = ${session.practiceId}
      returning id
    `;
    if (!rows[0]) return { ok: false as const };
    return { ok: true as const, status };
  });

export const updateEmergencyStatus = createServerFn({ method: "POST" })
  .validator((input: { id?: string; status?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    status: String(input?.status ?? "").slice(0, 24),
  }))
  .handler(async ({ data }) => {
    const status = sanitizeEmergencyStatus(data.status);
    if (!data.id || !status) return { ok: false as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    // Statuswechsel und Nachweis sind EIN Datenbankvorgang (migrations/0037):
    // schluege der Audit-Insert fehl, bliebe sonst ein Status ohne Nachweis.
    const { newId } = await import("./crypto");
    const auditId = `ea-${newId()}`;
    const claimed = await sql<{ outcome: string }>`
      select update_emergency_status_atomic(
        ${data.id}, ${session.practiceId}, ${status}, ${session.userName || "Praxis"}, ${auditId}
      ) as outcome
    `;
    if (claimed[0]?.outcome !== "applied" && claimed[0]?.outcome !== "unchanged") {
      return { ok: false as const };
    }
    return { ok: true as const, status };
  });

export const createWalkInAppointment = createServerFn({ method: "POST" })
  .validator((input: { pet?: string; owner?: string; kind?: string; start?: string; phone?: string; email?: string }) => ({
    pet: String(input?.pet ?? "").slice(0, 40),
    owner: String(input?.owner ?? "").slice(0, 80),
    kind: String(input?.kind ?? "").slice(0, 60),
    start: String(input?.start ?? "").slice(0, 40),
    phone: String(input?.phone ?? "").slice(0, 24),
    email: String(input?.email ?? "").slice(0, 120),
  }))
  .handler(async ({ data }) => {
    const parsed = parseWalkIn(data);
    if (!parsed) return { ok: false as const, error: "Halterin, Tier und Uhrzeit brauchen wir." };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    const { parseHourWindows, walkInBlocked, dayIsWalkInClosed, retargetClosedDayStart } = await import("@/lib/alma/hours");
    const hours = profile?.hours ?? [];
    const windows = parseHourWindows(hours);
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { loadOccupiedSlots } = await import("./occupied");
    const occupied = await loadOccupiedSlots(sql, session.practiceId);
    let start = parsed.start;
    if (dayIsWalkInClosed(hours, start)) {
      start = retargetClosedDayStart(
        hours,
        occupied.map((slot) => ({
          start_at: slot.start.toISOString(),
          minutes: slot.minutes,
          pet: slot.pet,
        })),
        start,
      );
    }
    const blocked = walkInBlocked(start, windows, occupied);
    if (blocked) {
      return { ok: false as const, error: blocked.error, nextStart: blocked.next.toISOString() };
    }
    const { newId } = await import("./crypto");
    const id = `w-${newId()}`;
    const claimed = await sql<{ outcome: string }>`
      select reserve_appointment_slot_atomic(
        ${id}, ${session.practiceId}, ${start.toISOString()}, ${20},
        ${parsed.owner}, ${parsed.pet}, ${parsed.kind},
        ${profile?.ownerName || session.userName}, ${"kassa"}, ${"gelegt"}
      ) as outcome
    `;
    if (claimed[0]?.outcome !== "applied") {
      return {
        ok: false as const,
        error: claimed[0]?.outcome === "conflict"
          ? "Dieser Slot wurde gerade belegt. Bitte aktualisieren Sie die Tafel."
          : "Termin konnte nicht eingetragen werden.",
      };
    }
    const named = await sql<{
      id: string;
      name: string;
      owner_name: string;
      phone: string;
      email: string;
      chip: string;
    }>`
      select id, name, owner_name, phone, email, chip from patients
      where practice_id = ${session.practiceId}
        and lower(name) = ${parsed.pet.toLowerCase()}
    `;
    const { pickPatientMatch } = await import("./patient-query");
    const existing = pickPatientMatch(named, {
      name: parsed.pet,
      owner: parsed.owner,
      phone: parsed.phone,
    });
    const note = `Tafel: ${parsed.kind}`;
    if (existing) {
      await sql`
        update patients
        set last_visit = ${note},
            last_call_note = ${note},
            last_call_at = now(),
            owner_name = ${parsed.owner},
            phone = case when ${parsed.phone} = '' then phone else ${parsed.phone} end,
            email = case when ${parsed.email} = '' then email else ${parsed.email} end
        where id = ${existing.id} and practice_id = ${session.practiceId}
      `;
    } else {
      await sql`
        insert into patients (id, practice_id, name, species, owner_name, phone, email, notes, last_visit, source, last_call_note, last_call_at)
        values (
          ${newId()},
          ${session.practiceId},
          ${parsed.pet},
          ${""},
          ${parsed.owner},
          ${parsed.phone},
          ${parsed.email},
          ${note},
          ${note},
          ${"kassa"},
          ${note},
          now()
        )
      `;
    }
    const { ownerConfirmText, protocolBody, protocolSubject, walkInAction } = await import(
      "@/lib/alma/protocol"
    );
    const { formatSlot } = await import("@/lib/alma/hours");
    const { writeInternProtocol } = await import("./write-protocol");
    const practiceName = profile?.name || session.practiceName;
    const ownerName = profile?.ownerName || session.userName || "Frau Doktor";
    const slot = formatSlot(start);
    const confirm = ownerConfirmText({
      action: { pet: parsed.pet, owner: parsed.owner },
      slot,
      practiceName,
    });
    const at = new Date().toISOString();
    const { applyReachToThread } = await import("./call-contact");
    const next = applyReachToThread({
      name: parsed.owner,
      preview: `Walk-in gelegt: ${parsed.pet || "Patient"}`,
      messages: [{ from: "alma", text: confirm, at }],
      pet: parsed.pet,
      phone: parsed.phone,
      email: parsed.email,
      owner: parsed.owner,
      spoken: [parsed.owner, parsed.phone, parsed.email].filter(Boolean).join("\n"),
    });
    await sql`
      insert into threads (id, practice_id, name, pet, preview, unread, intern, messages)
      values (
        ${newId()},
        ${session.practiceId},
        ${next.name},
        ${next.pet},
        ${next.preview},
        ${0},
        ${false},
        ${JSON.stringify(next.messages)}::jsonb
      )
    `;
    const action = walkInAction({ owner: parsed.owner, pet: parsed.pet, kind: parsed.kind });
    const subject = protocolSubject(action);
    const body = protocolBody(
      {
        action,
        user: `Walk-in ${parsed.kind} für ${parsed.pet}`,
        reply: `An der Tafel gelegt: ${slot}.`,
        akte: null,
        slot,
        channel: "Tafel",
        ownerPhone: parsed.phone,
        ownerEmail: parsed.email,
      },
      {
        practiceName,
        owner: ownerName,
        nachtdienstName: profile?.nachtdienstName?.trim() || "Nachtdienst",
      },
    );
    await writeInternProtocol(sql, {
      practiceId: session.practiceId,
      internName: `${ownerName} · intern`,
      pet: parsed.pet,
      subject,
      body,
      mailTo: internPracticeInbox(profile?.email, session.email),
    });
    const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
    await offerTafelToSpiegel(sql, session.practiceId, profile?.pms, {
      akte: { pet: parsed.pet, owner: parsed.owner, phone: parsed.phone, email: parsed.email },
      slot: {
        start: start.toISOString(),
        pet: parsed.pet,
        owner: parsed.owner,
        reason: parsed.kind,
        status: "gelegt",
      },
      kontakt: { owner: parsed.owner, phone: parsed.phone, email: parsed.email },
    });
    return {
      ok: true as const,
      id,
      pet: parsed.pet,
      owner: parsed.owner,
      phone: parsed.phone,
      email: parsed.email,
      confirm,
      start: start.toISOString(),
    };
  });

export const updatePatientContact = createServerFn({ method: "POST" })
  .validator((input: {
    id?: string;
    owner?: string;
    phone?: string;
    email?: string;
    species?: string;
    chip?: string;
    notes?: string;
  }) => ({
    id: String(input?.id ?? "").slice(0, 80),
    owner: String(input?.owner ?? "").trim().slice(0, 80),
    phone: String(input?.phone ?? "").replace(/\s/g, "").slice(0, 24),
    email: String(input?.email ?? "").trim().toLowerCase().slice(0, 120),
    species: String(input?.species ?? "").trim().slice(0, 40),
    chip: String(input?.chip ?? "").replace(/\D/g, "").slice(0, 15),
    notes: String(input?.notes ?? "").trim().slice(0, 400),
  }))
  .handler(async ({ data }) => {
    if (!data.id || data.owner.length < 2) return { ok: false as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { sanitizeHalterinEmail } = await import("@/lib/alma/phone");
    const { contactChanged, sanitizePatientChip, sanitizePatientNotes, sanitizePatientSpecies } =
      await import("./patient-query");
    const email = sanitizeHalterinEmail(data.email);
    const species = sanitizePatientSpecies(data.species);
    const chip = sanitizePatientChip(data.chip);
    const notes = sanitizePatientNotes(data.notes);
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const prev = await sql<{ name: string; phone: string; email: string }>`
      select name, phone, email from patients
      where id = ${data.id} and practice_id = ${session.practiceId}
      limit 1
    `;
    if (!prev[0]) return { ok: false as const };
    const rows = await sql<{ id: string }>`
      update patients
      set owner_name = ${data.owner}, phone = ${data.phone}, email = ${email},
          species = ${species}, chip = ${chip}, notes = ${notes}
      where id = ${data.id} and practice_id = ${session.practiceId}
      returning id
    `;
    if (!rows[0]) return { ok: false as const };
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    if (contactChanged(prev[0], { phone: data.phone, email })) {
      const { protocolContactFollowUp } = await import("@/lib/alma/protocol");
      const { appendInternContact } = await import("./write-protocol");
      const ownerName = profile?.ownerName || session.userName || "Frau Doktor";
      await appendInternContact(sql, {
        practiceId: session.practiceId,
        internName: `${ownerName} · intern`,
        pet: prev[0].name,
        subject: `Kontakt: ${prev[0].name} · ${data.owner || "Klientel"}`,
        body: protocolContactFollowUp({
          pet: prev[0].name,
          owner: data.owner,
          phone: data.phone || prev[0].phone,
          email: email || prev[0].email,
          practiceName: profile?.name || session.practiceName,
        }),
        mailTo: internPracticeInbox(profile?.email, session.email),
      });
    }
    const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
    await offerTafelToSpiegel(sql, session.practiceId, profile?.pms, {
      akte: { pet: prev[0].name, owner: data.owner, phone: data.phone, email, chip },
      kontakt: { owner: data.owner, phone: data.phone, email },
    });
    return { ok: true as const };
  });

export const createAkte = createServerFn({ method: "POST" })
  .validator((input: { pet?: string; owner?: string; phone?: string; email?: string }) => ({
    pet: String(input?.pet ?? "").trim().slice(0, 40),
    owner: String(input?.owner ?? "").trim().slice(0, 80),
    phone: String(input?.phone ?? "").replace(/\s/g, "").slice(0, 24),
    email: String(input?.email ?? "").trim().toLowerCase().slice(0, 120),
  }))
  .handler(async ({ data }) => {
    const { parseNewAkte, pickPatientMatch } = await import("./patient-query");
    const parsed = parseNewAkte(data);
    if (!parsed) return { ok: false as const, error: "tier-owner" as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { getSql } = await import("@/lib/db.server");
    const { newId } = await import("./crypto");
    const sql = await getSql();
    const named = await sql<{
      id: string;
      name: string;
      owner_name: string;
      phone: string;
      email: string;
      chip: string;
    }>`
      select id, name, owner_name, phone, email, chip from patients
      where practice_id = ${session.practiceId}
        and lower(name) = ${parsed.pet.toLowerCase()}
    `;
    const existing = pickPatientMatch(named, {
      name: parsed.pet,
      owner: parsed.owner,
      phone: parsed.phone,
    });
    const note = `Tafel: Akte`;
    let id = existing?.id ?? "";
    let created = false;
    if (existing) {
      await sql`
        update patients
        set last_visit = ${note},
            last_call_note = ${note},
            last_call_at = now(),
            owner_name = ${parsed.owner},
            phone = case when ${parsed.phone} = '' then phone else ${parsed.phone} end,
            email = case when ${parsed.email} = '' then email else ${parsed.email} end
        where id = ${existing.id} and practice_id = ${session.practiceId}
      `;
    } else {
      id = newId();
      created = true;
      await sql`
        insert into patients (
          id, practice_id, name, species, owner_name, phone, email, notes, last_visit, source, last_call_note, last_call_at
        ) values (
          ${id},
          ${session.practiceId},
          ${parsed.pet},
          ${""},
          ${parsed.owner},
          ${parsed.phone},
          ${parsed.email},
          ${note},
          ${note},
          ${"kassa"},
          ${note},
          now()
        )
      `;
    }
    const { fetchProfile } = await import("./profile-data.server");
    const profile = await fetchProfile(session.practiceId);
    const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
    await offerTafelToSpiegel(sql, session.practiceId, profile?.pms, {
      akte: { pet: parsed.pet, owner: parsed.owner, phone: parsed.phone, email: parsed.email },
      kontakt: { owner: parsed.owner, phone: parsed.phone, email: parsed.email },
    });
    return { ok: true as const, id, created };
  });

export const loadPatientById = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, patient: null };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      chip: string;
      name: string;
      species: string;
      owner_name: string;
      phone: string;
      email: string;
      source: string;
      last_call_note: string | null;
      last_visit: string | null;
      notes: string;
    }>`
      select id, chip, name, species, owner_name, phone, email, source, last_call_note, last_visit, notes
      from patients
      where practice_id = ${session.practiceId} and id = ${data.id}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, patient: null };
    return {
      ok: true as const,
      patient: {
        id: row.id,
        chip: row.chip || "",
        name: row.name,
        species: row.species || "",
        owner_name: row.owner_name || "",
        phone: row.phone || "",
        email: row.email || "",
        source: row.source || "",
        last_call_note: row.last_call_note ?? "",
        last_visit: row.last_visit ?? "",
        notes: row.notes || "",
      },
    };
  });

export const searchPatients = createServerFn({ method: "POST" })
  .validator((input: { q?: string }) => ({
    q: String(input?.q ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { patientPhoneDigits, patientSearchNeedle } = await import("./patient-query");
    const needle = patientSearchNeedle(data.q);
    const like = needle ? `%${needle}%` : "";
    const digits = patientPhoneDigits(needle);
    const phoneLike = digits.length >= 3 ? `%${digits}%` : "";
    const rows = needle
      ? await sql<{
          id: string;
          chip: string;
          name: string;
          species: string;
          owner_name: string;
          phone: string;
          email: string;
          source: string;
          last_call_note: string | null;
          last_visit: string | null;
          notes: string;
        }>`
          select id, chip, name, species, owner_name, phone, email, source, last_call_note, last_visit, notes
          from patients
          where practice_id = ${session.practiceId}
            and (
              lower(name) like ${like}
              or lower(owner_name) like ${like}
              or lower(chip) like ${like}
              or lower(email) like ${like}
              or (${phoneLike} <> '' and replace(replace(phone, ' ', ''), '-', '') like ${phoneLike})
            )
          order by name asc
          limit 40
        `
      : await sql<{
          id: string;
          chip: string;
          name: string;
          species: string;
          owner_name: string;
          phone: string;
          email: string;
          source: string;
          last_call_note: string | null;
          last_visit: string | null;
          notes: string;
        }>`
          select id, chip, name, species, owner_name, phone, email, source, last_call_note, last_visit, notes
          from patients
          where practice_id = ${session.practiceId}
          order by name asc
          limit 40
        `;
    const totalRows = await sql<{ n: number }>`
      select count(*)::int as n from patients where practice_id = ${session.practiceId}
    `;
    return {
      ok: true as const,
      total: Number(totalRows[0]?.n) || 0,
      matched: rows.length,
      patients: rows.map((p) => ({
        id: p.id,
        chip: p.chip || "",
        name: p.name,
        species: p.species || "",
        owner_name: p.owner_name || "",
        phone: p.phone || "",
        email: p.email || "",
        source: p.source || "",
        last_call_note: p.last_call_note ?? "",
        last_visit: p.last_visit ?? "",
        notes: p.notes || "",
      })),
    };
  });

export const searchCalls = createServerFn({ method: "POST" })
  .validator((input: { q?: string }) => ({
    q: String(input?.q ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { callSearchNeedle } = await import("./call-query");
    const { patientPhoneDigits } = await import("./patient-query");
    const { fetchPracticeCalls, mapCallRow } = await import("./call-rows");
    const needle = callSearchNeedle(data.q);
    if (!needle) {
      return { ok: true as const, calls: [] as ReturnType<typeof mapCallRow>[] };
    }
    const like = `%${needle}%`;
    const digits = patientPhoneDigits(needle);
    const phoneLike = digits.length >= 3 ? `%${digits}%` : "";
    const rows = await fetchPracticeCalls(sql, session.practiceId, {
      like,
      phoneLike,
      limit: 40,
    });
    return { ok: true as const, calls: rows.map(mapCallRow) };
  });

export const loadCallById = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, call: null };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { fetchPracticeCalls, mapCallRow } = await import("./call-rows");
    const rows = await fetchPracticeCalls(sql, session.practiceId, { id: data.id, limit: 1 });
    const call = rows[0] ? mapCallRow(rows[0]) : null;
    return call ? { ok: true as const, call } : { ok: false as const, call: null };
  });

export const searchProtocol = createServerFn({ method: "POST" })
  .validator((input: { q?: string }) => ({
    q: String(input?.q ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { protocolSearchNeedle } = await import("./protocol-query");
    const { patientPhoneDigits } = await import("./patient-query");
    const { fetchPracticeThreads, fetchPracticeMails, mapThreadRow, mapMailRow } = await import("./protocol-rows");
    const needle = protocolSearchNeedle(data.q);
    if (!needle) {
      return {
        ok: true as const,
        threads: [] as ReturnType<typeof mapThreadRow>[],
        mails: [] as ReturnType<typeof mapMailRow>[],
      };
    }
    const like = `%${needle}%`;
    const digits = patientPhoneDigits(needle);
    const phoneLike = digits.length >= 3 ? `%${digits}%` : "";
    const [threadRows, mailRows] = await Promise.all([
      fetchPracticeThreads(sql, session.practiceId, { like, phoneLike, limit: 40 }),
      fetchPracticeMails(sql, session.practiceId, { like, limit: 40 }),
    ]);
    return {
      ok: true as const,
      threads: threadRows.map(mapThreadRow),
      mails: mailRows.map(mapMailRow),
    };
  });

export const loadThreadById = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, thread: null };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { fetchPracticeThreads, mapThreadRow } = await import("./protocol-rows");
    const rows = await fetchPracticeThreads(sql, session.practiceId, { id: data.id, limit: 1 });
    const thread = rows[0] ? mapThreadRow(rows[0]) : null;
    return thread ? { ok: true as const, thread } : { ok: false as const, thread: null };
  });

export const loadMailById = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, mail: null };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { fetchPracticeMails, mapMailRow } = await import("./protocol-rows");
    const rows = await fetchPracticeMails(sql, session.practiceId, { id: data.id, limit: 1 });
    const mail = rows[0] ? mapMailRow(rows[0]) : null;
    return mail ? { ok: true as const, mail } : { ok: false as const, mail: null };
  });

export const searchEmergencies = createServerFn({ method: "POST" })
  .validator((input: { q?: string }) => ({
    q: String(input?.q ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { emergencySearchNeedle } = await import("./emergency-query");
    const { patientPhoneDigits } = await import("./patient-query");
    const { fetchPracticeEmergencies, mapEmergencyRow } = await import("./emergency-rows");
    const needle = emergencySearchNeedle(data.q);
    if (!needle) {
      return { ok: true as const, emergencies: [] as ReturnType<typeof mapEmergencyRow>[] };
    }
    const like = `%${needle}%`;
    const digits = patientPhoneDigits(needle);
    const phoneLike = digits.length >= 3 ? `%${digits}%` : "";
    const rows = await fetchPracticeEmergencies(sql, session.practiceId, {
      like,
      phoneLike,
      limit: 40,
    });
    return { ok: true as const, emergencies: rows.map(mapEmergencyRow) };
  });

export const loadEmergencyById = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const, emergency: null };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { fetchPracticeEmergencies, mapEmergencyRow } = await import("./emergency-rows");
    const rows = await fetchPracticeEmergencies(sql, session.practiceId, { id: data.id, limit: 1 });
    const emergency = rows[0] ? mapEmergencyRow(rows[0]) : null;
    return emergency ? { ok: true as const, emergency } : { ok: false as const, emergency: null };
  });

export const loadEmergencyAudit = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({
    id: String(input?.id ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    if (!data.id) return { events: [] as ReturnType<typeof mapEmergencyAuditRow>[] };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { fetchEmergencyAudit, mapEmergencyAuditRow } = await import("./emergency-audit");
    const rows = await fetchEmergencyAudit(sql, session.practiceId, data.id);
    return { events: rows.map(mapEmergencyAuditRow) };
  });



