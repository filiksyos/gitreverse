import {
  requireBuildUser,
  readJsonLimited,
  reserveBuild,
  generateProject,
  buildFailure,
} from "@/lib/build-project/server";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request) {
  let release: (() => void) | undefined;
  try {
    const user = await requireBuildUser(req);
    const body = (await readJsonLimited(req, 100000)) as { prompt?: unknown };
    release = reserveBuild(user.id);
    const project = await generateProject(body?.prompt, req.signal);
    return Response.json(
      { project },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return buildFailure(error);
  } finally {
    release?.();
  }
}
