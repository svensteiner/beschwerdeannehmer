/** Einzige Freigabe für Termin-Schreiben über eine Praxissoftware. */
export function appointmentWriteApproved(
  caps: { write?: { appointment?: boolean } } | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return String(env.SILVIA_BOOKING ?? "").trim() === "connector"
    && String(env.SILVIA_BOOKING_LIVE_APPROVED ?? "").trim() === "1"
    && caps?.write?.appointment === true;
}
