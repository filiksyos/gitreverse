import { NextRequest, NextResponse } from "next/server";
import { hasEmbeddingProvider } from "@/lib/embeddings";
import { browseLibrary, searchLibrary } from "@/lib/library-query";
import type { SortOption, LibraryKindFilter } from "@/lib/library-types";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 24;

function parseKindFilter(raw: string | null): LibraryKindFilter {
  const v = raw?.trim().toLowerCase();
  if (v === "code" || v === "website" || v === "game") return v;
  return "all";
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as SortOption;
  const kind = parseKindFilter(searchParams.get("kind"));
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(LIMIT), 10))
  );

  try {
    if (search) {
      const result = await searchLibrary({
        supabase,
        search,
        sort,
        page,
        limit,
        kind,
        useHybrid: hasEmbeddingProvider(),
      });
      return NextResponse.json(result, {
        headers: {
          "Cache-Control": "private, no-store",
        },
      });
    }

    const result = await browseLibrary({ supabase, sort, page, limit, kind });
    return NextResponse.json(
      { ...result, strategy: "browse" as const },
      {
        headers: {
          // Browse is cacheable; keep CDN warm so Library navigations stay fast.
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
