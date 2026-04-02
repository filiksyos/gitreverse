import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";
import { getFileTree, getReadme, getRepoMeta } from "@/lib/github-client";
import { formatAsFilteredTree } from "@/lib/file-tree-formatter";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

const README_MAX_CHARS = 8000;
const GOOGLE_AI_STUDIO_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

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

function cacheTtlHours(): number {
  const n = Number(process.env.CACHE_TTL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
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

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const model =
    process.env.GOOGLE_AI_STUDIO_MODEL?.trim() || "gemini-2.5-pro";

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
        const ttlHours = cacheTtlHours();
        const { data, error } = await supabase
          .from("prompt_cache")
          .select("prompt, cached_at")
          .eq("owner", owner)
          .eq("repo", repo)
          .maybeSingle();
        if (!error && data?.prompt && data.cached_at) {
          const ageHours =
            (Date.now() - new Date(data.cached_at).getTime()) / 36e5;
          if (ageHours < ttlHours) {
            return { prompt: data.prompt as string };
          }
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

    let res: Response;
    try {
      res = await fetch(GOOGLE_AI_STUDIO_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Google AI Studio request failed";
      return NextResponse.json(
        { error: `Generation failed: ${message}` },
        { status: 500 }
      );
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return NextResponse.json(
        { error: "Google AI Studio returned invalid JSON." },
        { status: 502 }
      );
    }

    if (!res.ok) {
      const errObj = data as { error?: { message?: string } };
      const msg =
        errObj?.error?.message ??
        `Google AI Studio error ${res.status}: ${JSON.stringify(data).slice(0, 300)}`;
      const lower = msg.toLowerCase();
      const isAuth =
        res.status === 401 ||
        lower.includes("unauthorized") ||
        lower.includes("invalid api key");
      return NextResponse.json(
        {
          error: isAuth
            ? "Google AI Studio authentication failed. Check GOOGLE_GENERATIVE_AI_API_KEY in .env.local."
            : `Generation failed: ${msg}`,
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
        .then(({ error: upsertError }) => {
          if (upsertError) {
            console.error(
              "[reverse-prompt] cache upsert:",
              upsertError.message
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
