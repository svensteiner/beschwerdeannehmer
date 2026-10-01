/** Browser-safe status copy. Provider configuration remains server-side. */
type LlmProviderId = "openai" | "xai" | "compat" | "local";

export type LlmReplySource = "alma" | "local";

export type LlmSourceView = {
  source: LlmReplySource;
  provider: LlmProviderId;
  label: string;
  fallback: boolean;
};

function asReplySource(source: string | undefined): LlmReplySource {
  return source === "alma" ? "alma" : "local";
}

function asProviderId(provider: string | undefined): LlmProviderId {
  return provider === "openai" || provider === "xai" || provider === "compat" || provider === "local"
    ? provider
    : "local";
}

/**
 * Live-line copy: Modell vs. Lokal.
 * Never includes provider configuration or credentials.
 */
export function llmSourceLabel(
  source: string | undefined,
  provider: string | undefined,
): LlmSourceView {
  const src = asReplySource(source);
  const id = asProviderId(provider);
  const fallback = src === "local" && id !== "local";
  const label =
    src === "alma"
      ? "Modell"
      : fallback
        ? "Lokal — Modell hat nicht geantwortet"
        : "Lokal";
  return { source: src, provider: id, label, fallback };
}
