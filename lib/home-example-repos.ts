import { normalizeRepoSegment, parseGitHubRepoInput } from "@/lib/parse-github-repo";

/** Hero “Try example repos” — excluded from view-count tracking so usage stats stay representative. */
export const HOME_EXAMPLES = [
  { label: "Next.js", url: "https://github.com/vercel/next.js" },
  { label: "Openclaw", url: "https://github.com/openclaw/openclaw" },
  { label: "React", url: "https://github.com/facebook/react" },
  { label: "Supabase", url: "https://github.com/supabase/supabase" },
  { label: "Linux", url: "https://github.com/torvalds/linux" },
] as const;

/** Hero “Try example websites” for home Website mode. */
export const HOME_WEBSITE_EXAMPLES = [
  { label: "YouTube", url: "https://youtube.com" },
  { label: "Pinterest", url: "https://pinterest.com" },
  { label: "Xbox", url: "https://xbox.com" },
  { label: "Apple", url: "https://apple.com" },
  { label: "Discord", url: "https://discord.com" },
] as const;

/** Hero “Try example games” for home Game mode. */
export const HOME_GAME_EXAMPLES = [
  { label: "GTA Vice City", name: "GTA Vice City" },
  { label: "Celeste", name: "Celeste" },
  { label: "Worms Armageddon", name: "Worms Armageddon" },
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
