import { notFound } from "next/navigation";
import { ReversePromptHome } from "@/components/reverse-prompt-home";
import { isValidGitHubRepoPath, normalizeRepoSegment } from "@/lib/parse-github-repo";
import { getSupabase } from "@/lib/supabase";

type PageProps = {
  params: Promise<{ owner: string; repo: string }>;
};

export default async function RepoPage({ params }: PageProps) {
  const { owner: ownerRaw, repo: repoRaw } = await params;
  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw);

  if (!isValidGitHubRepoPath(owner, repo)) {
    notFound();
  }

  const repoNorm = normalizeRepoSegment(repo);
  const initialRepoInput = `${owner}/${repoNorm}`;

  const supabase = getSupabase();
  if (supabase) {
    void supabase.rpc("increment_views", {
      p_owner: owner,
      p_repo: repoNorm,
    });
  }

  return (
    <ReversePromptHome initialRepoInput={initialRepoInput} autoSubmit />
  );
}
