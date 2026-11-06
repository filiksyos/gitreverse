import { NextRequest, NextResponse } from "next/server";
import {
  isValidGitHubRepoPath,
  normalizeRepoSegment,
} from "@/lib/parse-github-repo";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  hashVisitorIp,
  isDefaultIpHashSaltInProduction,
} from "@/lib/visitor-ip";

export const runtime = "nodejs";

if (isDefaultIpHashSaltInProduction()) {
  throw new Error(
    "[increment-views] VIEWS_IP_SALT is not set. " +
      "Set a random secret (openssl rand -hex 32) in your deployment env."
  );
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

  const supabase = getSupabaseAdmin();
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
