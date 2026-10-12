const windows = new Map<string, { count: number; resetAt: number }>();
const COMPLAINT_WINDOW_MS = 10 * 60 * 1000;
const COMPLAINT_MAX_REQUESTS = 5;
const UNTRUSTED_CLIENT_KEY = "shared-untrusted-client";

export type PublicRateLimit = Readonly<{
  scope: string;
  maxRequests: number;
  windowMs: number;
}>;

export const publicRateLimits = {
  telephoneChat: { scope: "telephone-chat", maxRequests: 30, windowMs: 10 * 60 * 1000 },
  telephoneProtocol: { scope: "telephone-protocol", maxRequests: 60, windowMs: 10 * 60 * 1000 },
  telephoneSpeech: { scope: "telephone-speech", maxRequests: 10, windowMs: 10 * 60 * 1000 },
} as const satisfies Record<string, PublicRateLimit>;

export function complaintRateKey(request: Request): string {
  if (process.env.GARAGEN_TRUST_PROXY !== "1") return UNTRUSTED_CLIENT_KEY;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || UNTRUSTED_CLIENT_KEY;
}

export function allowPublicRequest(request: Request, limit: PublicRateLimit, now = Date.now()): boolean {
  const key = `${limit.scope}:${complaintRateKey(request)}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) { windows.set(key, { count: 1, resetAt: now + limit.windowMs }); return true; }
  if (current.count >= limit.maxRequests) return false;
  current.count += 1;
  return true;
}

export function allowComplaintRequest(request: Request, now = Date.now()): boolean {
  return allowPublicRequest(request, { scope: "complaint", maxRequests: COMPLAINT_MAX_REQUESTS, windowMs: COMPLAINT_WINDOW_MS }, now);
}

export function resetComplaintRateLimitForTests() { windows.clear(); }
