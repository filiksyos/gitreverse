import {
  buildAzureChatCompletionsBody,
  buildAzureOpenAiUrl,
  getAzureOpenAiApiKey,
  getAzureOpenAiBaseUrl,
  getAzureQuickModel,
  getAzureQuickReasoningEffort,
  resolveAzureDeploymentName,
  type AzureOpenAiReasoningEffort,
} from "@/lib/azure-openai";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ORCAROUTER_URL = "https://api.orcarouter.ai/v1/chat/completions";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const GOOGLE_AI_STUDIO_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

export type LlmProvider =
  | "openrouter"
  | "orcarouter"
  | "grok"
  | "azure"
  | "google";

export type LlmTarget = {
  provider: LlmProvider;
  url: string;
  apiKey: string;
  model: string;
  reasoningEffort?: AzureOpenAiReasoningEffort;
};

function grokTargetFromApiKey(apiKey: string): LlmTarget {
  return {
    provider: "grok",
    url: XAI_URL,
    apiKey,
    model: process.env.XAI_MODEL?.trim() || "grok-3",
  };
}

function openRouterTargetFromApiKey(apiKey: string): LlmTarget {
  return {
    provider: "openrouter",
    url: OPENROUTER_URL,
    apiKey,
    model: process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-pro",
  };
}

function orcarouterTargetFromApiKey(apiKey: string): LlmTarget {
  return {
    provider: "orcarouter",
    url: ORCAROUTER_URL,
    apiKey,
    model: process.env.ORCAROUTER_MODEL?.trim() || "anthropic/claude-sonnet-5",
  };
}

function azureTargetFromEnv(): LlmTarget | { error: string } {
  const apiKey = getAzureOpenAiApiKey();
  if (!apiKey) {
    return {
      error:
        "GITREVERSE_QUICK_LLM=azure requires AZURE_OPENAI_API_KEY in .env.local.",
    };
  }

  const baseUrl = getAzureOpenAiBaseUrl();
  if (!baseUrl) {
    return {
      error:
        "GITREVERSE_QUICK_LLM=azure requires AZURE_OPENAI_BASE_URL in .env.local.",
    };
  }

  return {
    provider: "azure",
    url: buildAzureOpenAiUrl("chat/completions"),
    apiKey,
    model: getAzureQuickModel(),
    reasoningEffort: getAzureQuickReasoningEffort(),
  };
}

function googleTargetFromApiKey(apiKey: string): LlmTarget {
  return {
    provider: "google",
    url: GOOGLE_AI_STUDIO_URL,
    apiKey,
    model: process.env.GOOGLE_AI_STUDIO_MODEL?.trim() || "gemini-2.5-pro",
  };
}

function resolveLlmTargetAuto(
  xaiKey: string | undefined,
  openRouterKey: string | undefined,
  orcarouterKey: string | undefined,
  azureKey: string | undefined,
  azureBaseUrl: string | undefined,
  googleKey: string | undefined
): LlmTarget | { error: string } {
  if (xaiKey) return grokTargetFromApiKey(xaiKey);
  if (openRouterKey) return openRouterTargetFromApiKey(openRouterKey);
  if (orcarouterKey) return orcarouterTargetFromApiKey(orcarouterKey);
  if (azureKey && azureBaseUrl) return azureTargetFromEnv();
  if (googleKey) return googleTargetFromApiKey(googleKey);
  return {
    error:
      "No LLM API key configured. Set GITREVERSE_QUICK_LLM and the matching key(s), or leave GITREVERSE_QUICK_LLM unset (auto) and set one of: XAI_API_KEY, OPENROUTER_API_KEY, ORCAROUTER_API_KEY, AZURE_OPENAI_API_KEY + AZURE_OPENAI_BASE_URL, GOOGLE_GENERATIVE_AI_API_KEY.",
  };
}

export function resolveLlmTarget(): LlmTarget | { error: string } {
  const modeRaw = process.env.GITREVERSE_QUICK_LLM?.trim().toLowerCase() ?? "";
  const mode = modeRaw === "" ? "auto" : modeRaw;

  const xaiKey = process.env.XAI_API_KEY?.trim();
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const orcarouterKey = process.env.ORCAROUTER_API_KEY?.trim();
  const azureKey = getAzureOpenAiApiKey() ?? undefined;
  const azureBaseUrl = getAzureOpenAiBaseUrl() ?? undefined;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

  if (mode === "auto") {
    return resolveLlmTargetAuto(
      xaiKey,
      openRouterKey,
      orcarouterKey,
      azureKey,
      azureBaseUrl,
      googleKey
    );
  }

  const valid = new Set([
    "grok",
    "openrouter",
    "orcarouter",
    "azure",
    "google",
  ]);
  if (!valid.has(mode)) {
    return {
      error:
        "Invalid GITREVERSE_QUICK_LLM. Use grok, openrouter, orcarouter, azure, google, or auto.",
    };
  }

  const explicitMode = mode as LlmProvider;

  switch (explicitMode) {
    case "grok":
      if (!xaiKey) {
        return {
          error:
            "GITREVERSE_QUICK_LLM=grok requires XAI_API_KEY in .env.local.",
        };
      }
      return grokTargetFromApiKey(xaiKey);
    case "openrouter":
      if (!openRouterKey) {
        return {
          error:
            "GITREVERSE_QUICK_LLM=openrouter requires OPENROUTER_API_KEY in .env.local.",
        };
      }
      return openRouterTargetFromApiKey(openRouterKey);
    case "orcarouter":
      if (!orcarouterKey) {
        return {
          error:
            "GITREVERSE_QUICK_LLM=orcarouter requires ORCAROUTER_API_KEY in .env.local.",
        };
      }
      return orcarouterTargetFromApiKey(orcarouterKey);
    case "azure":
      return azureTargetFromEnv();
    case "google":
      if (!googleKey) {
        return {
          error:
            "GITREVERSE_QUICK_LLM=google requires GOOGLE_GENERATIVE_AI_API_KEY in .env.local.",
        };
      }
      return googleTargetFromApiKey(googleKey);
  }
}

