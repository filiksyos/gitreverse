import {
  requireBuildUser,
  readJsonLimited,
  buildFailure,
  BuildError,
} from "@/lib/build-project/server";
import { exportProject } from "@/lib/build-project/github";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: Request) {
  try {
    const user = await requireBuildUser(req);
    const body = (await readJsonLimited(req, 800000)) as {
      project?: unknown;
      githubToken?: unknown;
      name?: unknown;
      confirmPrivateRepository?: unknown;
    };
    if (body?.confirmPrivateRepository !== true)
      throw new BuildError("Confirm creating a new private repository first.");
    const result = await exportProject(
      user,
      body.project,
      body.githubToken,
      body.name,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return buildFailure(error);
  }
}
