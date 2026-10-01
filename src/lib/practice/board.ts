import { createServerFn } from "@tanstack/react-start";
import { guessPet, type SilviaAction } from "@/lib/alma/actions";
import { firstHandy, internPracticeInbox, toWaMeNumber } from "@/lib/alma/phone";
import { spokenNachtdienstDest } from "@/lib/alma/desk";
import { emergencyBoardAction, isPlaceholderPet } from "@/lib/alma/protocol";
import type { Sql } from "@/lib/db";
import {
  isShortBookingConfirmation,
  validStoredAppointment,
  type StoredPracticeAppointment,
} from "./appointment-confirmation";
export { isShortBookingConfirmation } from "./appointment-confirmation";
import type { LastWalkIn, LiveKassaDraft, LiveReachDraft } from "./walk-in-last";

type TranscriptLine = { from: "anrufer" | "alma"; text: string };

async function newPracticeId(): Promise<string> {
  const { newId } = await import("./crypto");
  return newId();
}

/** Kein Buchungsclaim, wenn der Persistenzpfad keinen konkreten Slot hat. */
export function persistedBookingAction(start: Date | null, label: string): string {
  return start && Number.isFinite(start.getTime()) ? label : "Auskunft hinterlegt";
}

/** Nur die atomare Datenbankbuchung darf einen Termin verbindlich bestätigen. */
export const APPOINTMENT_SLOT_CONFLICT_REPLY =
  "Der gewünschte Termin wurde gerade vergeben. Ich habe keinen Termin eingetragen. Bitte nennen Sie einen anderen Zeitpunkt.";

/** Die Praxissoftware kann bereits verbindlich gebucht haben, obwohl die Tafel veraltet ist. */
export const CONNECTOR_SLOT_CONFLICT_REPLY =
  "Der Termin wurde in der Praxissoftware bestätigt, aber die Tafel meldet einen Konflikt. Bitte prüfen Sie ihn sofort in der Praxissoftware.";

export function boardUserSearchText(user: string, lines: { role: "user" | "assistant"; content?: string }[]): string {
  return [user, ...lines.filter((line) => line.role === "user").map((line) => String(line.content ?? ""))]
    .filter(Boolean)
    .join("\n");
}

/** Auskünfte dürfen aus dem vollständigen Gespräch keine neue Patientenkarte ableiten. */
export function patientNameForPersistence(action: Pick<SilviaAction, "type" | "kind" | "pet">): string {
  if (action.type === "none" && action.kind === "Info") return "";
  return isPlaceholderPet(action.pet) ? "" : String(action.pet ?? "").trim();
}

export function latestUserMention(
  current: string,
  lines: { role: "user" | "assistant"; content?: string }[],
  extract: (text: string) => string,
): string {
  return [current, ...lines.filter((line) => line.role === "user").reverse().map((line) => String(line.content ?? ""))]
    .map(extract)
    .find(Boolean) ?? "";
}

export function contactPetForPersistence(pet: string, currentMessage: string, contactOnly: boolean): string {
  if (!contactOnly) return pet;
  const explicit = guessPet(currentMessage, { includeDemo: false });
  return isPlaceholderPet(explicit) ? "" : explicit;
}

/** Gleiche Rufnummer nicht nur wegen +43/0 anders speichern. */
export function keepKnownPhone(stored: string, spoken: string): string {
  const known = String(stored ?? "").trim();
  const heard = String(spoken ?? "").trim();
  return heard && toWaMeNumber(heard) !== toWaMeNumber(known) ? heard : known || heard;
}

/**
 * AP 55: Bestimmt den ersten echten Assistenten-Turn eines Anrufs.
 * Bevorzugt das explizite `firstTurn`-Flag der Aufrufer — die alte Heuristik
 * (<= 1 Assistenten-Zeile) zaehlte beim Web-Call falsch, weil `sprechen-call.tsx`
 * die Begruessung immer als erste Assistenten-Zeile vorbelegt (Begruessung + Antwort
 * = 2 Zeilen beim ersten echten Turn, nicht 1). Fallback auf die Heuristik nur wenn
 * das Flag fehlt (Abwaertskompatibilitaet fuer aeltere Aufrufer).
 */
export function resolveFirstTurn(
  lines: { role: "user" | "assistant" }[],
  firstTurn?: boolean,
): boolean {
  if (typeof firstTurn === "boolean") return firstTurn;
  return lines.filter((l) => l.role === "assistant").length <= 1;
}

