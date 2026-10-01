import { createServerFn } from "@tanstack/react-start";

/** Sidecar only — routes must not import the `.server` module (client bundle). */
export const peekAppHolenPending = createServerFn({ method: "GET" }).handler(async () => {
  const { peekDeskHolenPending } = await import("./desk-backup-holen.server");
  return peekDeskHolenPending();
});

/** Sidecar only — wait page first paint. Cookie-on so idle+fail is not 401. */
export const peekAppHolenWait = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { peekDeskHolenStatus } = await import("./desk-backup-holen.server");
    const { holenPeekPollOf } = await import("./desk-storage");
    const peek = await peekDeskHolenStatus(true);
    return holenPeekPollOf(
      { pending: Boolean(peek.ok && peek.pending), fail: peek.fail, error: peek.ok ? "" : peek.error },
      peek.ok,
    );
  } catch {
    const { TAFEL_HOLEN_HTTP_FAIL } = await import("./desk-storage");
    return { pending: false, fail: TAFEL_HOLEN_HTTP_FAIL };
  }
});
