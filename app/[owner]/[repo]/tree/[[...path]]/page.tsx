import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-github-repo";

type PageProps = {
  params: Promise<{ owner: string; repo: string; path?: string[] }>;
};

/**
 * GitHub-style `/owner/repo/tree/branch/...` → `/owner/repo` (avoids 404).
 * Subfolder-scoped reverse context: planned for later; see README.
 */
export default async function RepoTreeRedirectPage({ params }: PageProps) {
  await connection();
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  redirect(`/${encodeURIComponent(owner)}/${encodeURIComponent(repoNorm)}`);
}
