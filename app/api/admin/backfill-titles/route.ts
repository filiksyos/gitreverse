import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { backfillPromptTitles } from "@/lib/prompt-cache-title";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  if (!adminSecret) return false;

  const auth = req.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice("Bearer ".length) === adminSecret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))
  );

  try {
    const result = await backfillPromptTitles(supabase, {
      concurrency: 5,
      maxRows: limit,
    });

    return NextResponse.json({
      ...result,
      message: result.done
        ? "Title backfill complete."
        : "Chunk processed. Call again until done=true.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backfill failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
