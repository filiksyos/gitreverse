/**
 * Deep Reverse API — multi-phase pipeline using DeepWiki + LLM.
 *
 * GET  → eligibility check + remaining uses (fingerprint derived from headers)
 * POST { repoUrl } → SSE stream with progress events
 */

import { NextRequest, NextResponse } from "next/server";
import { readWikiStructure, readWikiContents, extractPages } from "@/lib/deepwiki-client";
import { deriveFingerprint } from "@/lib/fingerprint-server";
import { getRepoMeta } from "@/lib/github-client";
import { type LlmTarget, resolveLlmTarget, callLlm } from "@/lib/llm-client";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";
import {
  DEEP_ANALYSIS_PROMPT,
  DEEP_SYNTHESIS_PROMPT,
  buildAnalysisUserMessage,
  buildSynthesisUserMessage,
} from "@/lib/deep-reverse-prompts";

const MAX_USES_PER_WEEK = Number(process.env.DEEP_REVERSE_MAX_USES_PER_WEEK) || 3;
const DEEP_MAX_TOKENS = 14_000;
const ANALYSIS_MAX_TOKENS = 1_000;
const CACHE_TTL_HOURS = Number(process.env.DEEP_CACHE_TTL_HOURS) || 168;
const ROLLOUT_PERCENT = Number(
  process.env.DEEP_REVERSE_ROLLOUT_PERCENT ?? "50"
);

/* Per-instance dedup — prevents duplicate processing within a single serverless instance.
   Does not deduplicate across multiple Vercel instances. */
const inFlight = new Set<string>();

/** Deterministic rollout gate based on the last 2 hex chars of fingerprint. */
function isEligible(fingerprint: string): boolean {
  const tail = parseInt(fingerprint.slice(-2), 16);
  return tail < (ROLLOUT_PERCENT / 100) * 256;
}

