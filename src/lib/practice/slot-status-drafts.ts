export type DraftChannel = "whatsapp" | "sms" | "mail";

/** Opens SMS/Mail confirm and cancel when WhatsApp Bestätigen/Absagen are already visible. */
export const SLOT_MORE_CHANNELS_LABEL = "SMS und E-Mail";

export function slotMoreChannelsId(prefix: string, id: string) {
  return `${String(prefix ?? "").replace(/-+$/, "")}-channels-${String(id ?? "").slice(0, 80)}`;
}

/** Inner Bestätigen/Absagen ids from the SMS-und-E-Mail opener. Empty openId yields no attributes. */
export function slotStatusDraftDomIds(openId?: string | null) {
  const root = String(openId ?? "").trim();
  if (!root) return {};
  return {
    "confirm-wa": `${root}-confirm-wa`,
    "confirm-sms": `${root}-confirm-sms`,
    "confirm-mail": `${root}-confirm-mail`,
    "cancel-wa": `${root}-cancel-wa`,
    "cancel-sms": `${root}-cancel-sms`,
    "cancel-mail": `${root}-cancel-mail`,
    close: `${root}-schliessen`,
  };
}

export type SlotDraftHrefs = {
  status?: string;
  confirmWa?: string;
  confirmSms?: string;
  confirmMail?: string;
  cancelWa?: string;
  cancelSms?: string;
  cancelMail?: string;
};

export type SlotDraftButton = {
  kind: "confirm-wa" | "confirm-sms" | "confirm-mail" | "cancel-wa" | "cancel-sms" | "cancel-mail";
  href: string;
  label: string;
  channel: DraftChannel;
  action: "bestätigt" | "abgesagt";
  newTab: boolean;
};

function btn(
  kind: SlotDraftButton["kind"],
  href: string,
  label: string,
  channel: DraftChannel,
  action: SlotDraftButton["action"],
  newTab: boolean,
): SlotDraftButton | null {
  if (!href) return null;
  return { kind, href, label, channel, action, newTab };
}

/**
 * WhatsApp Bestätigen/Absagen stay on the card. SMS and E-Mail sit behind
 * **SMS und E-Mail**. Without Handy, E-Mail stays on the card (the only path).
 */
export function slotStatusDraftPlan(input: SlotDraftHrefs): {
  primary: SlotDraftButton[];
  folded: SlotDraftButton[];
} {
  const confirmed = input.status === "bestätigt";
  const cancelled = input.status === "abgesagt";
  const confirmWa = confirmed || cancelled ? "" : input.confirmWa ?? "";
  const confirmSms = confirmed || cancelled ? "" : input.confirmSms ?? "";
  const confirmMail = confirmed || cancelled ? "" : input.confirmMail ?? "";
  const cancelWa = cancelled ? "" : input.cancelWa ?? "";
  const cancelSms = cancelled ? "" : input.cancelSms ?? "";
  const cancelMail = cancelled ? "" : input.cancelMail ?? "";

  const confirm = [
    btn("confirm-wa", confirmWa, "Bestätigen", "whatsapp", "bestätigt", true),
    btn("confirm-sms", confirmSms, "SMS-Bestätigung", "sms", "bestätigt", false),
    btn("confirm-mail", confirmMail, "E-Mail-Bestätigung", "mail", "bestätigt", false),
  ].filter((row): row is SlotDraftButton => Boolean(row));
  const cancel = [
    btn("cancel-wa", cancelWa, "Absagen", "whatsapp", "abgesagt", true),
    btn("cancel-sms", cancelSms, "SMS-Absage", "sms", "abgesagt", false),
    btn("cancel-mail", cancelMail, "E-Mail-Absage", "mail", "abgesagt", false),
  ].filter((row): row is SlotDraftButton => Boolean(row));

  const hasWa = confirm.some((row) => row.kind === "confirm-wa") || cancel.some((row) => row.kind === "cancel-wa");
  if (!hasWa) return { primary: [...confirm, ...cancel], folded: [] };

  const primary = [...confirm, ...cancel].filter((row) => row.kind === "confirm-wa" || row.kind === "cancel-wa");
  const folded = [...confirm, ...cancel].filter((row) => row.kind !== "confirm-wa" && row.kind !== "cancel-wa");
  return { primary, folded };
}