export const persistBoardEvent = createServerFn({ method: "POST" })
  .validator((input: {
    user: string;
    reply: string;
    action: SilviaAction;
    lines: { role: "user" | "assistant"; content: string }[];
    line?: string;
    confirmId?: string;
    /** AP 27: explizite Quelle fuer die Telefon-Bruecke (POST /api/telefon/antwort).
     * Ohne Angabe bleibt das bisherige Verhalten (inbound web-Leitung vs. Tafel-Kassa) unveraendert. */
    channel?: "telefon" | "web";
    /** AP 55: explizites Signal des Aufrufers, ob dies der erste echte Assistenten-Turn
     * dieses Anrufs ist (fuer den Einwilligungs-Zeitstempel). Optional fuer Abwaertskompatibilitaet. */
    firstTurn?: boolean;
    /** AP 56: externe Anruf-ID des Telefon-Gateways (POST /api/telefon/antwort), wird
     * auf calls.external_call_id gespeichert, damit ein Abschluss-Ping die passende
     * calls-Zeile ueber diese ID (statt der internen calls.id) wiederfinden kann. */
    callId?: string;
    /** AP 59: Idempotenz-Schluessel des Turns (callId + Turn-Nummer). Wird als
     * calls.idempotency_key gespeichert; der eindeutige Index (Migration 0034)
     * verhindert, dass ein Gateway-Retry denselben Turn doppelt anlegt. Ohne
     * Angabe (Web-/sonstige Zeilen) bleibt die Spalte NULL und wird nicht erfasst. */
    idempotencyKey?: string;
  }) => ({
    user: String(input?.user ?? "").slice(0, 1200),
    reply: String(input?.reply ?? "").slice(0, 1200),
    action: input?.action ?? { type: "none", owner: "", pet: "", kind: "", concern: "", summary: "" },
    lines: Array.isArray(input?.lines) ? input.lines.slice(-20) : [],
    line: String(input?.line ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 48),
    confirmId: String(input?.confirmId ?? "").slice(0, 80),
    channel: input?.channel === "telefon" || input?.channel === "web" ? input.channel : undefined,
    firstTurn: typeof input?.firstTurn === "boolean" ? input.firstTurn : undefined,
    callId: String(input?.callId ?? "").slice(0, 80),
    idempotencyKey: String(input?.idempotencyKey ?? "").slice(0, 120),
  }))
  .handler(async ({ data }) => {
    const { readPracticeSession } = await import("./session.server");
    const session = await readPracticeSession();
    const { fetchProfile, fetchProfileBySlug } = await import("./profile-data.server");
    const inbound = data.line ? await fetchProfileBySlug(data.line) : null;
    const staffProfile = !inbound && session ? await fetchProfile(session.practiceId) : null;
    const profile = inbound ?? staffProfile;
    const practiceId = profile?.id ?? session?.practiceId;
    if (!practiceId) return { ok: false as const, reason: "anonymous" as const };

    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const blocked = tafelWriteBlock();
    if (blocked) return { ok: false as const, error: blocked.error };
    const { dayIso, nextFreeSlotAt, parseHourWindows, formatSlot } = await import("@/lib/alma/hours");
    const { nextLocalRequestedSlot } = await import("@/lib/alma/appointment-preference");
    const { fillActionNames, guessSpecies } = await import("@/lib/alma/actions");
    const { internProtocolPet, isPlaceholderPet } = await import("@/lib/alma/protocol");
    const { deskFromProfile, isLeftoverAuskunft, notesEmptyDeskAction, notesLiveReply, skipLiveInternZettel } = await import("@/lib/alma/desk");
    const { guessEmail, guessPhone, isContactOnlyTurn, isCallbackTurn, isKassaTransferTurn, bookedCallAction, booksDeskSlot } = await import("@/lib/alma/phone");
    const userBlob = boardUserSearchText(data.user, data.lines);
    const desk = profile ? deskFromProfile(profile) : null;
    let action = fillActionNames(data.action, userBlob || data.user, { includeDemo: Boolean(desk?.isDemo) });
    if (action.type === "train") {
      return { ok: false as const, reason: "train" as const };
    }
    let notesSkip = false;
    let preserveBookConfirmation = false;
    if (desk && !desk.isDemo) {
      const { fetchFacts } = await import("./facts.server");
      const facts = (await fetchFacts(practiceId)).map((f) => f.fact);
      const { loadPracticePatients } = await import("./profile-data.server");
      const { lookupPatient } = await import("@/lib/alma/patients");
      const kb = await loadPracticePatients(practiceId, userBlob || data.user);
      const found = Boolean(lookupPatient(userBlob || data.user, kb, { includeDemo: false }));
      const priorUserWantsAppointment = data.lines
        .filter((line, index) => line.role === "user" && index < data.lines.length - 1)
        .some((line) => /\btermin\b|\bslot\b|impfung|kastration/i.test(String(line.content ?? "")));
      preserveBookConfirmation = found && isShortBookingConfirmation(data.user) && priorUserWantsAppointment;
      action = notesEmptyDeskAction(action, data.user, desk, facts, found);
      notesSkip = !preserveBookConfirmation && Boolean(notesLiveReply(data.user, desk, facts, found));
      if (isLeftoverAuskunft(data.user) && action.type === "book" && !preserveBookConfirmation) {
        action = { ...action, type: "none", kind: "Info" };
      }
    }
    const callId = await newPracticeId();
    const species = action.species || guessSpecies(`${action.pet} ${data.user}`);
    const status = action.type === "emergency" ? "notfall" : "offen";
    // AP 53/55: erster Assistenten-Turn eines Anrufs — Einwilligungsansage wurde gerade
    // in der Begruessung gesagt (greetingWithConsent). Nur dieser Anruf-Datensatz
    // bekommt den Zeitstempel, kein PII, nur wann. resolveFirstTurn() nutzt das
    // explizite firstTurn-Flag der Aufrufer statt der bruechigen Zeilen-Heuristik.
    const isFirstAssistantTurn = resolveFirstTurn(data.lines, data.firstTurn);
    const consentAnnouncedAt =
      isFirstAssistantTurn && Boolean(profile?.consentEnabled) ? new Date() : null;
    const transcript: TranscriptLine[] = data.lines.map((l) => ({
      from: l.role === "assistant" ? "alma" : "anrufer",
      text: String(l.content ?? "").slice(0, 1200),
    }));
    const nightName =
      spokenNachtdienstDest(profile?.nachtdienstName ?? "", profile?.nachtdienstPhone ?? "") || "Nachtdienst";
    const nightPhone = profile?.nachtdienstPhone?.trim() || "";
    const ownerName = profile?.ownerName || session?.userName || "Frau Doktor";
    const practiceName = profile?.name || session?.practiceName || "Ordination";
    const mailTo = internPracticeInbox(profile?.email, session?.email);
    const spokenForTicket = userBlob || data.user;
    const callback = isCallbackTurn(action.kind, spokenForTicket);
    const kassa = !callback && isKassaTransferTurn(action.kind, spokenForTicket);
    // Warteliste: gewuenschter Tag ist ausgebucht — Silvia vermerkt die Anruferin
    // fuer einen Rueckruf statt einer Sackgasse (kein Slot, kein Termin).
    const waitlist = action.kind === "Warteliste";
    const skipIntern = skipLiveInternZettel({
      message: preserveBookConfirmation ? "Termin" : data.user,
      actionType: action.type,
      kind: action.kind,
      isDemo: Boolean(desk?.isDemo),
      notesSkip,
      callback,
      kassa,
    });
    const protocolAction =
      callback && !/rückruf/i.test(action.kind)
        ? { ...action, kind: "Rückruf", summary: action.summary || "Rückrufbitte" }
        : kassa && !/^kassa$/i.test(action.kind)
          ? { ...action, kind: "Kassa", summary: action.summary || "An die Tierarzthelferin übergeben" }
          : action;
    // AP 7d Teil 2: connectorApplied ist nur nach einem erfolgreichen createAppointment() in
    // booking.ts gesetzt (Connector-Pfad, nur mit beiden Freigaben) — dann steht der Connector-Satz
    // ("in Vquadrat eingetragen (Nr. ...)") in action.summary. Ohne die Freigaben bleibt
    // connectorApplied immer undefined und dieser Zweig greift nie (unveraendertes Verhalten).
    const windows = parseHourWindows(profile?.hours ?? []);
    const { loadOccupiedSlots } = await import("./occupied");
    const occupied = await loadOccupiedSlots(sql, practiceId);
    // Waehrend der Connector-Verhandlung (Vorschlag, noch nicht bestaetigt: connectorStart
    // gesetzt, connectorApplied noch false) legt die Tafel noch KEINEN Termin an — erst nach
    // erfolgreichem createAppointment(), dann mit dem tatsaechlich gebuchten Connector-Slot.
    const awaitingConnectorConfirm = Boolean(action.connectorStart) && !action.connectorApplied;
    const preferredStart = action.preferredDate
      ? nextLocalRequestedSlot(profile?.hours ?? [], occupied, action.preferredDate)
      : nextFreeSlotAt(windows, occupied);
    const start =
      booksDeskSlot(action, spokenForTicket) && !awaitingConnectorConfirm
        ? action.connectorStart
          ? new Date(action.connectorStart)
          : action.preferredDate && (!preferredStart || dayIso(preferredStart) !== action.preferredDate)
            ? null
            : preferredStart
        : null;
    let confirmedExistingAppointment: { id: string; start: Date } | null = null;
    let connectorLocalConflict = false;
    const connectorAppointmentId = Array.from(String(action.connectorAppointmentId ?? ""), (char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? " " : char;
    })
      .join("")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (
      data.confirmId &&
      action.type === "book" &&
      !callback &&
      !kassa &&
      isShortBookingConfirmation(data.user) &&
      !inbound
    ) {
      const confirmed = await sql<StoredPracticeAppointment>`
        select id, practice_id, start_at, status, owner_name, pet from appointments
        where id = ${data.confirmId}
          and practice_id = ${practiceId}
        limit 1
      `;
      if (!validStoredAppointment(confirmed[0], data.confirmId, practiceId)) {
        return {
          ok: false as const,
          error: "Die Terminbestätigung ist nicht mehr gültig. Bitte laden Sie den Termin neu.",
        };
      }
      const confirmedStart = new Date(confirmed[0].start_at);
      confirmedExistingAppointment = { id: confirmed[0].id, start: confirmedStart };
    }
    const contactOnlyTurn = !callback && !kassa && isContactOnlyTurn(action.type, data.user);
    let petName = patientNameForPersistence(action);
    petName = contactPetForPersistence(petName, data.user, contactOnlyTurn);
    const spokenPhone = latestUserMention(data.user, data.lines, guessPhone);
    const spokenEmail = latestUserMention(data.user, data.lines, guessEmail);
    const handyOnly = contactOnlyTurn;
    const note = (action.akteNote || action.concern || data.user).trim().slice(0, 220);
    const spokenOwner = action.owner && action.owner !== "Klientel" ? action.owner : "";
    let holderPhone = spokenPhone;
    let holderEmail = spokenEmail;
    let holderOwner = spokenOwner;
    if (petName) {
      const named = await sql<{
        id: string;
        notes: string;
        owner_name: string;
        phone: string;
        email: string;
        chip: string;
        name: string;
      }>`
        select id, notes, owner_name, phone, email, chip, name from patients
        where practice_id = ${practiceId}
          and lower(name) = ${petName.toLowerCase()}
      `;
      const { pickPatientMatch } = await import("./patient-query");
      const existing = pickPatientMatch(named, {
        name: petName,
        owner: spokenOwner,
        phone: spokenPhone,
        chip: action.chip,
      });
      if (existing) {
        const row = named.find((item) => item.id === existing.id) ?? named[0];
        const nextNotes = [row.notes, note]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
          .join(" · ")
          .slice(0, 400);
        const nextOwner = spokenOwner || row.owner_name || "Klientel";
        const nextPhone = keepKnownPhone(row.phone, spokenPhone);
        const nextEmail = spokenEmail || row.email || "";
        holderOwner = nextOwner;
        holderPhone = nextPhone;
        holderEmail = nextEmail;
        await sql`
          update patients
          set last_visit = ${`Telefonat: ${note}`},
              last_call_at = now(),
              last_call_note = ${note},
              notes = ${nextNotes},
              owner_name = ${nextOwner},
              phone = ${nextPhone},
              email = ${nextEmail}
          where id = ${row.id}
        `;
      } else {
        await sql`
          insert into patients (
            id, practice_id, chip, name, species, owner_name, phone, email, notes, last_visit, source, last_call_note, last_call_at
          ) values (
            ${await newPracticeId()},
            ${practiceId},
            ${action.chip || ""},
            ${petName},
            ${species},
            ${spokenOwner || "Klientel"},
            ${spokenPhone},
            ${spokenEmail},
            ${note},
            ${`Telefonat: ${note}`},
            ${"telefon"},
            ${note},
            now()
          )
        `;
      }
    }

    if (handyOnly) {
      let intern = null as Awaited<ReturnType<typeof liveInternForThread>>;
      const { confirmAfterContactFollowUp, pickConfirmSlotAfterContact, skipInternAfterConfirmFollowUp } = await import("./walk-in-last");
      const recentSlots = inbound
        ? []
        : await sql<{ id: string; pet: string; owner_name: string; start_at: string | Date }>`
            select id, pet, owner_name, start_at from appointments
            where practice_id = ${practiceId}
              and status = 'gelegt'
              and created_at > now() - interval '15 minutes'
            order by created_at desc
            limit 8
          `;
      let storedSlot = [] as typeof recentSlots;
      if (!inbound && data.confirmId) {
        storedSlot = await sql<{ id: string; pet: string; owner_name: string; start_at: string | Date }>`
          select id, pet, owner_name, start_at from appointments
          where practice_id = ${practiceId}
            and status = 'gelegt'
            and id = ${data.confirmId}
          limit 1
        `;
      }
      const seen = new Set<string>();
      const slots = [...storedSlot, ...recentSlots]
        .filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        })
        .map((row) => ({
          id: row.id,
          pet: row.pet,
          owner: row.owner_name,
          startAt: row.start_at,
        }));
      const slot = pickConfirmSlotAfterContact({
        confirmId: data.confirmId,
        pet: petName,
        owner: holderOwner,
        slots,
      });
      const confirm = confirmAfterContactFollowUp({
        inbound: Boolean(inbound),
        slot,
        phone: holderPhone,
        email: holderEmail,
        owner: holderOwner,
        pet: petName || slot?.pet,
        practiceName,
      });
      if (
        !skipInternAfterConfirmFollowUp({ inbound: Boolean(inbound), confirm }) &&
        (spokenPhone || spokenEmail || spokenOwner)
      ) {
        const { protocolContactFollowUp } = await import("@/lib/alma/protocol");
        const { appendInternContact } = await import("./write-protocol");
        const internPet = internProtocolPet(petName, holderOwner);
        const internWrite = await appendInternContact(sql, {
          practiceId,
          internName: `${ownerName} · intern`,
          pet: petName || "Patient",
          owner: holderOwner,
          subject: `Kontakt: ${internPet} · ${spokenOwner || "Klientel"}`,
          body: protocolContactFollowUp({
            pet: internPet,
            owner: spokenOwner,
            phone: spokenPhone,
            email: spokenEmail,
            practiceName,
          }),
          mailTo,
        });
        intern = inbound
          ? null
          : await liveInternForThread(sql, {
              practiceId,
              threadId: internWrite.id,
              ownerName,
              whatsapp: profile?.whatsapp || "",
              phone: profile?.phone || "",
              email: mailTo,
            });
      }
      const confirmOwner = String(holderOwner || slot?.owner || "").trim();
      if (
        !inbound &&
        slot &&
        confirmOwner &&
        confirmOwner !== "Klientel" &&
        (holderPhone || holderEmail)
      ) {
        const { pickConfirmOwnerRow } = await import("./patient-query");
        const owned = await sql<{ id: string; owner_name: string; phone: string; email: string }>`
          select id, owner_name, phone, email from patients
          where practice_id = ${practiceId}
            and owner_name <> '' and owner_name <> 'Klientel'
          order by coalesce(last_call_at, created_at) desc
          limit 24
        `;
        const row = pickConfirmOwnerRow(owned, confirmOwner);
        if (row) {
          await sql`
            update patients
            set phone = ${holderPhone || row.phone},
                email = ${holderEmail || row.email},
                last_call_at = now()
            where id = ${row.id} and practice_id = ${practiceId}
          `;
        } else {
          const slotPet = String(petName || slot.pet || "").trim();
          await sql`
            insert into patients (
              id, practice_id, chip, name, species, owner_name, phone, email, notes, last_visit, source, last_call_note, last_call_at
            ) values (
              ${await newPracticeId()},
              ${practiceId},
              ${""},
              ${slotPet && !isPlaceholderPet(slotPet) ? slotPet : "Patient"},
              ${""},
              ${confirmOwner},
              ${holderPhone},
              ${holderEmail},
              ${""},
              ${""},
              ${"telefon"},
              ${"Handy nach dem Termin"},
              now()
            )
          `;
        }
      }
      const recentRueckruf = inbound
        ? []
        : await sql<{ id: string; caller: string; pet: string; concern: string; transcript: unknown }>`
            select id, caller, pet, concern, transcript from calls
            where practice_id = ${practiceId}
              and action = ${"Rückrufzettel"}
              and created_at > now() - interval '15 minutes'
            order by created_at desc
            limit 1
          `;
      const { reachAfterContactFollowUp } = await import("./walk-in-last");
      const reach = reachAfterContactFollowUp({
        inbound: Boolean(inbound),
        call: recentRueckruf[0] ?? null,
        phone: holderPhone,
        email: holderEmail,
        owner: holderOwner,
        pet: petName,
        practiceName,
      });
      if (recentRueckruf[0] && (holderPhone || holderEmail || (holderOwner && holderOwner !== "Klientel"))) {
        const { applyReachToRueckrufCall } = await import("./call-contact");
        const next = applyReachToRueckrufCall({
          concern: recentRueckruf[0].concern,
          caller: recentRueckruf[0].caller,
          transcript: recentRueckruf[0].transcript,
          pet: recentRueckruf[0].pet,
          phone: holderPhone,
          email: holderEmail,
          owner: holderOwner,
          spoken: data.user,
        });
        await sql`
          update calls
          set caller = ${next.caller},
              pet = ${next.pet},
              concern = ${next.concern},
              transcript = ${JSON.stringify(next.transcript)}::jsonb
          where id = ${recentRueckruf[0].id} and practice_id = ${practiceId}
        `;
      }
      const recentEmergency = inbound
        ? []
        : await sql<{ id: string; owner_name: string; pet: string; summary: string }>`
            select id, owner_name, pet, summary from emergencies
            where practice_id = ${practiceId}
              and at > now() - interval '15 minutes'
              and status <> ${"abgeschlossen"}
            order by at desc
            limit 1
          `;
      if (recentEmergency[0] && (holderPhone || holderEmail || (holderOwner && holderOwner !== "Klientel"))) {
        const { applyReachToEmergency } = await import("./call-contact");
        const next = applyReachToEmergency({
          summary: recentEmergency[0].summary,
          owner_name: recentEmergency[0].owner_name,
          pet: recentEmergency[0].pet,
          phone: holderPhone,
          email: holderEmail,
          owner: holderOwner,
        });
        await sql`
          update emergencies
          set owner_name = ${next.owner_name},
              pet = ${next.pet},
              summary = ${next.summary}
          where id = ${recentEmergency[0].id} and practice_id = ${practiceId}
        `;
      }
      const recentKlientel = inbound
        ? []
        : await sql<{ id: string; name: string; pet: string; preview: string; messages: unknown }>`
            select id, name, pet, preview, messages from threads
            where practice_id = ${practiceId}
              and intern = false
              and created_at > now() - interval '15 minutes'
            order by created_at desc
            limit 1
          `;
      if (recentKlientel[0] && (holderPhone || holderEmail || (holderOwner && holderOwner !== "Klientel"))) {
        const { applyReachToThread } = await import("./call-contact");
        const next = applyReachToThread({
          name: recentKlientel[0].name,
          preview: recentKlientel[0].preview,
          messages: recentKlientel[0].messages,
          pet: recentKlientel[0].pet,
          phone: holderPhone,
          email: holderEmail,
          owner: holderOwner,
          spoken: data.user,
        });
        await sql`
          update threads
          set name = ${next.name},
              pet = ${next.pet},
              preview = ${next.preview},
              messages = ${JSON.stringify(next.messages)}::jsonb
          where id = ${recentKlientel[0].id} and practice_id = ${practiceId}
        `;
      }
      const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
      await offerTafelToSpiegel(sql, practiceId, profile?.pms, {
        akte: { pet: petName, owner: holderOwner, phone: holderPhone, email: holderEmail },
        kontakt: { owner: holderOwner, phone: holderPhone, email: holderEmail },
      });
      return {
        ok: true as const,
        callId: recentRueckruf[0]?.id ?? "",
        subject: spokenEmail && !spokenPhone && !spokenOwner ? "E-Mail" : spokenOwner ? "Halterin" : "Handy",
        confirm,
        intern,
        internSkipped: false,
        ...(reach ? { reach } : {}),
      };
    }

    if (start && !confirmedExistingAppointment) {
      const claimed = await sql<{ outcome: string }>`
        select reserve_appointment_slot_atomic(
          ${`b-${callId}`}, ${practiceId}, ${start.toISOString()}, ${20},
          ${action.owner || "Klientel"}, ${action.pet || "Patient"}, ${action.kind || "Termin"},
          ${ownerName}, ${data.channel ?? (inbound ? "web" : "telefon")}, ${"gelegt"}
        ) as outcome
      `;
      if (claimed[0]?.outcome !== "applied") {
        const externalBooking = Boolean(
          action.connectorApplied && connectorAppointmentId && data.channel === "telefon" && data.callId,
        );
        if (!externalBooking) {
          return { ok: false as const, bookingConflict: true as const, error: APPOINTMENT_SLOT_CONFLICT_REPLY };
        }
        // Vquadrat ist bereits gebucht; der lokale Claim darf diesen Hinweis nicht
        // als lokalen Termin, Thread oder Bestaetigungsentwurf weiterverarbeiten.
        connectorLocalConflict = true;
        for (let index = transcript.length - 1; index >= 0; index -= 1) {
          if (transcript[index]?.from !== "alma") continue;
          transcript[index] = { ...transcript[index], text: CONNECTOR_SLOT_CONFLICT_REPLY };
          break;
        }
      }
    }

    const persistedStart = connectorLocalConflict ? null : confirmedExistingAppointment?.start ?? start;
    const slotLabel = persistedStart ? formatSlot(persistedStart) : undefined;
    const actionText = connectorLocalConflict
      ? `Tafelkonflikt: Vquadrat-Termin ${connectorAppointmentId} ist bestätigt; bitte sofort in Vquadrat prüfen.`
      :
      action.type === "emergency"
        ? emergencyBoardAction(nightName, Boolean(nightPhone))
        : callback
          ? "Rückrufzettel"
          : kassa
            ? "An die Tierarzthelferin"
            : waitlist
              ? "Warteliste"
              : action.connectorApplied
                ? persistedBookingAction(persistedStart, action.summary || bookedCallAction(action.kind))
                : booksDeskSlot(action, spokenForTicket) && persistedStart
                  ? persistedBookingAction(persistedStart, bookedCallAction(action.kind))
                  : "Auskunft hinterlegt";

    // AP 59: duration_sec bleibt beim Anlegen 0 — die echte Dauer steht erst beim
    // Auflegen fest und wird vom Abschluss-Ping (antwort.ts) nachgetragen. Der
    // hartcodierte Platzhalter 38 war ein falscher Wert auf der Tafel. Der
    // Idempotenz-Schluessel (idempotency_key) plus "on conflict do nothing" sorgt
    // dafuer, dass ein Gateway-Retry denselben Turn nicht doppelt anlegt.
    await sql`
      insert into calls (
        id, practice_id, channel, caller, pet, species, concern, status, duration_sec, transcript, action, consent_announced_at, external_call_id, idempotency_key
      ) values (
        ${callId},
        ${practiceId},
        ${data.channel ?? (inbound ? "web" : "telefon")},
        ${action.owner || "Klientel"},
        ${petName || "Patient"},
        ${species},
        ${(action.concern || data.user).slice(0, 180)},
        ${status},
        ${0},
        ${JSON.stringify(transcript)}::jsonb,
        ${actionText},
        ${consentAnnouncedAt},
        ${data.callId || null},
        ${data.idempotencyKey || null}
      )
      on conflict (practice_id, idempotency_key) do nothing
    `;

    if (action.type === "emergency") {
      // Notfall und erster Nachweis sind EIN Datenbankvorgang (migrations/0038):
      // schluege der Audit-Insert fehl, bliebe sonst ein Notfall ohne Nachweis.
      const { newId } = await import("./crypto");
      const created = await sql<{ outcome: string }>`
        select create_emergency_atomic(
          ${`e-${callId}`}, ${practiceId},
          ${action.owner || "Klientel"}, ${action.pet || "Patient"}, ${species},
          ${(action.summary || data.user).slice(0, 400)}, ${nightName},
          ${"silvia"}, ${`ea-${newId()}`},
          ${"Notfall erkannt und an den Nachtdienst geroutet."}
        ) as outcome
      `;
      if (created[0]?.outcome !== "applied") {
        throw new Error("Notfall konnte nicht angelegt werden.");
      }
    }

    // Warteliste: kein Slot am gewuenschten Tag — Anruferin fuer den Rueckruf
    // vormerken. Kein Termin, keine Praxissoftware, nur eine Tafel-Notiz.
    if (waitlist) {
      await sql`
        insert into waitlist (
          id, practice_id, caller, phone, pet, concern, requested_date, status
        ) values (
          ${`wl-${callId}`},
          ${practiceId},
          ${spokenOwner || action.owner || "Klientel"},
          ${spokenPhone},
          ${petName || action.pet || "Patient"},
          ${(action.concern || data.user).slice(0, 180)},
          ${action.preferredDate || ""},
          ${"offen"}
        )
      `;
    }

    const { protocolBody, protocolSubject, ownerConfirmText } = await import("@/lib/alma/protocol");
    const { liveLineKassaDraft, liveLineReachDraft } = await import("./walk-in-last");
    const eventAction = connectorLocalConflict
      ? { ...protocolAction, type: "none" as const, kind: "Tafelkonflikt", summary: actionText }
      : protocolAction;
    const eventReply = connectorLocalConflict ? CONNECTOR_SLOT_CONFLICT_REPLY : data.reply;
    const subject = protocolSubject(eventAction);
    const body = protocolBody(
      {
        action: eventAction,
        user: data.user,
        reply: eventReply,
        akte: null,
        slot: slotLabel,
        ownerPhone: spokenPhone,
        ownerEmail: spokenEmail,
      },
      {
        practiceName,
        owner: ownerName,
        nachtdienstName: nightName,
      },
    );
    const at = new Date().toISOString();
    if (persistedStart && !connectorLocalConflict) {
      const confirm = ownerConfirmText({
        action: { pet: action.pet, owner: action.owner },
        slot: slotLabel,
        practiceName,
      });
      const { applyReachToThread } = await import("./call-contact");
      const next = applyReachToThread({
        name: action.owner || "Klientel",
        preview: `Termin bestätigt: ${action.pet || "Patient"}`,
        messages: [{ from: "alma", text: confirm, at }],
        pet: action.pet || "Patient",
        phone: spokenPhone,
        email: spokenEmail,
        owner: action.owner,
        spoken: data.user,
      });
      await sql`
        insert into threads (id, practice_id, name, pet, preview, unread, intern, messages)
        values (
          ${await newPracticeId()},
          ${practiceId},
          ${next.name},
          ${next.pet},
          ${next.preview},
          ${0},
          ${false},
          ${JSON.stringify(next.messages)}::jsonb
        )
      `;
    }
    const internWrite = skipIntern
      ? { id: "" }
      : await (await import("./write-protocol")).writeInternProtocol(sql, {
          practiceId,
          internName: `${ownerName} · intern`,
          pet: internProtocolPet(action.pet, action.owner),
          subject,
          body,
          mailTo,
        });

    const confirmDraft =
      connectorLocalConflict || callback || kassa || !persistedStart
        ? null
        : await liveConfirmForPet(sql, {
            practiceId,
            pet: petName || action.pet,
            owner: holderOwner || action.owner,
            practiceName,
            phone: holderPhone,
            email: holderEmail,
            booked: persistedStart ? { id: confirmedExistingAppointment?.id ?? `b-${callId}`, start: persistedStart } : undefined,
          });
    const intern =
      inbound || skipIntern || !internWrite.id
        ? null
        : await liveInternForThread(sql, {
            practiceId,
            threadId: internWrite.id,
            ownerName,
            whatsapp: profile?.whatsapp || "",
            phone: profile?.phone || "",
            email: mailTo,
          });
    const reach =
      callback && !inbound
        ? liveLineReachDraft({
            id: callId,
            pet: action.pet,
            owner: holderOwner || action.owner,
            phone: holderPhone,
            email: holderEmail,
            practiceName,
          })
        : null;
    const kassaDraft =
      kassa && !inbound
        ? liveLineKassaDraft({
            id: callId,
            pet: action.pet,
            owner: holderOwner || action.owner,
            concern: action.concern || data.user,
          })
        : null;

    const { offerTafelToSpiegel } = await import("./vquadrat/spiegel");
    if (!connectorLocalConflict) await offerTafelToSpiegel(sql, practiceId, profile?.pms, {
      akte: {
        pet: petName || action.pet,
        owner: holderOwner || action.owner,
        phone: holderPhone || spokenPhone,
        email: holderEmail || spokenEmail,
      },
      ...(persistedStart
        ? {
            slot: {
              start: persistedStart.toISOString(),
              pet: action.pet || petName,
              owner: holderOwner || action.owner,
              reason: action.kind || action.concern,
              status: "gelegt",
            },
          }
        : {}),
      kontakt: {
        owner: holderOwner || action.owner,
        phone: holderPhone || spokenPhone,
        email: holderEmail || spokenEmail,
      },
    });

    return {
      ok: true as const,
      ...(connectorLocalConflict ? { bookingConflict: true as const, error: CONNECTOR_SLOT_CONFLICT_REPLY } : {}),
      callId,
      subject,
      confirm: confirmDraft,
      intern,
      internSkipped: Boolean(skipIntern && !inbound),
      reach,
      ...(kassaDraft ? { kassa: kassaDraft } : {}),
    };
  });

