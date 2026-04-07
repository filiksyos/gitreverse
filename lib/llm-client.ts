/**
 * Shared LLM client — provider resolution, request execution, response parsing.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GOOGLE_AI_STUDIO_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export type LlmTarget =
  | { provider: "openrouter"; url: string; apiKey: string; model: string }
  | { provider: "google"; url: string; apiKey: string; model: string };

/** Resolve the configured LLM provider from env vars. */
export function resolveLlmTarget(): LlmTarget | { error: string } {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    return {
      provider: "openrouter",
      url: OPENROUTER_URL,
      apiKey: openRouterKey,
      model:
        process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-pro",
    };
  }
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (googleKey) {
    return {
      provider: "google",
      url: GOOGLE_AI_STUDIO_URL,
      apiKey: googleKey,
      model:
        process.env.GOOGLE_AI_STUDIO_MODEL?.trim() || "gemini-2.5-pro",
    };
  }
  return {
    error:
      "No LLM API key configured. Set OPENROUTER_API_KEY (recommended) or GOOGLE_GENERATIVE_AI_API_KEY in .env.local.",
  };
}

/** Extract the top-level error message from an LLM provider response body. */
export function extractProviderErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return null;
}

/** Extract the assistant text from an OpenAI-compatible chat response. */
export function extractMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : ""
      )
      .join("");
    return text.trim() || null;
  }
  return null;
}

/** Build authorization headers for the resolved LLM target. */
export function buildLlmHeaders(llm: LlmTarget): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${llm.apiKey}`,
    "Content-Type": "application/json",
  };
  if (llm.provider === "openrouter") {
    const ref = process.env.OPENROUTER_HTTP_REFERER?.trim();
    if (ref) headers["HTTP-Referer"] = ref;
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (title) headers["X-Title"] = title;
  }
  return headers;
}

/**
 * Send a chat completion request and return the assistant message text.
 * Throws on network or provider errors.
 */
export async function callLlm(
  llm: LlmTarget,
  system: string,
  user: string,
  maxTokens?: number
): Promise<string> {
  const body: Record<string, unknown> = {
    model: llm.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  /* Google AI Studio ignores max_tokens and returns empty content when set.
     Output length is guided by the system prompt instead. */
  if (maxTokens && llm.provider === "openrouter") {
    body.max_tokens = maxTokens;
  }

  const res = await fetch(llm.url, {
    method: "POST",
    headers: buildLlmHeaders(llm),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg =
      extractProviderErrorMessage(data) ??
      `LLM error ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const text = extractMessage(data);
  if (!text) throw new Error("Model did not return a usable text response.");
  return text;
}
