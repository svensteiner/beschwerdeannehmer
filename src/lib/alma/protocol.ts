import { displayOwner, type SilviaAction } from "./actions.ts";
import { PRACTICE } from "./data.ts";
import type { Patient } from "./patients.ts";
import { isAtHandy, mailtoHref as mailHref, sanitizeHalterinEmail, smsHref as smsLink, telHref, waMeHref } from "./phone.ts";

/** Pet names that must not appear as the intern card title or in Halterin drafts. */
export function isPlaceholderPet(pet?: string | null) {
  const p = String(pet ?? "").trim();
  return !p || /^(patient|hund|protokoll|nummer|handy|festnetz|email|mail)$/i.test(p);
}

/** Intern thread pet: the Tier, else the Halterin, else Protokoll — never a bare Patient. */
export function internProtocolPet(pet?: string | null, owner?: string | null) {
  if (!isPlaceholderPet(pet)) return String(pet).trim();
  const who = displayOwner(String(owner ?? ""));
  if (who && who !== "Klientel") return who;
  return "Protokoll";
}

/** Nameless Rückruf intern is Protokoll — a later name must still find that thread. */
export function internContactMatchPets(pet?: string | null, owner?: string | null) {
  const primary = internProtocolPet(pet, owner);
  const keys = [primary];
  if (isPlaceholderPet(pet)) {
    for (const extra of ["Protokoll", "Patient"]) {
      if (!keys.some((k) => k.toLowerCase() === extra.toLowerCase())) keys.push(extra);
    }
  }
  return keys;
}

export function protocolContactLines(phone?: string | null, email?: string | null) {
  const raw = String(phone ?? "").trim().slice(0, 24);
  const mail = sanitizeHalterinEmail(email);
  const phoneLine = !raw ? "" : isAtHandy(raw) ? `Handy: ${raw}` : `Telefon: ${raw}`;
  return [phoneLine, mail ? `E-Mail: ${mail}` : ""].filter(Boolean);
}

/** Short intern note after a contact-only turn (Handy / E-Mail / Name). */
export function protocolContactFollowUp(input: {
  pet: string;
  owner?: string;
  phone?: string;
  email?: string;
  practiceName: string;
}) {
  const pet = String(input.pet || "Akte").trim() || "Akte";
  const who = String(input.owner ?? "")
    .replace(/^Klientel\s+/i, "")
    .trim();
  return [
    `Protokoll Silvia · ${input.practiceName}`,
    `Kontakt nachgetragen für ${pet}${who ? ` · ${who}` : ""}.`,
    ...protocolContactLines(input.phone, input.email),
  ].join("\n");
}

export type ProtocolContext = {
  practiceName: string;
  owner: string;
  nachtdienstName: string;
  email?: string;
  whatsapp?: string;
};

export const DEMO_PROTOCOL: ProtocolContext = {
  practiceName: PRACTICE.name,
  owner: PRACTICE.owner,
  nachtdienstName: PRACTICE.nachtdienst.name,
  email: PRACTICE.email,
  whatsapp: PRACTICE.whatsapp,
};

export function walkInAction(input: { owner: string; pet: string; kind: string }): SilviaAction {
  const kind = input.kind.trim() || "Kontrolle";
  return {
    type: "book",
    owner: input.owner,
    pet: input.pet,
    kind,
    concern: kind,
    summary: `Walk-in ${kind}`,
  };
}

