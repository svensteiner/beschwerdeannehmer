import { format } from "date-fns";
import { deAT } from "date-fns/locale";
import { displayOwner } from "../alma/actions.ts";
import { halterinDraftHref, halterinMailHref, halterinSmsHref } from "../alma/phone.ts";
import {
  isPlaceholderPet,
  ownerCancelText,
  ownerConfirmText,
  ownerRescheduleText,
  slotSpokenName,
} from "../alma/protocol.ts";
import { pickHolderAkte } from "./patient-query.ts";

export { isPlaceholderPet };

/** Drafts the Kassa opens after a live `/sprechen` book — same wa.me / sms: / mailto: as Walk-in. */
export function liveLineConfirmDraft(input: {
  id: string;
  pet: string;
  owner: string;
  startAt: string;
  practiceName: string;
  phone?: string;
  email?: string;
}): LastWalkIn | null {
  const id = String(input.id ?? "").slice(0, 80);
  const pet = String(input.pet ?? "").trim().slice(0, 40) || "Patient";
  if (!id || !appointmentSlotLabel(input.startAt)) return null;
  return {
    id,
    pet,
    owner: String(input.owner ?? "").trim().slice(0, 80),
    href: walkInConfirmHref({
      phone: input.phone,
      pet,
      owner: input.owner,
      startAt: input.startAt,
      practiceName: input.practiceName,
    }),
    smsHref: walkInConfirmSmsHref({
      phone: input.phone,
      pet,
      owner: input.owner,
      startAt: input.startAt,
      practiceName: input.practiceName,
    }),
    mailHref: walkInConfirmMailHref({
      pet,
      owner: input.owner,
      startAt: input.startAt,
      practiceName: input.practiceName,
      email: input.email,
    }),
    phone: String(input.phone ?? "").trim().slice(0, 24),
    email: String(input.email ?? "").trim().slice(0, 120),
  };
}

export const LAST_WALK_IN_KEY = "silvia.last-walk-in";

export type LastWalkIn = {
  id: string;
  pet: string;
  owner: string;
  href: string;
  smsHref?: string;
  mailHref?: string;
  phone?: string;
  email?: string;
};

export function parseLastWalkIn(raw: unknown): LastWalkIn | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = String(v.id ?? "").slice(0, 80);
  const pet = String(v.pet ?? "").trim().slice(0, 40);
  if (!id || pet.length < 2) return null;
  return {
    id,
    pet,
    owner: String(v.owner ?? "").trim().slice(0, 80),
    href: String(v.href ?? ""),
    smsHref: String(v.smsHref ?? ""),
    mailHref: String(v.mailHref ?? ""),
  };
}

