const windows = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

export function complaintRateKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export function allowComplaintRequest(request: Request, now = Date.now()): boolean {
  const key = complaintRateKey(request);
  const current = windows.get(key);
  if (!current || current.resetAt <= now) { windows.set(key, { count: 1, resetAt: now + WINDOW_MS }); return true; }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

export function resetComplaintRateLimitForTests() { windows.clear(); }
