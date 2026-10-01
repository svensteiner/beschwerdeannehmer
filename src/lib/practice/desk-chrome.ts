export function deskChrome(
  session: { practiceName: string; city: string; userName: string },
  contact?: { practiceName?: string; city?: string } | null,
) {
  if (!contact) {
    return {
      practiceName: session.practiceName,
      city: session.city,
      userName: session.userName,
    };
  }
  return {
    practiceName: String(contact.practiceName ?? "").trim() || session.practiceName,
    city: String(contact.city ?? "").trim(),
    userName: session.userName,
  };
}

export const DESK_NAV_ITEMS = [
  { to: "/app", label: "Heute" },
  { to: "/app/anrufe", label: "Anrufe" },
  { to: "/app/rueckrufe", label: "Rückrufe" },
  { to: "/app/kalender", label: "Kalender" },
  { to: "/app/nachrichten", label: "Protokoll" },
  { to: "/app/notfall", label: "Notfall" },
  { to: "/app/akte", label: "Akte" },
  { to: "/app/training", label: "Training" },
  { to: "/app/auswertung", label: "Auswertung" },
  { to: "/app/einstellungen", label: "Einstellungen" },
] as const;

/** Sticky Tafel header is h-14. Hash targets from Heute must sit below it. */
export const DESK_SCROLL_MT = "scroll-mt-20";

export function deskHashId(hash: string | undefined) {
  return String(hash ?? "").replace(/^#/, "").trim();
}

/** Thumb bar on the phone: four tabs around the live line. Anrufe/Akte/Einstellungen sit in Mehr. */
const DESK_MOBILE_TAB_TOS = ["/app", "/app/kalender", "/app/nachrichten", "/app/notfall"] as const;
const DESK_MOBILE_MORE_TOS = ["/app/anrufe", "/app/rueckrufe", "/app/akte", "/app/training", "/app/auswertung", "/app/einstellungen"] as const;

export function deskMobileTabs() {
  return DESK_NAV_ITEMS.filter((item) =>
    (DESK_MOBILE_TAB_TOS as readonly string[]).includes(item.to),
  );
}

export function deskMobileMoreItems() {
  return DESK_NAV_ITEMS.filter((item) =>
    (DESK_MOBILE_MORE_TOS as readonly string[]).includes(item.to),
  );
}

export function deskMobileMoreLinkId(to: string) {
  const key = to.replace(/^\/app\/?/, "") || "heute";
  return `desk-mehr-${key}`;
}

export function deskMobilePhoneLabel(onPhone: boolean) {
  return onPhone ? "An der Leitung" : "Silvia anrufen";
}

export function deskMobilePhoneShort(onPhone: boolean) {
  return onPhone ? "Leitung" : "Silvia";
}