async function liveConfirmForPet(
  sql: Sql,
  input: {
    practiceId: string;
    pet: string;
    owner: string;
    practiceName: string;
    phone: string;
    email: string;
    booked?: { id: string; start: Date };
  },
): Promise<LastWalkIn | null> {
  const { liveLineConfirmDraft } = await import("./walk-in-last");
  const pet = String(input.pet ?? "").trim();
  let id = input.booked?.id ?? "";
  let startAt = input.booked?.start ? input.booked.start.toISOString() : "";
  if (!id || !startAt) {
    if (!pet || isPlaceholderPet(pet)) return null;
    const rows = await sql<{ id: string; start_at: string | Date }>`
      select id, start_at from appointments
      where practice_id = ${input.practiceId}
        and status = 'gelegt'
        and lower(pet) = ${pet.toLowerCase()}
      order by start_at asc
      limit 1
    `;
    if (!rows[0]) return null;
    id = rows[0].id;
    startAt = rows[0].start_at instanceof Date ? rows[0].start_at.toISOString() : String(rows[0].start_at);
  }
  return liveLineConfirmDraft({
    id,
    pet,
    owner: input.owner,
    startAt,
    practiceName: input.practiceName,
    phone: input.phone,
    email: input.email,
  });
}

async function liveInternForThread(
  sql: Sql,
  input: {
    practiceId: string;
    threadId: string;
    ownerName: string;
    whatsapp: string;
    phone: string;
    email: string;
  },
) {
  if (!input.threadId) return null;
  const { internDraftBody, liveLineInternDraft } = await import("./desk-calls");
  const rows = await sql<{ id: string; pet: string; preview: string; messages: unknown }>`
    select id, pet, preview, messages from threads
    where id = ${input.threadId}
      and practice_id = ${input.practiceId}
      and intern = true
    limit 1
  `;
  if (!rows[0]) return null;
  const messages = Array.isArray(rows[0].messages)
    ? (rows[0].messages as Array<{ text?: string }>)
    : [];
  return liveLineInternDraft({
    id: rows[0].id,
    pet: rows[0].pet,
    preview: rows[0].preview,
    body: internDraftBody(messages, rows[0].preview),
    ownerName: input.ownerName,
    practiceWhatsapp: input.whatsapp,
    practicePhone: input.phone,
    practiceEmail: input.email,
  });
}