export function protocolBody(
  input: {
    action: SilviaAction;
    user: string;
    reply: string;
    akte: Patient | null;
    slot?: string;
    channel?: string;
    ownerPhone?: string;
    ownerEmail?: string;
  },
  ctx: ProtocolContext = DEMO_PROTOCOL,
) {
  const a = input.action;
  const channel = input.channel?.trim() || "Telefon";
  const timeWish = /^terminwunsch$/i.test(a.kind);
  const lines = [
    `Protokoll Silvia · ${ctx.practiceName}`,
    `An: ${ctx.owner}`,
    `Kanal: ${channel}`,
    `Tier: ${isPlaceholderPet(a.pet) ? "nicht genannt" : a.pet}${a.species && !isPlaceholderPet(a.pet) ? ` (${a.species})` : ""}`,
    `Halter: ${a.owner}`,
    ...protocolContactLines(input.ownerPhone, input.ownerEmail),
    a.chip ? `Chip: ${a.chip}` : "",
    `Anliegen: ${a.concern || input.user}`,
    a.type === "emergency"
      ? `Aktion: Nachtdienst ${ctx.nachtdienstName}`
      : timeWish
        ? "Aktion: Uhrzeitwunsch für die Tierarzthelferin prüfen"
        : a.type === "book"
        ? `Aktion: ${a.kind && a.kind !== "Termin" ? a.kind : "Termin"}${input.slot ? ` · ${input.slot}` : ""}`
        : /rückruf/i.test(a.kind)
          ? "Aktion: Rückrufzettel für die Tierarzthelferin"
          : /^kassa$/i.test(a.kind)
            ? "Aktion: An die Tierarzthelferin übergeben – Klientel bleibt in der Leitung"
            : "Aktion: Auskunft, in der Akte hinterlegt",
    input.akte?.lastVisit ? `Akte: ${input.akte.lastVisit}` : "",
    "",
    `Silvia: ${input.reply.slice(0, 320)}`,
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function protocolSubject(action: SilviaAction) {
  const timeWish = /^terminwunsch$/i.test(action.kind);
  const tag =
    action.type === "emergency"
      ? "Notfall"
      : timeWish
        ? "Terminwunsch"
        : action.type === "book"
        ? "Termin"
        : /rückruf/i.test(action.kind)
          ? "Rückruf"
          : /^kassa$/i.test(action.kind)
            ? "Übergabe"
            : "Anruf";
  const pet = isPlaceholderPet(action.pet) ? "" : String(action.pet).trim();
  const who = displayOwner(action.owner);
  const namedOwner = who && who !== "Klientel" ? who : "";
  if (pet && namedOwner) return `${tag}: ${pet} · ${namedOwner}`;
  if (pet) return `${tag}: ${pet}`;
  if (namedOwner) return `${tag}: ${namedOwner}`;
  return tag;
}

/** Name in Termin-Entwürfen: das Tier, sonst die Halterin — nie Patient/Nummer. */
export function slotSpokenName(pet?: string | null, owner?: string | null) {
  if (!isPlaceholderPet(pet)) return String(pet ?? "").trim();
  const who = displayOwner(String(owner ?? ""));
  if (who && who !== "Klientel") return who;
  return "";
}

export function ownerConfirmText(input: {
  action: { pet: string; owner?: string };
  slot?: string;
  practiceName: string;
}) {
  const when = input.slot || "dem nächsten offenen Slot";
  const named = slotSpokenName(input.action.pet, input.action.owner);
  const lead = named ? `Termin für ${named} liegt` : "Ihr Termin liegt";
  return `Grüß Gott, Silvia von der ${input.practiceName}. ${lead}: ${when}. Bitte Impfpass mitnehmen. Bis dahin.`;
}

export function ownerCancelText(input: {
  action: { pet: string; owner?: string };
  slot?: string;
  practiceName: string;
}) {
  const when = input.slot || "dem nächsten offenen Slot";
  const named = slotSpokenName(input.action.pet, input.action.owner);
  const lead = named ? `Der Termin für ${named}` : "Ihr Termin";
  return `Grüß Gott, Silvia von der ${input.practiceName}. ${lead} (${when}) fällt aus. Bitte neu anrufen, wenn Sie einen anderen Slot brauchen.`;
}

/** Halterin copy after Umlegen — names old and new slot, not a first booking. */
export function ownerRescheduleText(input: {
  pet: string;
  owner?: string;
  oldSlot: string;
  newSlot: string;
  practiceName: string;
}) {
  const from = input.oldSlot || "dem bisherigen Slot";
  const to = input.newSlot || "dem neuen Slot";
  const named = slotSpokenName(input.pet, input.owner);
  const lead = named ? `Der Termin für ${named} ist umgelegt` : "Ihr Termin ist umgelegt";
  return `Grüß Gott, Silvia von der ${input.practiceName}. ${lead}: von ${from} auf ${to}. Bitte Impfpass mitnehmen. Bis dahin.`;
}

/** tel: / sms: / wa.me to the Nachtdienst number from Einstellungen — never the Halterin. WhatsApp only on 06…. */
export function nachtdienstReachHrefs(phone: string | undefined, body: string) {
  const n = String(phone ?? "").trim();
  if (!n) return { call: "", sms: "", wa: "" };
  return {
    call: telHref(n),
    sms: smsHref(body, n),
    wa: isAtHandy(n) ? whatsappHref(body, n) : "",
  };
}

/** Desk copy: Festnetz Nachtdienst has no wa.me. Anzeige: never braucht/hinterlegen. */
export function nachtdienstReachCopy(phone?: string | null, anzeige?: boolean) {
  const n = String(phone ?? "").trim();
  if (!n) {
    return anzeige
      ? "Ohne Nummer bleibt Silvia in der Leitung."
      : "Ohne Nummer bleibt Silvia in der Leitung. Die Tierarzthelferin hinterlegt den Nachtdienst in den Einstellungen.";
  }
  if (isAtHandy(n)) {
    return "Anrufen, SMS und WhatsApp gehen an die Nummer aus den Einstellungen. Silvia verbindet nicht selbst.";
  }
  return anzeige
    ? "Anrufen und SMS gehen an die Festnetznummer aus den Einstellungen. Silvia verbindet nicht selbst."
    : "Anrufen und SMS gehen an die Festnetznummer aus den Einstellungen. WhatsApp braucht ein Handy (06…), nicht 01 oder 0316. Silvia verbindet nicht selbst.";
}

/** Live Anrufe row: Nachtdienst is queued on the Tafel, not a PSTN transfer. */
export function emergencyBoardAction(nightName: string, hasNightPhone: boolean) {
  const name = String(nightName || "Nachtdienst").trim() || "Nachtdienst";
  return hasNightPhone
    ? `Nachtdienst auf der Tafel · ${name}`
    : `Notfall erkannt · ${name} (Nummer fehlt)`;
}

/** Status after documenting an emergency; never claims a telephone connection. */
export function emergencyToast(hasNightPhone: boolean) {
  return hasNightPhone
    ? "Notfall – Nachtdienst liegt auf der Tafel."
    : "Notfall – Nachtdienst-Nummer fehlt.";
}

/** Heute / Notfall intro: queued on the Tafel, not a PSTN handover. */
export function emergencyDeskLead() {
  return "Der Notfall liegt auf der Tafel.";
}

/** wa.me / sms: body for the Nachtdienst number in Einstellungen. */
export function nachtdienstDraft(input: { practiceName: string; pet?: string }) {
  const name = String(input.practiceName || "Ordination").trim() || "Ordination";
  const pet = String(input.pet || "").trim();
  if (pet && !isPlaceholderPet(pet)) {
    return `Notfall ${pet} – bitte übernehmen. Silvia, ${name}.`;
  }
  return `Notfall – bitte übernehmen. Silvia, ${name}.`;
}

export function whatsappHref(body: string, phone?: string) {
  return waMeHref(phone ?? "", body);
}

export function mailtoHref(subject: string, body: string, email?: string) {
  return mailHref(email ?? "", subject, body);
}

export function smsHref(body: string, phone?: string) {
  return smsLink(phone ?? "", body);
}
