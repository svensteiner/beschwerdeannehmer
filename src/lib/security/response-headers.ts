const PRIVATE_PREFIXES = ["/login", "/app", "/sprechen", "/api", "/_serverFn/"];

const CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
];

/** A CSP nonce is an unguessable, single-response permit for framework bootstrap code. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return globalThis.btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce?: string): string {
  if (nonce !== undefined && !/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) {
    throw new Error("Ungültige CSP-Nonce");
  }
  const script = nonce
    ? `script-src 'self' 'nonce-${nonce}'`
    : "script-src 'self'";
  return [...CONTENT_SECURITY_POLICY_DIRECTIVES, script].join("; ");
}

export function isPrivateResponsePath(pathname: string) {
  return PRIVATE_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Headers that are safe before the HTTPS reverse proxy terminates TLS. */
export function privacyResponseHeaders(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), geolocation=(), payment=(), usb=()",
  };
  if (isPrivateResponsePath(pathname)) {
    headers["cache-control"] = "no-store";
    headers["x-robots-tag"] = "noindex, nofollow";
  }
  return headers;
}
