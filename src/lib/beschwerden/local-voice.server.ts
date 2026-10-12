/** Lokale Endpunkte: Sprachdaten verlassen den Rechner nie. */
export const LOCAL_STT_URL = "http://127.0.0.1:8178/v1/audio/transcriptions";
export const LOCAL_TTS_URL = "http://127.0.0.1:8179/v1/audio/speech";

export type LocalVoiceHealth = {
  recognition: boolean;
  speech: boolean;
  ready: boolean;
};

type Request = (input: string, init: RequestInit) => Promise<Response>;

async function isAvailable(url: string, request: Request): Promise<boolean> {
  try {
    const response = await request(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function localVoiceHealth(request: Request = fetch): Promise<LocalVoiceHealth> {
  const [recognition, speech] = await Promise.all([
    isAvailable("http://127.0.0.1:8178/health", request),
    isAvailable("http://127.0.0.1:8179/health", request),
  ]);
  return { recognition, speech, ready: recognition && speech };
}