export const loadBoard = createServerFn({ method: "GET" }).handler(async () => {
  const { readPracticeSession } = await import("./session.server");
  const session = await readPracticeSession();
  if (!session) return { ok: false as const, session: null as null, writerCopySeq: 0, holenError: null };

  const { getSql, dbSource, isTafelAnzeige } = await import("@/lib/db.server");
  const { fetchProfile } = await import("./profile-data.server");
  const { BOARD_APPOINTMENT_LIMIT, BOARD_CALL_LIMIT, BOARD_EMERGENCY_LIMIT, BOARD_MAIL_LIMIT, BOARD_PATIENT_LIMIT, BOARD_THREAD_LIMIT, BOARD_WAITLIST_LIMIT, boardRange } = await import("./board-window");
  const { fetchPracticeCalls, mapCallRow } = await import("./call-rows");
  const { fetchPracticeEmergencies, mapEmergencyRow } = await import("./emergency-rows");
  const { fetchPracticeWaitlist, mapWaitlistRow } = await import("./waitlist-rows");
  const { fetchPracticeMails, fetchPracticeThreads, mapMailRow, mapThreadRow } = await import("./protocol-rows");
  const { mapAppointmentRow } = await import("./appointment-rows");
  const { fetchFacts } = await import("./facts.server");
  const { fetchPraxissoftwareSpiegel } = await import("./vquadrat/spiegel");
  const sql = await getSql();
  const holenError = await loadHolenError(dbSource, isTafelAnzeige());
  const profile = await fetchProfile(session.practiceId);
  const range = boardRange();
  const [callRows, appointmentRows, emergencyRows, waitlistRows, patientRows, threadRows, mailRows, counts, facts, vquadratSpiegel] =
    await Promise.all([
      fetchPracticeCalls(sql, session.practiceId, { limit: BOARD_CALL_LIMIT }),
      sql<{
        id: string;
        start_at: string | Date;
        minutes: number;
        owner_name: string;
        spoken_owner: string;
        pet: string;
        kind: string;
        vet: string;
        channel: string;
        status: string;
        owner_phone: string;
        owner_email: string;
      }>`
        select a.id, a.start_at, a.minutes,
          coalesce(
            nullif(nullif(a.owner_name, ''), 'Klientel'),
            nullif((
              select p.owner_name from patients p
              where p.practice_id = a.practice_id and lower(p.name) = lower(a.pet)
                and lower(a.pet) not in ('patient','hund','protokoll','nummer','handy','festnetz','email','mail')
                and p.owner_name <> '' and p.owner_name <> 'Klientel'
                and not exists (
                  select 1 from patients x
                  where x.practice_id = a.practice_id and lower(x.name) = lower(a.pet) and x.id <> p.id
                )
              limit 1
            ), ''),
            a.owner_name
          ) as owner_name,
          a.owner_name as spoken_owner,
          a.pet, a.kind, a.vet, a.channel, a.status,
          coalesce((
            select nullif(p.phone, '') from patients p
            where p.practice_id = a.practice_id
              and a.owner_name <> '' and a.owner_name <> 'Klientel'
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
              and lower(p.owner_name) = lower(a.owner_name)
              and (
                lower(p.name) = lower(a.pet)
                or lower(a.pet) in ('patient','hund','protokoll','nummer','handy','festnetz','email','mail')
              )
            limit 1
          ), '') as owner_phone,
          coalesce((
            select nullif(p.email, '') from patients p
            where p.practice_id = a.practice_id
              and a.owner_name <> '' and a.owner_name <> 'Klientel'
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
              and lower(p.owner_name) = lower(a.owner_name)
              and (
                lower(p.name) = lower(a.pet)
                or lower(a.pet) in ('patient','hund','protokoll','nummer','handy','festnetz','email','mail')
              )
            limit 1
          ), '') as owner_email
        from appointments a
        where a.practice_id = ${session.practiceId}
          and a.start_at >= ${range.start.toISOString()}
          and a.start_at < ${range.end.toISOString()}
        order by a.start_at asc
        limit ${BOARD_APPOINTMENT_LIMIT}
      `,
      fetchPracticeEmergencies(sql, session.practiceId, { limit: BOARD_EMERGENCY_LIMIT }),
      fetchPracticeWaitlist(sql, session.practiceId, { limit: BOARD_WAITLIST_LIMIT }),
      sql<{
        id: string;
        chip: string;
        name: string;
        species: string;
        breed: string;
        born: string;
        owner_name: string;
        phone: string;
        email: string;
        last_vaccine: string;
        rabies: string;
        registered: boolean;
        notes: string;
        last_visit: string | null;
        next_due: string | null;
        warnings: string | null;
        source: string;
        last_call_note: string | null;
      }>`
        select id, chip, name, species, breed, born, owner_name, phone, email, last_vaccine, rabies,
               registered, notes, last_visit, next_due, warnings, source, last_call_note
        from patients where practice_id = ${session.practiceId}
        order by coalesce(last_call_at, created_at) desc, name asc
        limit ${BOARD_PATIENT_LIMIT}
      `,
      fetchPracticeThreads(sql, session.practiceId, { limit: BOARD_THREAD_LIMIT }),
      fetchPracticeMails(sql, session.practiceId, { limit: BOARD_MAIL_LIMIT }),
      sql<{ calls: number; appointments: number; emergencies: number; patients: number; threads: number; mails: number }>`
        select
          (select count(*)::int from calls where practice_id = ${session.practiceId}) as calls,
          (select count(*)::int from appointments where practice_id = ${session.practiceId}) as appointments,
          (select count(*)::int from emergencies where practice_id = ${session.practiceId}) as emergencies,
          (select count(*)::int from patients where practice_id = ${session.practiceId}) as patients,
          (select count(*)::int from threads where practice_id = ${session.practiceId}) as threads,
          (select count(*)::int from mails where practice_id = ${session.practiceId}) as mails
      `,
      fetchFacts(session.practiceId),
      fetchPraxissoftwareSpiegel(sql, session.practiceId),
    ]);

  return {
    ok: true as const,
    session,
    counts: counts[0] ?? { calls: 0, appointments: 0, emergencies: 0, patients: 0, threads: 0, mails: 0 },
    calls: callRows.map(mapCallRow),
    appointments: appointmentRows.map(mapAppointmentRow),
    emergencies: emergencyRows.map(mapEmergencyRow),
    waitlist: waitlistRows.map(mapWaitlistRow),
    patients: patientRows.map((p) => ({
      id: p.id,
      chip: p.chip,
      name: p.name,
      species: p.species,
      breed: p.breed,
      born: p.born,
      owner_name: p.owner_name,
      phone: p.phone,
      email: p.email || "",
      last_vaccine: p.last_vaccine,
      rabies: p.rabies,
      registered: Boolean(p.registered),
      notes: p.notes,
      last_visit: p.last_visit ?? "",
      next_due: p.next_due ?? "",
      warnings: p.warnings ?? "",
      source: p.source,
      last_call_note: p.last_call_note ?? "",
    })),
    threads: threadRows.map(mapThreadRow),
    mails: mailRows.map(mapMailRow),
    contact: {
      practiceName: profile?.name || session.practiceName,
      ownerName: profile?.ownerName || session.userName,
      ownerNameStored: String(profile?.ownerName ?? "").trim(),
      email: internPracticeInbox(profile?.email, session.email),
      whatsapp: firstHandy(profile?.whatsapp, profile?.phone),
      phone: profile?.phone || "",
      city: profile?.city || "",
      bundesland: profile?.bundesland || "",
      street: profile?.street || "",
      zip: profile?.zip || "",
      locationHint: profile?.locationHint || "",
      slug: profile?.slug || "",
      nachtdienstName: profile?.nachtdienstName || "Nachtdienst",
      nachtdienstPhone: profile?.nachtdienstPhone || "",
      nachtdienstNote: profile?.nachtdienstNote || "",
      notes: profile?.notes || "",
      hours: (profile?.hours ?? []).map((h) => ({ day: h.day, time: h.time })),
      pms: profile?.pms || "",
      vets: profile?.vets || "",
      resources: profile?.resources || "",
    },
    facts: facts.map((row) => ({ id: row.id, fact: row.fact })),
    vquadratSpiegel,
    holenError,
    tafelBackup: dbSource === "pglite",
    tafelBackupAt: await loadTafelBackupAt(dbSource),
    anzeige: isTafelAnzeige(),
    writerCopySeq: await loadWriterCopySeq(dbSource, isTafelAnzeige()),
    restart: await loadDeskRestartHint(),
    // AP 34: ruhiger Dauerhinweis auf der Tafel — läuft das Gespräch über einen
    // Dienstleister im Ausland (Internetbetrieb) oder bleibt es im Haus (Hausbetrieb).
    thirdPartyLlm: (await import("@/lib/alma/llm")).resolveLlm(process.env).thirdParty,
  };
});

