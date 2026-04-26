import { normalizeRepoSegment, parseGitHubRepoInput } from "@/lib/parse-github-repo";

/** Hero “Örnek Depoları deneyin” — görüntüleme sayımı izlemesinden hariç tutulmuştur; böylece kullanım istatistikleri temsil edici kalır.*/
export const HOME_EXAMPLES = [
  { label: "Next.js", url: "https://github.com/vercel/next.js" },
  { label: "Openclaw", url: "https://github.com/openclaw/openclaw" },
  { label: "React", url: "https://github.com/facebook/react" },
  { label: "Supabase", url: "https://github.com/supabase/supabase" },
  { label: "Linux", url: "https://github.com/torvalds/linux" },
] as const;

const EXAMPLE_OWNER_REPO_KEYS = new Set(
  HOME_EXAMPLES.map((ex) => {
    const p = parseGitHubRepoInput(ex.url);
    if (!p) return null;
    return `${p.owner.toLowerCase()}/${normalizeRepoSegment(p.repo).toLowerCase()}`;
  }).filter((k): k is string => k != null)
);

export function isHomeExampleRepo(owner: string, repo: string): boolean {
  const key = `${owner.toLowerCase()}/${normalizeRepoSegment(repo).toLowerCase()}`;
  return EXAMPLE_OWNER_REPO_KEYS.has(key);
}
