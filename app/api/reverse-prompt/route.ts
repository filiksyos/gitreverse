import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getFileTree, getReadme, getRepoMeta } from "@/lib/github-client";
import { formatAsFilteredTree } from "@/lib/file-tree-formatter";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";
import {
  buildAzureChatCompletionsBody,
  buildAzureOpenAiUrl,
  getAzureOpenAiApiKey,
  getAzureOpenAiBaseUrl,
  getAzureQuickModel,
  getAzureQuickReasoningEffort,
  type AzureOpenAiReasoningEffort,
} from "@/lib/azure-openai";

const README_MAX_CHARS = 8000;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ORCAROUTER_URL = "https://api.orcarouter.ai/v1/chat/completions";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const GOOGLE_AI_STUDIO_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

type LlmProvider =
  | "openrouter"
  | "orcarouter"
  | "grok"
  | "azure"
  | "google";

type LlmTarget = {
  provider: LlmProvider;
  url: string;
  apiKey: string;
  model: string;
  reasoningEffort?: AzureOpenAiReasoningEffort;
};

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

/** When unset or `auto`, first configured key wins in this order. */
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

function resolveLlmTarget(): LlmTarget | { error: string } {
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

const inFlight = new Map<string, Promise<{ prompt: string } | NextResponse>>();

function buildUserMessage(
  owner: string,
  repo: string,
  meta: Awaited<ReturnType<typeof getRepoMeta>>,
  depth1Tree: string,
  readme: string,
  truncatedTree: boolean
): string {
  const topicsLine =
    meta.topics.length > 0 ? `\n**Topics:** ${meta.topics.join(", ")}` : "";
  const readmeBody = readme
    ? readme.length > README_MAX_CHARS
      ? `${readme.slice(0, README_MAX_CHARS)}\n\n… (README truncated)`
      : readme
    : "*(No README or empty)*";

  return [
    `# Repository: ${owner}/${repo}`,
    "",
    `**Description:** ${meta.description ?? "*(none)*"}`,
    `**Primary language:** ${meta.language ?? "*(unknown)*"}`,
    `**Stars:** ${meta.stargazers_count}`,
    `**Default branch:** ${meta.default_branch}`,
    topicsLine,
    truncatedTree ? "\n**Note:** Full repository tree was truncated by GitHub." : "",
    "",
    "## Root file tree (depth 1)",
    "",
    "```",
    depth1Tree,
    "```",
    "",
    "## README",
    "",
    readmeBody,
  ].join("\n");
}

/** Maps to client 429 handling → “Browse the library” (same as GitHub/rate limits). */
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

export async function POST(request: NextRequest) {
  let body: { repoUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repoUrl = body.repoUrl;
  if (typeof repoUrl !== "string") {
    return NextResponse.json(
      { error: "repoUrl is required (string)" },
      { status: 400 }
    );
  }

  const parsed = parseGitHubRepoInput(repoUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Could not parse a GitHub repo. Use a URL like https://github.com/owner/repo or owner/repo.",
      },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;

  const llm = resolveLlmTarget();
  if ("error" in llm) {
    return NextResponse.json({ error: llm.error }, { status: 500 });
  }

  const key = `${owner}/${repo}`;
  const existing = inFlight.get(key);
  if (existing) {
    const out = await existing;
    return out instanceof NextResponse
      ? out
      : NextResponse.json({ prompt: out.prompt }, { status: 200 });
  }

  const promise = (async () => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("prompt_cache")
          .select("prompt")
          .eq("owner", owner)
          .eq("repo", repo)
          .maybeSingle();
        if (!error && data?.prompt) {
          return { prompt: data.prompt as string };
        }
      } catch {
        // cache miss — continue to GitHub + LLM
      }
    }

    let meta: Awaited<ReturnType<typeof getRepoMeta>>;
    try {
      meta = await getRepoMeta(owner, repo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const branch = meta.default_branch;

    let tree: { tree: Array<{ path: string; type: string }>; truncated: boolean };
    let readme: string;
    try {
      [tree, readme] = await Promise.all([
        getFileTree(owner, repo, branch),
        getReadme(owner, repo, branch),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const depth1Tree = formatAsFilteredTree(
      tree.tree,
      `${owner}/${repo}`,
      undefined,
      1
    );

    const userContent = buildUserMessage(
      owner,
      repo,
      meta,
      depth1Tree,
      readme,
      tree.truncated
    );

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

    let res: Response;
    try {
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: userContent },
      ];
      const requestBody =
        llm.provider === "azure"
          ? buildAzureChatCompletionsBody({
              model: llm.model,
              messages,
              reasoningEffort: llm.reasoningEffort,
              maxCompletionTokens: 4096,
            })
          : {
              model: llm.model,
              messages,
            };

      res = await fetch(llm.url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (e) {
      const label = providerDisplayName(llm.provider);
      const message =
        e instanceof Error ? e.message : `${label} request failed`;
      return NextResponse.json(
        { error: `Generation failed: ${message}` },
        { status: 500 }
      );
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      const label = providerDisplayName(llm.provider);
      return NextResponse.json(
        { error: `${label} returned invalid JSON.` },
        { status: 502 }
      );
    }

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
        return NextResponse.json(
          { error: "Service is currently over capacity. Try again later." },
          { status: 429 }
        );
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
      return NextResponse.json(
        {
          error: isAuth ? authHint : `Generation failed: ${msg}`,
        },
        {
          status: isAuth ? 401 : res.status >= 400 && res.status < 600 ? res.status : 502,
        }
      );
    }

    const prompt = extractMessage(data);
    if (!prompt) {
      return NextResponse.json(
        { error: "Model did not return a usable text response." },
        { status: 500 }
      );
    }

    const sb = getSupabase();
    if (sb) {
      void sb
        .from("prompt_cache")
        .upsert(
          {
            owner,
            repo,
            prompt,
            cached_at: new Date().toISOString(),
          },
          { onConflict: "owner,repo" }
        )
        .then(async ({ error: upsertError }) => {
          if (upsertError) {
            console.error(
              "[reverse-prompt] cache upsert:",
              upsertError.message
            );
            return;
          }

          try {
            const { updatePromptEmbedding } = await import(
              "@/lib/prompt-cache-embedding"
            );
            await updatePromptEmbedding(sb, { owner, repo, prompt });
          } catch (embedError) {
            console.error(
              "[reverse-prompt] cache embedding:",
              embedError instanceof Error ? embedError.message : embedError
            );
          }

          try {
            const { updatePromptTitle } = await import("@/lib/prompt-cache-title");
            await updatePromptTitle(sb, { owner, repo, prompt });
          } catch (titleError) {
            console.error(
              "[reverse-prompt] cache title:",
              titleError instanceof Error ? titleError.message : titleError
            );
          }
        });
    }

    return { prompt };
  })();

  inFlight.set(key, promise);
  try {
    const out = await promise;
    return out instanceof NextResponse
      ? out
      : NextResponse.json({ prompt: out.prompt }, { status: 200 });
  } finally {
    inFlight.delete(key);
  }
}