function providerDisplayName(p: LlmProvider): string {
  switch (p) {
    case "openrouter":
      return "OpenRouter";
    case "orcarouter":
      return "OrcaRouter";
    case "grok":
      return "xAI Grok";
    case "azure":
      return "Azure OpenAI";
    case "google":
      return "Google AI Studio";
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

function isExhaustedCreditsOrQuotaMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  if (
    lower.includes("requires more credits") ||
    lower.includes("can only afford") ||
    lower.includes("openrouter.ai/settings/credits") ||
    lower.includes("openrouter.ai/settings/keys") ||
    lower.includes("key limit exceeded") ||
    (lower.includes("total limit") && lower.includes("key")) ||
    (lower.includes("credit") && lower.includes("max_tokens"))
  ) {
    return true;
  }
  if (
    lower.includes("resource exhausted") ||
    lower.includes("quota exceeded") ||
    lower.includes("exceeded your current quota") ||
    lower.includes("billing has not been enabled")
  ) {
    return true;
  }
  if (
    lower.includes("insufficient_quota") ||
    lower.includes("rate_limit_exceeded")
  ) {
    return true;
  }
  return false;
}

function extractProviderErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const err = (data as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return null;
}

function extractMessage(data: unknown): string | null {
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

export type QuickLlmResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number };

export async function callQuickLlm(
  llm: LlmTarget,
  systemPrompt: string,
  userContent: string,
  maxCompletionTokens = 8192
): Promise<QuickLlmResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${llm.apiKey}`,
    "Content-Type": "application/json",
  };
  if (llm.provider === "openrouter") {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    if (referer) headers["HTTP-Referer"] = referer;
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (title) headers["X-Title"] = title;
  }

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userContent },
  ];
  const requestBody =
    llm.provider === "azure"
      ? buildAzureChatCompletionsBody({
          model: llm.model,
          messages,
          reasoningEffort: llm.reasoningEffort,
          maxCompletionTokens,
        })
      : {
          model: llm.model,
          messages,
          max_tokens: maxCompletionTokens,
        };

  const deploymentLabel =
    llm.provider === "azure" ? resolveAzureDeploymentName(llm.model) : llm.model;
  const startedAt = Date.now();

  let res: Response;
  try {
    res = await fetch(llm.url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    const label = providerDisplayName(llm.provider);
    const message = e instanceof Error ? e.message : `${label} request failed`;
    console.log(
      `[quick-llm] ${llm.provider}/${deploymentLabel} FAILED after ${Date.now() - startedAt}ms: ${message}`
    );
    return { ok: false, error: `Generation failed: ${message}`, status: 500 };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    const label = providerDisplayName(llm.provider);
    console.log(
      `[quick-llm] ${llm.provider}/${deploymentLabel} invalid JSON after ${Date.now() - startedAt}ms`
    );
    return {
      ok: false,
      error: `${label} returned invalid JSON.`,
      status: 502,
    };
  }

  const elapsedMs = Date.now() - startedAt;
  const usage =
    data && typeof data === "object" && "usage" in data
      ? (data as { usage?: Record<string, unknown> }).usage
      : undefined;
  console.log(
    `[quick-llm] ${llm.provider}/${deploymentLabel} reasoning=${llm.reasoningEffort ?? "n/a"} status=${res.status} elapsed=${elapsedMs}ms usage=${JSON.stringify(usage ?? {})}`
  );

  if (!res.ok) {
    const label = providerDisplayName(llm.provider);
    const msg =
      extractProviderErrorMessage(data) ??
      `${label} error ${res.status}: ${JSON.stringify(data).slice(0, 300)}`;

    const creditsExhausted =
      res.status === 429 ||
      res.status === 402 ||
      isExhaustedCreditsOrQuotaMessage(msg);

    if (creditsExhausted) {
      return {
        ok: false,
        error: "Service is currently over capacity. Try again later.",
        status: 429,
      };
    }

    const lower = msg.toLowerCase();
    const isAuth =
      res.status === 401 ||
      lower.includes("unauthorized") ||
      lower.includes("invalid api key");
    const authHint =
      llm.provider === "openrouter"
        ? "OpenRouter authentication failed. Check OPENROUTER_API_KEY in .env.local."
        : llm.provider === "orcarouter"
          ? "OrcaRouter authentication failed. Check ORCAROUTER_API_KEY in .env.local."
          : llm.provider === "grok"
            ? "xAI Grok authentication failed. Check XAI_API_KEY in .env.local."
            : llm.provider === "azure"
              ? "Azure OpenAI authentication failed. Check AZURE_OPENAI_API_KEY and AZURE_OPENAI_BASE_URL in .env.local."
              : "Google AI Studio authentication failed. Check GOOGLE_GENERATIVE_AI_API_KEY in .env.local.";
    return {
      ok: false,
      error: isAuth ? authHint : `Generation failed: ${msg}`,
      status: isAuth ? 401 : res.status >= 400 && res.status < 600 ? res.status : 502,
    };
  }

  const text = extractMessage(data);
  if (!text) {
    return {
      ok: false,
      error: "Model did not return a usable text response.",
      status: 500,
    };
  }

  return { ok: true, text };
}
