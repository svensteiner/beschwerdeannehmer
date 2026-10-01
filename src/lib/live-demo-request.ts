export const LIVE_DEMO_REQUEST_TIMEOUT_MS = 15_000;

type FetchJsonTimeoutOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  label?: string;
};

export async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchJsonTimeoutOptions = {},
) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromOutside = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener("abort", abortFromOutside, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? LIVE_DEMO_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const result = await response.json();
    return { response, result };
  } catch (error) {
    if (timedOut)
      throw new Error(`${options.label ?? "Die Live-Anfrage"} Zeitüberschreitung`);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromOutside);
  }
}
