import { halterinDraftHref, halterinMailHref, halterinSmsHref, telHref } from "../alma/phone.ts";

/** Status-neutral drafts to the Halterin. SMS/WhatsApp/tel never fall back to the practice line. */
export const HALTERIN_REACH_OPEN_LABEL = "Halterin erreichen";

/** Inner tel/sms/wa/mailto ids from the collapsed opener id. Empty openId yields no attributes. */
export function halterinReachDomIds(openId?: string | null) {
  const root = String(openId ?? "").trim();
  if (!root) return {};
  return {
    tel: `${root}-tel`,
    sms: `${root}-sms`,
    wa: `${root}-wa`,
    mail: `${root}-mail`,
    close: `${root}-schliessen`,
  };
}

export function halterinReachHrefs(input: {
  ownerPhone?: string | null;
  /** Pass (even empty) to offer mailto:? — omit on intern protocol. */
  ownerEmail?: string | null;
  body: string;
  mailSubject?: string;
}) {
  const phone = input.ownerPhone ?? "";
  const mail =
    input.ownerEmail === undefined
      ? ""
      : halterinMailHref(input.mailSubject || "Silvia", input.body, input.ownerEmail);
  return {
    call: telHref(phone),
    sms: halterinSmsHref(phone, input.body),
    wa: halterinDraftHref(phone, input.body),
    mail,
  };
}
