export type BodyLimitResult = "ok" | "too-large" | "unreadable";

type BodyLimitOptions = {
  timeoutMs?: number;
};

const BODY_READ_TIMEOUT_MS = 10_000;

function declaredLengthExceeds(request: Request, limit: number) {
  const value = request.headers.get("content-length");
  if (value === null || !/^\d+$/.test(value.trim())) return false;
  return Number(value) > limit;
}

function abortPromise(signal: AbortSignal) {
  if (signal.aborted) {
    return { promise: Promise.reject(signal.reason ?? new Error("request aborted")), dispose: () => {} };
  }
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("request aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    dispose: () => signal.removeEventListener("abort", onAbort!),
  };
}

/** The Start handler resolves a server-function id before a possible suffix. */
export function matchesServerFunctionPath(pathname: string, functionPath: string) {
  return pathname === functionPath || pathname.startsWith(`${functionPath}/`);
}

/**
 * Reads a clone so the Start handler can still deserialize the original body.
 * A missing or forged Content-Length is only a hint; bytes from the stream are
 * always counted for bodies that are not rejected immediately.
 */
export async function inspectRequestBodyLimit(
  request: Request,
  limit: number,
  options: BodyLimitOptions = {},
): Promise<BodyLimitResult> {
  if (declaredLengthExceeds(request, limit)) return "too-large";
  if (!request.body) return "ok";

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.clone().body?.getReader();
  } catch {
    return "unreadable";
  }
  if (!reader) return "unreadable";

  const timeoutMs = options.timeoutMs ?? BODY_READ_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("request body timeout")), timeoutMs);
  });
  const aborted = abortPromise(request.signal);

  let total = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), timeout, aborted.promise]);
      if (part.done) return "ok";
      total += part.value.byteLength;
      if (total > limit) return "too-large";
    }
  } catch {
    return "unreadable";
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    aborted.dispose();
    // Do not await: a stalled clone must never keep the request middleware open.
    void reader.cancel().catch(() => {});
  }
}
