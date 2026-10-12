/** Optionaler externer Live-Modus: standardmäßig vollständig ausgeschaltet. */
export function openAiLiveEnabled(environment = process.env) {
  return environment.GARAGEN_OPENAI_LIVE === "on" && Boolean(environment.OPENAI_API_KEY?.trim());
}

/** Die Zustimmung wird pro Verbindungsaufbau ausdrücklich vom Browser gesendet. */
export function acceptsLiveConnection(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin && request.headers.get("x-garagen-live-consent") === "yes";
}
