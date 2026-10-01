import type { SilviaAction } from "./actions";
import { hasAkteTarget } from "./actions";
import { PRACTICE } from "./data";
import { nextFreeSlotAt, formatSlot, viennaNow, parseHourWindows } from "./hours";
import { lookupPatient, type Patient } from "./patients";
import { bookedCallAction, booksDeskSlot, isCallbackTurn, isKassaTransferTurn } from "./phone";
import { internProtocolPet, protocolBody, protocolSubject } from "./protocol";
import { useAlmaStore } from "./store";

function viennaDate() {
  const d = viennaNow();
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function ingestCallToAkte(input: { user: string; reply: string; action: SilviaAction }) {
  const { edition, kbPatients, addKbPatient } = useAlmaStore.getState();
  if (edition !== "akte") return null;
  if (!hasAkteTarget(input.action) && input.action.pet === "Patient") return null;
  const q = `${input.action.chip ?? ""} ${input.action.pet ?? ""} ${input.user}`;
  const found = lookupPatient(q, kbPatients);
  const name =
    (input.action.pet && input.action.pet !== "Patient" ? input.action.pet : found?.name) ?? null;
  if (!name) return null;
  const note = (input.action.akteNote || input.action.concern || input.user).trim().slice(0, 220);
  const today = viennaDate();
  const merged: Patient = {
    chip: input.action.chip || found?.chip || `0400${String(Date.now()).slice(-11)}`,
    name,
    species: input.action.species || found?.species || (/katze/i.test(input.user) ? "Katze" : "Hund"),
    breed: found?.breed ?? "",
    born: found?.born ?? "",
    owner:
      input.action.owner && input.action.owner !== "Klientel"
        ? input.action.owner
        : (found?.owner ?? "Klientel"),
    phone: found?.phone ?? "",
    lastVaccine: found?.lastVaccine ?? "offen",
    rabies: found?.rabies ?? "offen",
    registered: found?.registered ?? false,
    notes: [found?.notes, note].filter(Boolean).join(" · ").slice(0, 400),
    lastVisit: `Telefonat ${today}: ${note}`,
    nextDue:
      input.action.type === "book"
        ? input.action.kind
        : (found?.nextDue ?? undefined),
    warnings: found?.warnings,
    source: found?.source === "stamm" ? "stamm" : "telefon",
    lastCallAt: new Date().toISOString(),
    lastCallNote: note,
  };
  addKbPatient(merged);
  return merged;
}

export function writeToBoard(input: {
  user: string;
  reply: string;
  action: SilviaAction;
  lines: { role: "user" | "assistant"; content: string }[];
}) {
  const { addCall, addAppointment, addEmergency } = useAlmaStore.getState();
  const id = crypto.randomUUID();
  const cat = /katze|mizzi|fritz/i.test(`${input.action.pet} ${input.user}`);
  addCall({
    id,
    at: new Date().toISOString(),
    channel: "telefon",
    caller: input.action.owner || "Klientel",
    pet: input.action.pet || "Patient",
    species: input.action.species || (cat ? "Katze" : "Hund"),
    concern: (input.action.concern || input.user).slice(0, 120),
    status: input.action.type === "emergency" ? "notfall" : booksDeskSlot(input.action, input.user) ? "erledigt" : "offen",
    durationSec: 38,
    transcript: input.lines.map((l) => ({
      from: l.role === "assistant" ? ("alma" as const) : ("anrufer" as const),
      text: l.content,
    })),
    action:
      input.action.type === "emergency"
        ? `Nachtdienst ${PRACTICE.nachtdienst.name}`
        : isCallbackTurn(input.action.kind, input.user)
          ? "Rückrufzettel"
          : isKassaTransferTurn(input.action.kind, input.user)
            ? "An die Tierarzthelferin"
            : booksDeskSlot(input.action, input.user)
              ? bookedCallAction(input.action.kind)
              : "Auskunft hinterlegt",
  });
  let start: Date | null = null;
  if (booksDeskSlot(input.action, input.user)) {
    const { extraAppointments } = useAlmaStore.getState();
    const occupied = extraAppointments.map((a) => ({
      start: new Date(a.start),
      minutes: a.minutes || 20,
      pet: a.pet,
    }));
    start = nextFreeSlotAt(parseHourWindows(PRACTICE.hours), occupied);
    // Punkt 16: kein freier Slot heisst kein Termin, nicht „jetzt“.
    if (start) {
      addAppointment({
        id: `b-${id}`,
        start: start.toISOString(),
        minutes: 20,
        owner: input.action.owner || "Klientel",
        pet: input.action.pet || "Patient",
        type: input.action.kind || "Termin",
        vet: "Dr. Huber",
        channel: "telefon",
      });
    }
  }
  if (input.action.type === "emergency") {
    addEmergency({
      id: `e-${id}`,
      at: new Date().toISOString(),
      owner: input.action.owner || "Klientel",
      pet: input.action.pet || "Patient",
      species: input.action.species || (cat ? "Katze" : "Hund"),
      summary: input.action.summary || input.user,
      urgency: "notfall",
      routedTo: PRACTICE.nachtdienst.name,
      status: "dokumentiert",
    });
  }
  const akte = ingestCallToAkte(input);
  notifyVet({ ...input, akte, start });
  return { kind: input.action.type, akte };
}

function ownerConfirmText(input: {
  action: SilviaAction;
  start: Date | null;
  akte: Patient | null;
}) {
  const when = input.start ? formatSlot(input.start) : "dem nächsten offenen Slot";
  const box =
    /fritz/i.test(input.action.pet) || input.akte?.name === "Fritz"
      ? " Bitte nur in der Transportbox bringen."
      : " Bitte Impfpass mitnehmen.";
  return `Grüß Gott, Silvia von der Ordination Huber. Termin für ${input.action.pet} liegt: ${when}.${box} Bis dahin.`;
}

function notifyVet(input: {
  user: string;
  reply: string;
  action: SilviaAction;
  akte: Patient | null;
  start: Date | null;
}) {
  const { notifyWhatsapp, notifyEmail, extraThreads, addThread, addMail } = useAlmaStore.getState();
  const body = protocolBody(input);
  const subject = protocolSubject(input.action);
  const at = new Date().toISOString();
  if (notifyWhatsapp) {
    const prev = extraThreads.find((t) => t.id === "vet-intern");
    addThread({
      id: "vet-intern",
      name: `${PRACTICE.owner} · intern`,
      pet: internProtocolPet(input.action.pet, input.action.owner),
      preview: subject,
      unread: (prev?.unread ?? 0) + 1,
      intern: true,
      messages: [
        ...(prev?.messages ?? []),
        { from: "alma", text: body, at },
      ],
    });
  }
  if (notifyEmail) {
    addMail({
      id: crypto.randomUUID(),
      at,
      to: PRACTICE.email,
      subject,
      body,
      pet: internProtocolPet(input.action.pet, input.action.owner),
    });
  }
  if (notifyWhatsapp && input.action.type === "book") {
    const name = input.action.owner && input.action.owner !== "Klientel" ? input.action.owner : "Klientel";
    addThread({
      id: `wa-${at}`,
      name,
      pet: input.action.pet || "Patient",
      preview: `Termin bestätigt: ${input.action.pet}`,
      unread: 0,
      intern: false,
      messages: [{ from: "alma", text: ownerConfirmText(input), at }],
    });
  }
  if (notifyWhatsapp && /zurückruf|rufen sie mich|rufen sie uns/i.test(input.user)) {
    addThread({
      id: `cb-${at}`,
      name: input.action.owner || "Rückruf",
      pet: internProtocolPet(input.action.pet, input.action.owner),
      preview: "Rückrufzettel für die Tierarzthelferin",
      unread: 1,
      intern: true,
      messages: [
        {
          from: "alma",
          text: `Rückrufbitte aus dem Telefonat.\n${input.action.owner} · ${input.action.pet}\n${input.user}`,
          at,
        },
      ],
    });
  }
  if (notifyWhatsapp && isKassaTransferTurn(input.action.kind, input.user)) {
    addThread({
      id: `kassa-${at}`,
      name: input.action.owner || "Übergabe",
      pet: internProtocolPet(input.action.pet, input.action.owner),
      preview: "An die Tierarzthelferin übergeben",
      unread: 1,
      intern: true,
      messages: [
        {
          from: "alma",
          text: `Übergabe an die Tierarzthelferin. Klientel bleibt in der Leitung.\n${input.action.owner} · ${input.action.pet}\n${input.user}`,
          at,
        },
      ],
    });
  }
}
