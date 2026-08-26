import { NextRequest, NextResponse } from "next/server";
import { isValidGameSlug } from "@/lib/parse-game-input";
import {
  isSafeAssetFilename,
  readGameAssetFile,
} from "@/lib/game-asset-storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string; file: string }> };

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { slug: rawSlug, file: rawFile } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const filename = rawFile.trim();

  if (!isValidGameSlug(slug) || !isSafeAssetFilename(filename)) {
    return NextResponse.json({ error: "Invalid asset path." }, { status: 400 });
  }

  const bytes = await readGameAssetFile(slug, filename);
  if (!bytes) {
    return NextResponse.json(
      { error: "Asset not found. Run game reverse first." },
      { status: 404, headers: corsHeaders() }
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: corsHeaders({
      "Content-Type": "model/gltf-binary",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": request.nextUrl.searchParams.has("v")
        ? "private, no-store"
        : "public, max-age=86400, s-maxage=86400",
    }),
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders({
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    }),
  });
}
