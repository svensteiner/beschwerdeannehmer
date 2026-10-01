import { isIP } from "node:net";

const MAX_IP_HEADER_LENGTH = 256;

/** Resolve an address without trusting client-controlled forwarding headers by default. */
export function resolveClientIp(
  peerIp: string | undefined,
  forwarded: string | null | undefined,
  realIp: string | null | undefined,
  trustProxy = false,
): string {
  const peer = String(peerIp ?? "").trim();
  if (trustProxy) {
    const rawForwarded = String(forwarded ?? "");
    if (forwarded != null) {
      if (rawForwarded.length > MAX_IP_HEADER_LENGTH) return isIP(peer) ? peer : "unknown";
      const candidate = rawForwarded.split(",")[0]?.trim() ?? "";
      return isIP(candidate) ? candidate : (isIP(peer) ? peer : "unknown");
    }
    const real = String(realIp ?? "").trim();
    if (real.length <= MAX_IP_HEADER_LENGTH && isIP(real)) return real;
  }
  return isIP(peer) ? peer : "unknown";
}
