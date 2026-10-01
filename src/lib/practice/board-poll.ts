/** How often the desk reloads the Tafel while the tab is visible and idle. */
export const BOARD_POLL_MS = 10_000;

/** How often the Anzeige process recopyies the writer folder. Slower than poll — close+copy. */
export const ANZEIGE_REFRESH_MS = 60_000;

/** `last <= 0` means the Anzeige process has never copied in this tab. */
export function anzeigeCopyDue(now: number, last: number, every = ANZEIGE_REFRESH_MS) {
  if (last <= 0) return true;
  return now - last >= every;
}

export const ANZEIGE_SEQ_UNKNOWN = -1;

/** Copy when the writer seq moved, or once a minute as a safety net. */
export function anzeigeCopyNeeded(input: {
  now: number;
  lastCopyAt: number;
  seenSeq: number;
  writerSeq: number;
  every?: number;
}) {
  if (input.seenSeq < 0) return false;
  if (Number(input.writerSeq) !== Number(input.seenSeq)) return true;
  return anzeigeCopyDue(input.now, input.lastCopyAt, input.every);
}

const SKIP_APP_PREFIXES = ["/app/einstellungen"];

export function deskFieldsBusy(
  active: { tagName?: string; isContentEditable?: boolean } | null | undefined,
) {
  if (!active) return false;
  const tag = String(active.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(active.isContentEditable);
}

/** Tick only on the live Tafel and staff phone — not marketing, login, or public /leitung. */
export function boardPollShouldTick(input: {
  visible: boolean;
  pathname: string;
  busy: boolean;
}) {
  if (!input.visible || input.busy) return false;
  const path = String(input.pathname ?? "");
  if (path === "/sprechen") return true;
  if (path !== "/app" && !path.startsWith("/app/")) return false;
  return !SKIP_APP_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Same idle window as the Tafel poll — never on the writing process. */
export function anzeigeRefreshShouldTick(input: {
  anzeige?: boolean;
  visible: boolean;
  pathname: string;
  busy: boolean;
}) {
  if (!input.anzeige) return false;
  return boardPollShouldTick(input);
}
