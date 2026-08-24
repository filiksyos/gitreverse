import { NextResponse } from "next/server";
import { autoRigToQuaterniusKernel } from "@/lib/auto-rig-humanoid";
import { buildTPoseDummyGlb } from "@/lib/tpose-dummy";

export const runtime = "nodejs";

function corsHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

export async function GET() {
  const dummy = await buildTPoseDummyGlb();
  const rigged = await autoRigToQuaterniusKernel(dummy);
  if (!rigged.ok) {
    return NextResponse.json(
      { error: rigged.error },
      { status: 500, headers: corsHeaders() }
    );
  }

  return new NextResponse(new Uint8Array(rigged.glb), {
    status: 200,
    headers: corsHeaders({
      "Content-Type": "model/gltf-binary",
      "Content-Disposition": 'inline; filename="kernel-fixture.glb"',
      "Cache-Control": "public, max-age=60",
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
