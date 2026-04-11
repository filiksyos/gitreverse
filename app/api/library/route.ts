import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 24;

type SortOption = "trending" | "newest" | "oldest";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as SortOption;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? String(LIMIT), 10)));

  const from = page * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("prompt_cache")
    .select("id, owner, repo, prompt, cached_at, views", { count: "exact" });

  if (search) {
    query = query.or(
      `owner.ilike.%${search}%,repo.ilike.%${search}%,prompt.ilike.%${search}%`
    );
  }

  switch (sort) {
    case "oldest":
      query = query.order("cached_at", { ascending: true });
      break;
    case "newest":
      query = query.order("cached_at", { ascending: false });
      break;
    case "trending":
    default:
      query = query
        .order("views", { ascending: false })
        .order("cached_at", { ascending: false });
      break;
  }

  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
