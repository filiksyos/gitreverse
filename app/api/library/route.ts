import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 24;

type SortOption = "trending" | "newest" | "oldest";

interface PromptRow {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
  cached_at: string;
  views?: number;
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = (searchParams.get("sort") ?? "trending") as SortOption;
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

  const rows = (data ?? []) as PromptRow[];

  /* Overlay deep prompts where available (best-effort) */
  if (rows.length > 0) {
    try {
      const orFilter = rows
        .map((r) => `and(owner.eq.${r.owner},repo.eq.${r.repo})`)
        .join(",");
      const { data: deepRows } = await supabase
        .from("deep_prompt_cache")
        .select("owner, repo, prompt")
        .or(orFilter);

      if (deepRows && deepRows.length > 0) {
        const deepMap = new Map<string, string>();
        for (const d of deepRows as Array<{ owner: string; repo: string; prompt: string }>) {
          deepMap.set(`${d.owner}/${d.repo}`, d.prompt);
        }
        for (const row of rows) {
          const deepPrompt = deepMap.get(`${row.owner}/${row.repo}`);
          if (deepPrompt) row.prompt = deepPrompt;
        }
      }
    } catch {
      /* deep_prompt_cache may not exist yet — ignore */
    }
  }

  return NextResponse.json({ data: rows, total: count ?? 0 });
}
