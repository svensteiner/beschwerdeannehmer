type CookieSecurityRequest = {
  url?: string | null;
  forwardedProto?: string | null;
};

/**
 * Local HTTP may use ordinary cookies. A deliberately trusted proxy must
 * always receive a Secure cookie: a broken HTTP proxy then fails closed.
 */
export function cookieSecureForRequest(
  request: CookieSecurityRequest | undefined,
  trustProxyHeaders: boolean,
): boolean {
  const forwardedProto = String(request?.forwardedProto ?? "").split(",")[0]?.trim();
  if (trustProxyHeaders && forwardedProto === "https") return true;
  try {
    if (new URL(String(request?.url ?? "")).protocol === "https:") return true;
  } catch {
    // No usable request URL: only an explicitly configured proxy may proceed.
  }
  return trustProxyHeaders;
}