async function loadHolenError(dbSource: string, anzeige: boolean) {
  if (dbSource !== "pglite" || anzeige) return null;
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const dir = resolvePgliteDataDir();
  if (!dir) return null;
  const { takeHolenFailForDesk } = await import("@/lib/pglite-holen-pending");
  return takeHolenFailForDesk(dir, anzeige);
}

async function loadWriterCopySeq(dbSource: string, anzeige: boolean) {
  if (dbSource !== "pglite" || !anzeige) return 0;
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const dir = resolvePgliteDataDir();
  if (!dir) return 0;
  const { readCopySeq } = await import("@/lib/pglite-copy-gate");
  return readCopySeq(dir);
}

async function loadTafelBackupAt(dbSource: string) {
  if (dbSource !== "pglite") return null;
  const { resolvePgliteDataDir } = await import("@/lib/pglite-data-dir");
  const dir = resolvePgliteDataDir();
  if (!dir) return null;
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { LAST_TAFEL_BACKUP_FILE, parseLastTafelBackup } = await import("./desk-storage");
  try {
    return parseLastTafelBackup(readFileSync(join(dir, LAST_TAFEL_BACKUP_FILE), "utf8"));
  } catch {
    return null;
  }
}

async function loadDeskRestartHint() {
  const running = String(process.env.SILVIA_BUILD_STAMP ?? "").trim();
  if (!running) return null;
  try {
    const { execFileSync } = await import("node:child_process");
    const { deskRestartHint, deskSourceStamp } = await import("./desk-storage");
    const current = deskSourceStamp(
      execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    return deskRestartHint({ running, current });
  } catch {
    return null;
  }
}

export const markThreadRead = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 80) }))
  .handler(async ({ data }) => {
    if (!data.id) return { ok: false as const };
    const { requirePractice } = await import("./session.server");
    const session = await requirePractice();
    const { tafelWriteBlock } = await import("@/lib/pglite-anzeige");
    const viewOnly = tafelWriteBlock();
    if (viewOnly) return { ok: false as const, error: viewOnly.error };
    const { getSql } = await import("@/lib/db.server");
    const sql = await getSql();
    await sql`
      update threads set unread = 0
      where id = ${data.id} and practice_id = ${session.practiceId}
    `;
    return { ok: true as const };
  });

