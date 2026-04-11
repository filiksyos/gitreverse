import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isHomeExampleRepo } from "@/lib/home-example-repos";
import {
  isValidGitHubRepoPath,
  normalizeRepoSegment,
} from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

/* Salt for IP hashing. The default below provides only token protection since
   it lives in the public source tree — anyone can recompute hashes for the
   IPv4 space. Set VIEWS_IP_SALT in the deployment environment to a long random
   secret for meaningful protection of stored hashes. */
const DEFAULT_IP_HASH_SALT = "gitreverse-views-v1";
const IP_HASH_SALT =
  process.env.VIEWS_IP_SALT?.trim() || DEFAULT_IP_HASH_SALT;

if (
  IP_HASH_SALT === DEFAULT_IP_HASH_SALT &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "[increment-views] VIEWS_IP_SALT is not set — falling back to the public default. " +
      "Set a random secret in your deployment env for production use."
  );
}

/** Derive a stable, privacy-preserving hash of the visitor IP.
 *
 *  Header trust order:
 *  1. `x-real-ip` — set by Vercel (and most reverse proxies) directly from
 *     the connecting socket, so it cannot be spoofed by the client.
 *  2. `x-forwarded-for` — first non-empty entry. Less trustworthy (the client
 *     can prepend arbitrary values), but better than nothing for non-Vercel
 *     deployments. We skip empty entries to avoid the `,real-ip` empty-prefix
 *     bypass where `split(",")[0]` would otherwise return "".
 */
function hashVisitorIp(req: NextRequest): string | null {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return createHash("sha256")
      .update(`${IP_HASH_SALT}:${realIp}`)
      .digest("hex");
  }

  const xffFirst = req.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  if (xffFirst) {
    return createHash("sha256")
      .update(`${IP_HASH_SALT}:${xffFirst}`)
      .digest("hex");
  }

  return null;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("owner" in body) ||
    !("repo" in body)
  ) {
    return NextResponse.json(
      { error: "Expected JSON body with owner and repo." },
      { status: 400 }
    );
  }

  const ownerRaw = (body as { owner: unknown }).owner;
  const repoRaw = (body as { repo: unknown }).repo;
  if (typeof ownerRaw !== "string" || typeof repoRaw !== "string") {
    return NextResponse.json(
      { error: "owner and repo must be strings." },
      { status: 400 }
    );
  }

  const owner = ownerRaw.trim();
  const repo = normalizeRepoSegment(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    return NextResponse.json({ error: "Invalid owner or repo." }, { status: 400 });
  }

  if (isHomeExampleRepo(owner, repo)) {
    return NextResponse.json({ ok: true });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const ipHash = hashVisitorIp(req);

  const { error } = await supabase.rpc("increment_views", {
    p_owner: owner,
    p_repo: repo,
    p_ip_hash: ipHash,
  });
  if (error) {
    console.warn("[increment-views]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
