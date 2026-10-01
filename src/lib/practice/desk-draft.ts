/** WhatsApp (https) needs a tab. sms: / mailto: / tel: stay here so the composer opens. */
export function draftOpensInNewTab(href: string) {
  return /^https?:\/\//i.test(String(href ?? "").trim());
}