/** Second PC: copy the writer's PGLite folder again. Session cookie stays. */
export const refreshTafelAnzeige = createServerFn({ method: "POST" }).handler(async () => {
  const { requirePractice, SESSION_COOKIE } = await import("./session.server");
  await requirePractice();
  const { clientIp } = await import("./session.server");
  const { rateLimitError } = await import("./rate-limit");
  const limited = rateLimitError(`anzeige-laden:${clientIp()}`, 6, 60_000);
  if (limited) return { ok: false as const, error: limited };
  const { isTafelAnzeige, TAFEL_ANZEIGE_REFRESH_WRITER_ERROR } = await import("@/lib/pglite-anzeige");
  if (!isTafelAnzeige()) return { ok: false as const, error: TAFEL_ANZEIGE_REFRESH_WRITER_ERROR };
  const { dbSource, refreshPgliteAnzeige, getSql } = await import("@/lib/db.server");
  if (dbSource !== "pglite") {
    return { ok: false as const, error: "Tafel neu laden gibt es nur ohne DATABASE_URL." };
  }
  const { getCookie } = await import("@tanstack/react-start/server");
  const { hashToken } = await import("./crypto");
  const token = getCookie(SESSION_COOKIE) ?? "";
  const hash = token ? hashToken(token) : "";
  const sqlBefore = await getSql();
  const kept = hash
    ? await sqlBefore<{
        id: string;
        user_id: string;
        token_hash: string;
        expires_at: string | Date;
      }>`
        select id, user_id, token_hash, expires_at from practice_sessions
        where token_hash = ${hash}
        limit 1
      `
    : [];
  try {
    await refreshPgliteAnzeige(kept[0] ?? null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return {
      ok: false as const,
      error: msg.startsWith("Die schreibende") || msg.startsWith("Ohne Tafel")
        ? msg
        : "Die Tafel-Kopie ließ sich nicht neu laden.",
    };
  }
  return { ok: true as const };
});

/** Rebuild `/sprechen` Halterin + intern drafts after refresh — IDs from sessionStorage, hrefs from the Tafel. */
export const loadSprechenDrafts = createServerFn({ method: "POST" })
  .validator((input: { confirmId?: string; internId?: string; reachId?: string; kassaId?: string }) => ({
    confirmId: String(input?.confirmId ?? "").slice(0, 80),
    internId: String(input?.internId ?? "").slice(0, 80),
    reachId: String(input?.reachId ?? "").slice(0, 80),
    kassaId: String(input?.kassaId ?? "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { readPracticeSession } = await import("./session.server");
    const session = await readPracticeSession();
    if (!session) return { ok: false as const, reason: "anonymous" as const };
    if (!data.confirmId && !data.internId && !data.reachId && !data.kassaId) {
      return { ok: true as const, confirm: null, intern: null, reach: null, kassa: null };
    }
    const { getSql } = await import("@/lib/db.server");
    const { fetchProfile } = await import("./profile-data.server");
    const sql = await getSql();
    const profile = await fetchProfile(session.practiceId);
    const practiceId = session.practiceId;
    const practiceName = profile?.name || session.practiceName || "Ordination";
    const ownerName = profile?.ownerName || session.userName || "Frau Doktor";
    const mailTo = internPracticeInbox(profile?.email, session.email);

    let confirm = null as Awaited<ReturnType<typeof liveConfirmForPet>>;
    if (data.confirmId) {
      const rows = await sql<{
        id: string;
        pet: string;
        owner_name: string;
        spoken_owner: string;
        start_at: string | Date;
        status: string;
        phone: string;
        email: string;
      }>`
        select a.id, a.pet, a.owner_name, a.owner_name as spoken_owner, a.start_at, a.status,
          coalesce((
            select nullif(p.phone, '') from patients p
            where p.practice_id = a.practice_id
              and a.owner_name <> '' and a.owner_name <> 'Klientel'
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
              and lower(p.owner_name) = lower(a.owner_name)
              and (
                lower(p.name) = lower(a.pet)
                or lower(a.pet) in ('patient','hund','protokoll','nummer','handy','festnetz','email','mail')
              )
            limit 1
          ), '') as phone,
          coalesce((
            select nullif(p.email, '') from patients p
            where p.practice_id = a.practice_id
              and a.owner_name <> '' and a.owner_name <> 'Klientel'
              and p.owner_name <> '' and p.owner_name <> 'Klientel'
              and lower(p.owner_name) = lower(a.owner_name)
              and (
                lower(p.name) = lower(a.pet)
                or lower(a.pet) in ('patient','hund','protokoll','nummer','handy','festnetz','email','mail')
              )
            limit 1
          ), '') as email
        from appointments a
        where a.id = ${data.confirmId}
          and a.practice_id = ${practiceId}
          and a.status = 'gelegt'
        limit 1
      `;
      if (rows[0]) {
        const { mapAppointmentConfirm } = await import("./appointment-rows");
        const mapped = mapAppointmentConfirm(rows[0]);
        const start =
          rows[0].start_at instanceof Date ? rows[0].start_at : new Date(String(rows[0].start_at));
        confirm = await liveConfirmForPet(sql, {
          practiceId,
          pet: mapped.pet,
          owner: mapped.owner,
          practiceName,
          phone: mapped.phone,
          email: mapped.email,
          booked: Number.isNaN(+start) ? undefined : { id: rows[0].id, start },
        });
      }
    }

    const intern = data.internId
      ? await liveInternForThread(sql, {
          practiceId,
          threadId: data.internId,
          ownerName,
          whatsapp: profile?.whatsapp || "",
          phone: profile?.phone || "",
          email: mailTo,
        })
      : null;

    let reach = null as LiveReachDraft | null;
    let kassa = null as LiveKassaDraft | null;
    if (data.reachId || data.kassaId) {
      const { fetchPracticeCalls, mapCallRow } = await import("./call-rows");
      const { liveLineKassaDraft, liveLineReachDraft } = await import("./walk-in-last");
      if (data.reachId) {
        const rows = await fetchPracticeCalls(sql, practiceId, { id: data.reachId, limit: 1 });
        const call = rows[0] ? mapCallRow(rows[0]) : null;
        if (call && /rückruf/i.test(call.action) && call.status !== "erledigt") {
          reach = liveLineReachDraft({
            id: call.id,
            pet: call.pet,
            owner: call.caller,
            phone: call.owner_phone,
            email: call.owner_email,
            practiceName,
          });
        }
      }
      if (data.kassaId) {
        const rows = await fetchPracticeCalls(sql, practiceId, { id: data.kassaId, limit: 1 });
        const call = rows[0] ? mapCallRow(rows[0]) : null;
        if (call && /an die kassa/i.test(call.action) && call.status !== "erledigt") {
          kassa = liveLineKassaDraft({
            id: call.id,
            pet: call.pet,
            owner: call.caller,
            concern: call.concern,
          });
        }
      }
    }

    return { ok: true as const, confirm, intern, reach, kassa };
  });
