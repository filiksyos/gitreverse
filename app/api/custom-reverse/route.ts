import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const DEFAULT_CUSTOM_REVERSE_URL = "http://localhost:3001";

function getServiceUrl(): string {
  return (
    process.env.CUSTOM_REVERSE_SERVICE_URL?.trim() || DEFAULT_CUSTOM_REVERSE_URL
  );
}

/** 15 min hard cap — route-level abort. */
const ROUTE_TIMEOUT_MS = 900_000;

const inFlight = new Map<string, Promise<NextResponse>>();

/** MD5 hex of UTF-8 focus — must match `md5(focus::text)` in Postgres (see `focus_fingerprint` column). */
function focusFingerprint(focus: string): string {
  return createHash("md5").update(focus, "utf8").digest("hex");
}

function buildInFlightKey(owner: string, repo: string, focus: string): string {
  return `${owner}/${repo}:${focusFingerprint(focus)}`;
}

/**
 * Raw http.request with no socket/headers timeout (Node default is 0 = none).
 * Needed because global fetch (Undici) has a 5-minute headersTimeout by default,
 * which causes "fetch failed" on runs that take longer before sending any response.
 */
function httpPost(
  url: string,
  body: string
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 0, // no socket inactivity timeout
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: unknown;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new Error(`Upstream returned non-JSON: ${text.slice(0, 200)}`));
            return;
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function persistCustomPromptCache(opts: {
  repoUrl: string;
  focus: string;
  prompt: string;
}): void {
  const sb = getSupabase();
  if (!sb) return;
  const parsed = parseGitHubRepoInput(opts.repoUrl);
  if (!parsed) return;
  const fp = focusFingerprint(opts.focus);
  void sb
    .from("custom_prompt_cache")
    .upsert(
      {
        owner: parsed.owner,
        repo: parsed.repo,
        focus: opts.focus,
        focus_fingerprint: fp,
        prompt: opts.prompt,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "owner,repo,focus_fingerprint" }
    )
    .then(({ error }) => {
      if (error) {
        console.error(
          "[custom-reverse] Supabase upsert failed:",
          error.message
        );
      }
    });
}

async function executeCustomReverse(opts: {
  repoUrl: string;
  customPrompt: string | undefined;
  isDeep: boolean;
  focus: string;
  parsed: { owner: string; repo: string } | null;
}): Promise<NextResponse> {
  const { repoUrl, customPrompt, isDeep, focus, parsed } = opts;
  const fp = focusFingerprint(focus);

  if (parsed) {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("custom_prompt_cache")
          .select("prompt")
          .eq("owner", parsed.owner)
          .eq("repo", parsed.repo)
          .eq("focus_fingerprint", fp)
          .maybeSingle();
        if (!error && data?.prompt) {
          return NextResponse.json({ prompt: data.prompt as string });
        }
      } catch {
        // cache miss — continue to upstream
      }
    }
  }

  const base = getServiceUrl().replace(/\/$/, "");

  const upstreamBody: { repoUrl: string; customPrompt?: string; mode?: "deep" } =
    {
      repoUrl: repoUrl.trim(),
    };
  if (isDeep) {
    upstreamBody.mode = "deep";
  } else {
    upstreamBody.customPrompt = customPrompt!.trim();
  }

  let upstreamStatus: number;
  let data: unknown;
  try {
    const timer = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("__timeout__")),
        ROUTE_TIMEOUT_MS
      )
    );
    const result = await Promise.race([
      httpPost(`${base}/reverse`, JSON.stringify(upstreamBody)),
      timer,
    ]);
    upstreamStatus = result.status;
    data = result.json;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg === "__timeout__";
    return NextResponse.json(
      {
        error: isTimeout
          ? "Manual control timed out. Try a smaller repo or a narrower prompt."
          : `Manual control service unreachable (${msg}). Check CUSTOM_REVERSE_SERVICE_URL and that the service is running.`,
      },
      { status: 503 }
    );
  }

  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    const err =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${upstreamStatus})`;
    return NextResponse.json(
      { error: err },
      { status: upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502 }
    );
  }

  const prompt =
    data &&
    typeof data === "object" &&
    "prompt" in data &&
    typeof (data as { prompt: unknown }).prompt === "string"
      ? (data as { prompt: string }).prompt
      : null;

  if (!prompt) {
    return NextResponse.json(
      { error: "Manual control service did not return a prompt." },
      { status: 502 }
    );
  }

  persistCustomPromptCache({
    repoUrl: repoUrl.trim(),
    focus,
    prompt,
  });

  return NextResponse.json({ prompt }, { status: 200 });
}

export async function POST(request: NextRequest) {
  let body: { repoUrl?: string; customPrompt?: string; mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const repoUrl = body.repoUrl;
  const customPrompt = body.customPrompt;
  const isDeep = body.mode === "deep";

  if (typeof repoUrl !== "string" || !repoUrl.trim()) {
    return NextResponse.json(
      { error: "repoUrl is required (string)" },
      { status: 400 }
    );
  }
  if (
    !isDeep &&
    (typeof customPrompt !== "string" || !customPrompt.trim())
  ) {
    return NextResponse.json(
      { error: "customPrompt is required (string)" },
      { status: 400 }
    );
  }

  const trimmedUrl = repoUrl.trim();
  const focus = isDeep ? "[deep] whole codebase" : customPrompt!.trim();
  const parsed = parseGitHubRepoInput(trimmedUrl);
  const parsedForCache = parsed
    ? { owner: parsed.owner, repo: parsed.repo }
    : null;

  if (!parsedForCache) {
    return executeCustomReverse({
      repoUrl: trimmedUrl,
      customPrompt,
      isDeep,
      focus,
      parsed: null,
    });
  }

  const key = buildInFlightKey(parsedForCache.owner, parsedForCache.repo, focus);
  const existing = inFlight.get(key);
  if (existing) {
    return await existing;
  }

  const promise = executeCustomReverse({
    repoUrl: trimmedUrl,
    customPrompt,
    isDeep,
    focus,
    parsed: parsedForCache,
  });
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}