export function readLastWalkIn(storage?: Pick<Storage, "getItem"> | null): LastWalkIn | null {
  if (!storage) return null;
  try {
    return parseLastWalkIn(JSON.parse(storage.getItem(LAST_WALK_IN_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeLastWalkIn(storage: Pick<Storage, "setItem" | "removeItem"> | null, last: LastWalkIn | null) {
  if (!storage) return;
  if (!last) {
    storage.removeItem(LAST_WALK_IN_KEY);
    return;
  }
  storage.setItem(LAST_WALK_IN_KEY, JSON.stringify(last));
}

export function appointmentSlotLabel(startAt: string) {
  const start = new Date(startAt);
  if (Number.isNaN(+start)) return "";
  return format(start, "EEEE, d.M. 'um' HH:mm", { locale: deAT });
}

/** wa.me confirm for a gelegt slot once Handy is in the Akte. */
export function walkInConfirmHref(input: {
  phone?: string;
  pet: string;
  owner?: string;
  startAt: string;
  practiceName: string;
}) {
  const slot = appointmentSlotLabel(input.startAt);
  if (!slot) return "";
  return halterinDraftHref(
    input.phone,
    ownerConfirmText({
      action: { pet: input.pet, owner: input.owner },
      slot,
      practiceName: input.practiceName,
    }),
  );
}

/** sms: confirm to the Halterin — same copy as WhatsApp, no gateway. */
export function walkInConfirmSmsHref(input: {
  phone?: string;
  pet: string;
  owner?: string;
  startAt: string;
  practiceName: string;
}) {
  const slot = appointmentSlotLabel(input.startAt);
  if (!slot) return "";
  return halterinSmsHref(
    input.phone,
    ownerConfirmText({
      action: { pet: input.pet, owner: input.owner },
      slot,
      practiceName: input.practiceName,
    }),
  );
}

/** What „Wegen …“ refers to: the Tier, else the Halterin, else a generic Anliegen. */
export function reachTopic(pet: string, caller?: string | null) {
  if (!isPlaceholderPet(pet)) return String(pet).trim();
  const owner = displayOwner(String(caller ?? ""));
  if (owner && owner !== "Klientel") return owner;
  return "Ihrem Anliegen";
}

export type DraftChannel = "whatsapp" | "sms" | "mail" | "";

export function ownerSlotMailSubject(
  kind: "termin" | "absage" | "umgelegt",
  pet: string,
  practiceName: string,
  owner?: string | null,
) {
  const named = slotSpokenName(pet, owner);
  const praxis = String(practiceName || "Ordination").trim() || "Ordination";
  if (kind === "absage") return named ? `Termin ${named} fällt aus · ${praxis}` : `Termin fällt aus · ${praxis}`;
  if (kind === "umgelegt") return named ? `Termin ${named} umgelegt · ${praxis}` : `Termin umgelegt · ${praxis}`;
  return named ? `Termin ${named} · ${praxis}` : `Termin · ${praxis}`;
}

/** Status-neutral HalterinReach mail — not a Bestätigung/Absage subject. */
export function ownerReachMailSubject(pet: string, practiceName: string, caller?: string | null) {
  const name = reachTopic(pet, caller);
  const praxis = String(practiceName || "Ordination").trim() || "Ordination";
  return `Wegen ${name} · ${praxis}`;
}

export function ownerReachBody(input: {
  pet: string;
  caller?: string | null;
  practiceName: string;
  kind: "rueckruf" | "leitung" | "log" | "anrufe" | "notfall" | "akte";
}) {
  const topic = reachTopic(input.pet, input.caller);
  const praxis = String(input.practiceName || "Ordination").trim() || "Ordination";
  if (input.kind === "leitung") {
    return `Grüß Gott, Silvia von der ${praxis}. Wegen ${topic} rufe ich zurück, die Leitung war gerade voll.`;
  }
  if (input.kind === "rueckruf") {
    return `Grüß Gott, Silvia von der ${praxis}. Wegen ${topic} rufe ich zurück, wie besprochen.`;
  }
  if (input.kind === "notfall") {
    return `Grüß Gott, Silvia von der ${praxis}. Wegen ${topic} – der Nachtdienst übernimmt.`;
  }
  if (input.kind === "anrufe" || input.kind === "akte") {
    return `Grüß Gott, Silvia von der ${praxis}. Wegen ${topic} bitte kurz zurückrufen.`;
  }
  return `Grüß Gott, Silvia von der ${praxis}. Wegen ${topic} rufe ich zurück.`;
}

/** Staff `/sprechen` Halterin reach after a Rückruf — tel/sms/wa/mailto, not a Termin-Bestätigung. */
export type LiveReachDraft = {
  id: string;
  pet: string;
  owner: string;
  phone: string;
  email: string;
  body: string;
  mailSubject: string;
};

/** After a Rückruf, a later Handy/E-Mail must refresh Halterin drafts — never drop the card. */
export function reachAfterContactFollowUp(input: {
  inbound?: boolean;
  call: { id: string; caller?: string | null; pet?: string | null } | null;
  phone?: string | null;
  email?: string | null;
  owner?: string | null;
  pet?: string | null;
  practiceName: string;
}): LiveReachDraft | null {
  if (input.inbound || !input.call?.id) return null;
  if (!String(input.phone ?? "").trim() && !String(input.email ?? "").trim()) return null;
  return liveLineReachDraft({
    id: input.call.id,
    pet: input.pet || input.call.pet,
    owner: input.owner || input.call.caller,
    phone: input.phone,
    email: input.email,
    practiceName: input.practiceName,
  });
}

export type ConfirmSlotRow = {
  id: string;
  pet?: string | null;
  owner?: string | null;
  startAt: string | Date;
};

/**
 * Later Handy/E-Mail after a book. Prefer the stored Slot-ID.
 * Never pick leftover Patient in the Kartei by name.
 */
export function pickConfirmSlotAfterContact(input: {
  confirmId?: string | null;
  pet?: string | null;
  owner?: string | null;
  slots: ConfirmSlotRow[];
}): ConfirmSlotRow | null {
  const slots = input.slots.filter((row) => String(row.id ?? "").trim());
  if (!slots.length) return null;
  const pet = String(input.pet ?? "").trim();
  const owner = String(input.owner ?? "").trim();
  const hasPet = Boolean(pet && !isPlaceholderPet(pet));
  const hasOwner = Boolean(owner && owner.toLowerCase() !== "klientel");
  const confirmId = String(input.confirmId ?? "").trim();
  if (confirmId) {
    const hit = slots.find((row) => row.id === confirmId);
    // Eine explizite, aber ungültige ID darf niemals auf einen anderen Termin
    // zurückfallen (sonst kann ein späterer Kontakt fremd zugeordnet werden).
    if (!hit) return null;
    if (hasPet && (isPlaceholderPet(String(hit.pet ?? "")) || String(hit.pet ?? "").trim().toLowerCase() !== pet.toLowerCase())) return null;
    if (hasOwner && String(hit.owner ?? "").trim().toLowerCase() !== owner.toLowerCase()) return null;
    return hit;
  }
  if (!hasPet && !hasOwner) return null;
  const petKey = pet.toLowerCase();
  const ownerKey = owner.toLowerCase();
  const named = slots.filter((row) => {
    const rowPet = String(row.pet ?? "").trim();
    const rowOwner = String(row.owner ?? "").trim();
    const petMatches = !hasPet || (!isPlaceholderPet(rowPet) && rowPet.toLowerCase() === petKey);
    const ownerMatches = !hasOwner || (rowOwner && rowOwner.toLowerCase() === ownerKey);
    return petMatches && ownerMatches;
  });
  return named.length === 1 ? named[0] : null;
}

/** After a book, a later Handy/E-Mail must refresh Bestätigen — never leftover Patient lookup. */
export function confirmAfterContactFollowUp(input: {
  inbound?: boolean;
  slot: ConfirmSlotRow | null;
  phone?: string | null;
  email?: string | null;
  owner?: string | null;
  pet?: string | null;
  practiceName: string;
}): LastWalkIn | null {
  if (input.inbound || !input.slot?.id) return null;
  if (!String(input.phone ?? "").trim() && !String(input.email ?? "").trim()) return null;
  const startAt =
    input.slot.startAt instanceof Date ? input.slot.startAt.toISOString() : String(input.slot.startAt ?? "");
  return liveLineConfirmDraft({
    id: input.slot.id,
    pet: String(input.pet || input.slot.pet || "").trim() || "Patient",
    owner: String(input.owner || input.slot.owner || "").trim(),
    startAt,
    practiceName: input.practiceName,
    phone: input.phone ?? undefined,
    email: input.email ?? undefined,
  });
}

/** Slot-Bestätigen is the daily action. No Intern-Zettel an die Frau Doktor. */
export function skipInternAfterConfirmFollowUp(input: {
  inbound?: boolean;
  confirm?: LastWalkIn | null;
}) {
  if (input.inbound) return true;
  return Boolean(input.confirm?.id);
}

export function liveLineReachDraft(input: {
  id: string;
  pet?: string | null;
  owner?: string | null;
  phone?: string | null;
  email?: string | null;
  practiceName: string;
}): LiveReachDraft | null {
  const id = String(input.id ?? "").slice(0, 80);
  if (!id) return null;
  const owner = String(input.owner ?? "").trim().slice(0, 80);
  const pet = String(input.pet ?? "").trim().slice(0, 40);
  const phone = String(input.phone ?? "").trim().slice(0, 32);
  const email = String(input.email ?? "").trim().slice(0, 160);
  return {
    id,
    pet,
    owner,
    phone,
    email,
    body: ownerReachBody({ pet, caller: owner, practiceName: input.practiceName, kind: "rueckruf" }),
    mailSubject: ownerReachMailSubject(pet, input.practiceName, owner),
  };
}

/** Staff `/sprechen` takeover after „An die Kassa“ — no Halterin tel; caller stays on the line. */
export type LiveKassaDraft = {
  id: string;
  pet: string;
  owner: string;
  concern: string;
};

export function liveLineKassaDraft(input: {
  id: string;
  pet?: string | null;
  owner?: string | null;
  concern?: string | null;
}): LiveKassaDraft | null {
  const id = String(input.id ?? "").slice(0, 80);
  if (!id) return null;
  return {
    id,
    pet: String(input.pet ?? "").trim().slice(0, 40),
    owner: String(input.owner ?? "").trim().slice(0, 80),
    concern: String(input.concern ?? "").trim().slice(0, 180),
  };
}

export function confirmDraftToast(channel: DraftChannel) {
  if (channel === "whatsapp") return "Bestätigt. WhatsApp an die Halterin ist offen.";
  if (channel === "sms") return "Bestätigt. SMS an die Halterin ist offen.";
  if (channel === "mail") return "Bestätigt. E-Mail an die Halterin ist offen.";
  return "Termin bestätigt. Telefon in der Akte nachtragen.";
}

/** True when mailto has a To: (Halterin), not mailto:? for the Kassa to type. */
export function mailDraftHasTo(href?: string | null) {
  const h = String(href ?? "");
  return /^mailto:[^?]/.test(h);
}

/** Walk-in / live-line confirm card: WhatsApp only when the Halterin has a Handy. */
export function confirmReachHint(last: { href?: string; smsHref?: string; mailHref?: string }) {
  if (last.href) {
    return ". Bestätigung öffnet WhatsApp, SMS oder E-Mail an die Halterin und markiert den Slot bestätigt.";
  }
  if (last.smsHref) {
    return ". Bestätigung öffnet SMS oder E-Mail an die Halterin. WhatsApp braucht ein Handy, nicht die Festnetznummer.";
  }
  if (mailDraftHasTo(last.mailHref)) return ". E-Mail-Bestätigung füllt To: an die Halterin.";
  if (last.mailHref) {
    return ". Ohne Handy bleiben WhatsApp und SMS zu. E-Mail öffnet einen leeren Empfänger — To: tippt die Tierarzthelferin.";
  }
  return ". Kein Entwurf. Trotzdem markiert nur den Status.";
}

/** Trotzdem only when there is no draft at all — mailto:? already confirms. */
export function needsSilentConfirm(last: Pick<LastWalkIn, "href" | "smsHref" | "mailHref">) {
  return !last.href && !last.smsHref && !last.mailHref;
}

export function cancelDraftToast(channel: DraftChannel) {
  if (channel === "whatsapp") return "Abgesagt. WhatsApp an die Halterin ist offen.";
  if (channel === "sms") return "Abgesagt. SMS an die Halterin ist offen.";
  if (channel === "mail") return "Abgesagt. E-Mail an die Halterin ist offen.";
  return "Termin abgesagt.";
}

/** mailto: confirm. To: stays empty unless the Akte has an address — never the practice inbox. */
export function walkInConfirmMailHref(input: {
  pet: string;
  owner?: string;
  startAt: string;
  practiceName: string;
  email?: string;
}) {
  const slot = appointmentSlotLabel(input.startAt);
  if (!slot) return "";
  return halterinMailHref(
    ownerSlotMailSubject("termin", input.pet, input.practiceName, input.owner),
    ownerConfirmText({
      action: { pet: input.pet, owner: input.owner },
      slot,
      practiceName: input.practiceName,
    }),
    input.email,
  );
}

export function walkInCancelMailHref(input: {
  pet: string;
  owner?: string;
  startAt: string;
  practiceName: string;
  email?: string;
}) {
  const slot = appointmentSlotLabel(input.startAt);
  if (!slot) return "";
  return halterinMailHref(
    ownerSlotMailSubject("absage", input.pet, input.practiceName, input.owner),
    ownerCancelText({
      action: { pet: input.pet, owner: input.owner },
      slot,
      practiceName: input.practiceName,
    }),
    input.email,
  );
}

/** sms: cancel to the Halterin — same copy as WhatsApp Absagen, no gateway. */
export function walkInCancelSmsHref(input: {
  phone?: string;
  pet: string;
  owner?: string;
  startAt: string;
  practiceName: string;
}) {
  const slot = appointmentSlotLabel(input.startAt);
  if (!slot) return "";
  return halterinSmsHref(
    input.phone,
    ownerCancelText({
      action: { pet: input.pet, owner: input.owner },
      slot,
      practiceName: input.practiceName,
    }),
  );
}

export function phoneForPet(patients: Array<{ name: string; phone?: string }>, pet: string) {
  if (isPlaceholderPet(pet)) return "";
  const name = String(pet ?? "").trim().toLowerCase();
  if (!name) return "";
  return patients.find((p) => p.name.toLowerCase() === name)?.phone || "";
}

export function emailForPet(patients: Array<{ name: string; email?: string }>, pet: string) {
  if (isPlaceholderPet(pet)) return "";
  const name = String(pet ?? "").trim().toLowerCase();
  if (!name) return "";
  return patients.find((p) => p.name.toLowerCase() === name)?.email || "";
}

/**
 * Walk-in "letzter Termin" after Akte Handy/E-Mail: slot id first, then named pet,
 * then unique Halterin. Never leftover unique Patient in the Kartei.
 */
export function contactForWalkInLast(input: {
  last: { id: string; pet: string; owner?: string };
  slot?: { owner_phone?: string; owner_email?: string; owner_name?: string } | null;
  patients?: Array<{ id?: string; name: string; owner_name?: string; phone?: string; email?: string }>;
}): { phone: string; email: string } {
  const patients = input.patients ?? [];
  const slotPhone = String(input.slot?.owner_phone ?? "").trim();
  const slotEmail = String(input.slot?.owner_email ?? "").trim();
  if (slotPhone || slotEmail) return { phone: slotPhone, email: slotEmail };
  const namedPhone = phoneForPet(patients, input.last.pet);
  const namedEmail = emailForPet(patients, input.last.pet);
  if (namedPhone || namedEmail) return { phone: namedPhone, email: namedEmail };
  const owner = String(input.last.owner ?? input.slot?.owner_name ?? "").trim();
  if (!isPlaceholderPet(input.last.pet) || !owner || owner === "Klientel") {
    return { phone: "", email: "" };
  }
  const akte = pickHolderAkte(
    patients.map((p) => ({ ...p, id: p.id ?? p.name })),
    { owner },
  );
  if (!akte) return { phone: "", email: "" };
  return {
    phone: String(akte.phone ?? "").trim(),
    email: String(akte.email ?? "").trim(),
  };
}

export const LAST_UMLEGEN_KEY = "silvia.last-umlegen";

export type LastUmlegen = {
  id: string;
  pet: string;
  owner: string;
  previousStart: string;
  startAt: string;
  href: string;
  smsHref?: string;
  mailHref?: string;
};

export function umlegenDraftBody(input: {
  pet: string;
  owner?: string;
  oldSlot: string;
  newSlot: string;
  practiceName: string;
}) {
  return ownerRescheduleText({
    pet: input.pet,
    owner: input.owner,
    oldSlot: input.oldSlot,
    newSlot: input.newSlot,
    practiceName: input.practiceName,
  });
}

type UmlegenHrefInput = {
  phone?: string;
  email?: string;
  pet: string;
  owner?: string;
  previousStart: string;
  startAt: string;
  practiceName: string;
};

function umlegenSlots(input: Pick<UmlegenHrefInput, "previousStart" | "startAt">) {
  const oldSlot = appointmentSlotLabel(input.previousStart);
  const newSlot = appointmentSlotLabel(input.startAt);
  if (!oldSlot || !newSlot || oldSlot === newSlot) return null;
  return { oldSlot, newSlot };
}

export function umlegenWaHref(input: UmlegenHrefInput) {
  const slots = umlegenSlots(input);
  if (!slots) return "";
  return halterinDraftHref(input.phone, umlegenDraftBody({ ...input, ...slots }));
}

export function umlegenSmsHref(input: UmlegenHrefInput) {
  const slots = umlegenSlots(input);
  if (!slots) return "";
  return halterinSmsHref(input.phone, umlegenDraftBody({ ...input, ...slots }));
}

export function umlegenMailHref(input: UmlegenHrefInput) {
  const slots = umlegenSlots(input);
  if (!slots) return "";
  return halterinMailHref(
    ownerSlotMailSubject("umgelegt", input.pet, input.practiceName, input.owner),
    umlegenDraftBody({ ...input, ...slots }),
    input.email,
  );
}

export function lastUmlegenDraft(input: UmlegenHrefInput & { id: string }): LastUmlegen | null {
  const id = String(input.id ?? "").slice(0, 80);
  const slots = umlegenSlots(input);
  if (!id || !slots) return null;
  const pet = String(input.pet ?? "").trim().slice(0, 40);
  return {
    id,
    pet,
    owner: String(input.owner ?? "").trim().slice(0, 80),
    previousStart: input.previousStart,
    startAt: input.startAt,
    href: umlegenWaHref(input),
    smsHref: umlegenSmsHref(input),
    mailHref: umlegenMailHref(input),
  };
}

export function parseLastUmlegen(raw: unknown): LastUmlegen | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = String(v.id ?? "").slice(0, 80);
  const previousStart = String(v.previousStart ?? "");
  const startAt = String(v.startAt ?? "");
  if (!id || !appointmentSlotLabel(previousStart) || !appointmentSlotLabel(startAt)) return null;
  return {
    id,
    pet: String(v.pet ?? "").trim().slice(0, 40),
    owner: String(v.owner ?? "").trim().slice(0, 80),
    previousStart,
    startAt,
    href: String(v.href ?? ""),
    smsHref: String(v.smsHref ?? ""),
    mailHref: String(v.mailHref ?? ""),
  };
}

export function readLastUmlegen(storage?: Pick<Storage, "getItem"> | null): LastUmlegen | null {
  if (!storage) return null;
  try {
    return parseLastUmlegen(JSON.parse(storage.getItem(LAST_UMLEGEN_KEY) || "null"));
  } catch {
    return null;
  }
}

export function writeLastUmlegen(storage: Pick<Storage, "setItem" | "removeItem"> | null, last: LastUmlegen | null) {
  if (!storage) return;
  if (!last) {
    storage.removeItem(LAST_UMLEGEN_KEY);
    return;
  }
  storage.setItem(LAST_UMLEGEN_KEY, JSON.stringify(last));
}

export function umlegenDraftToast(channel: DraftChannel) {
  if (channel === "whatsapp") return "WhatsApp an die Halterin ist offen.";
  if (channel === "sms") return "SMS an die Halterin ist offen.";
  if (channel === "mail") return "E-Mail an die Halterin ist offen.";
  return "";
}
