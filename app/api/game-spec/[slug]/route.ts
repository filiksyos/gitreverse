import { NextRequest, NextResponse } from "next/server";
import { isValidGameSlug } from "@/lib/parse-game-input";
import { readSpecMd } from "@/lib/game-reverse-storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();

  if (!isValidGameSlug(slug)) {
    return NextResponse.json({ error: "Invalid slug." }, { status: 400 });
  }

  const specMd = await readSpecMd(slug);
  if (!specMd) {
    return NextResponse.json(
      { error: "GAME.md not found. Run game reverse first." },
      { status: 404 }
    );
  }

  const download = request.nextUrl.searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
    "Access-Control-Allow-Origin": "*",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="${slug}-GAME.md"`;
  }

  return new NextResponse(specMd, {
    status: 200,
    headers,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