/** Parse the LLM's JSON array of section paths, tolerating markdown fences. */
function parseSectionPaths(raw: string): string[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/, "")
      .replace(/\s*```$/, "");
  }
  const arr: unknown = JSON.parse(cleaned);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, 5);
}

function createDeepReverseStream(
  owner: string,
  repo: string,
  usageId: number | null,
  repoKey: string,
  llm: LlmTarget
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: string, payload: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
            )
          );
        } catch {
          /* client disconnected — swallow */
        }
      };

      const supabase = getSupabase();

      try {
        /* Phase 1: Wiki structure */
        send("progress", {
          phase: "structure",
          message: "Fetching wiki structure…",
        });

        let structure: string;
        try {
          structure = await readWikiStructure(owner, repo);
        } catch {
          /* Repo not indexed — refund the usage attempt */
          if (usageId && supabase) {
            await supabase
              .from("deep_reverse_usage")
              .delete()
              .eq("id", usageId);
          }
          send("error", {
            code: "deepwiki_not_indexed",
            message: `${owner}/${repo} is not yet indexed by DeepWiki. Try again later or use standard reverse.`,
          });
          return;
        }

        if (!structure || structure.trim().length < 20) {
          if (usageId && supabase) {
            await supabase
              .from("deep_reverse_usage")
              .delete()
              .eq("id", usageId);
          }
          send("error", {
            code: "deepwiki_not_indexed",
            message: `${owner}/${repo} has no DeepWiki documentation yet.`,
          });
          return;
        }

        /* Phase 2: LLM picks 1-5 key sections */
        send("progress", {
          phase: "analysis",
          message: "Analyzing structure…",
        });
        const analysisMsg = buildAnalysisUserMessage(
          owner,
          repo,
          structure
        );
        const sectionsRaw = await callLlm(
          llm,
          DEEP_ANALYSIS_PROMPT,
          analysisMsg,
          ANALYSIS_MAX_TOKENS
        );

        let sectionPaths: string[];
        try {
          sectionPaths = parseSectionPaths(sectionsRaw);
        } catch {
          sectionPaths = [];
        }

        /* Phase 3: Fetch full wiki and extract selected sections */
        send("progress", {
          phase: "details",
          message: "Fetching full documentation…",
        });

        let fullWiki: string;
        try {
          fullWiki = await readWikiContents(owner, repo);
        } catch {
          /* read_wiki_contents failed — refund and bail */
          if (usageId && supabase) {
            await supabase
              .from("deep_reverse_usage")
              .delete()
              .eq("id", usageId);
          }
          send("error", {
            code: "deepwiki_not_indexed",
            message: `Could not fetch documentation for ${owner}/${repo}. Try indexing it at deepwiki.com first.`,
          });
          return;
        }

        const extracted = sectionPaths.length > 0
          ? extractPages(fullWiki, sectionPaths)
          : [];

        const sections: Array<{ path: string; content: string }> = extracted.map(
          (p) => ({ path: p.title, content: p.content })
        );

        /* Fallback: if no sections matched, use the full wiki (truncated) */
        if (sections.length === 0) {
          const truncated = fullWiki.length > 60_000
            ? fullWiki.slice(0, 60_000) + "\n\n… (truncated)"
            : fullWiki;
          sections.push({ path: "Full Documentation", content: truncated });
        }

        send("progress", {
          phase: "details",
          message: `Extracted ${sections.length} sections from documentation.`,
        });

        /* Fetch repo metadata from GitHub (best-effort) */
        let meta: {
          description: string | null;
          language: string | null;
          stargazers_count: number;
        };
        try {
          meta = await getRepoMeta(owner, repo);
        } catch {
          meta = { description: null, language: null, stargazers_count: 0 };
        }

        /* Phase 4: Synthesize deep prompt */
        send("progress", {
          phase: "synthesis",
          message: "Generating deep prompt…",
        });
        const synthMsg = buildSynthesisUserMessage(
          owner,
          repo,
          meta,
          sections
        );
        const prompt = await callLlm(
          llm,
          DEEP_SYNTHESIS_PROMPT,
          synthMsg,
          DEEP_MAX_TOKENS
        );

        /* Cache the result */
        if (supabase) {
          await supabase
            .from("deep_prompt_cache")
            .upsert(
              {
                owner,
                repo,
                prompt,
                cached_at: new Date().toISOString(),
              },
              { onConflict: "owner,repo" }
            )
            .then(({ error }) => {
              if (error) {
                console.error(
                  "[deep-reverse] cache upsert:",
                  error.message
                );
              }
            });
        }

        send("complete", { prompt });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message: `Deep reverse failed: ${message}` });
      } finally {
        inFlight.delete(repoKey);
        controller.close();
      }
    },
  });
}

export async function GET(request: NextRequest) {
  const fp = deriveFingerprint(request);
  if (!fp) {
    return NextResponse.json({ eligible: false, remaining: 0 });
  }
  const eligible = isEligible(fp);
  let remaining = MAX_USES_PER_WEEK;

  if (eligible) {
    const supabase = getSupabase();
    if (supabase) {
      const weekAgo = new Date(
        Date.now() - 7 * 24 * 3600_000
      ).toISOString();
      const { count } = await supabase
        .from("deep_reverse_usage")
        .select("*", { count: "exact", head: true })
        .eq("fingerprint", fp)
        .gte("used_at", weekAgo);
      remaining = Math.max(0, MAX_USES_PER_WEEK - (count ?? 0));
    }
  }

  return NextResponse.json({ eligible, remaining });
}

export async function POST(request: NextRequest) {
  let body: { repoUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  /* Validate input */
  const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl : "";
  const parsed = parseGitHubRepoInput(repoUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Could not parse a GitHub repo. Use https://github.com/owner/repo or owner/repo.",
      },
      { status: 400 }
    );
  }

  const fp = deriveFingerprint(request);
  if (!fp) {
    return NextResponse.json(
      { error: "X-Fingerprint header is required" },
      { status: 400 }
    );
  }

  const { owner, repo } = parsed;
  const repoKey = `${owner}/${repo}`;

  /* Supabase is required for deep reverse (rate limiting + cache) */
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Deep reverse requires database configuration." },
      { status: 503 }
    );
  }

  /* Eligibility (gradual rollout by fingerprint) */
  if (!isEligible(fp)) {
    return NextResponse.json(
      { error: "deep_reverse_not_available" },
      { status: 403 }
    );
  }

  /* LLM must be configured */
  const llmCheck = resolveLlmTarget();
  if ("error" in llmCheck) {
    return NextResponse.json(
      { error: llmCheck.error },
      { status: 500 }
    );
  }

  /* Cache check */
  try {
    const { data } = await supabase
      .from("deep_prompt_cache")
      .select("prompt, cached_at")
      .eq("owner", owner)
      .eq("repo", repo)
      .maybeSingle();

    if (data?.prompt && data.cached_at) {
      const ageHours =
        (Date.now() - new Date(data.cached_at as string).getTime()) / 36e5;
      if (ageHours < CACHE_TTL_HOURS) {
        return NextResponse.json({
          prompt: data.prompt as string,
          cached: true,
        });
      }
    }
  } catch {
    /* cache miss — proceed */
  }

  /* In-flight dedup: if someone is already processing this repo, ask client to retry */
  if (inFlight.has(repoKey)) {
    return NextResponse.json(
      { status: "processing", retryAfter: 5 },
      { status: 202 }
    );
  }

  /* Rate limit: 3 deep reverses per week per fingerprint */
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const { count } = await supabase
    .from("deep_reverse_usage")
    .select("*", { count: "exact", head: true })
    .eq("fingerprint", fp)
    .gte("used_at", weekAgo);

  if ((count ?? 0) >= MAX_USES_PER_WEEK) {
    return NextResponse.json(
      { error: "deep_reverse_limit_reached", remaining: 0 },
      { status: 429 }
    );
  }

  /* Record usage (refunded if DeepWiki not indexed) */
  const { data: usageRow } = await supabase
    .from("deep_reverse_usage")
    .insert({
      fingerprint: fp,
      ip:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      owner,
      repo,
      used_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  const usageId = (usageRow as { id: number } | null)?.id ?? null;

  /* Mark in-flight */
  inFlight.add(repoKey);

  /* Return SSE streaming response */
  return new Response(
    createDeepReverseStream(owner, repo, usageId, repoKey, llmCheck),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    }
  );
}
