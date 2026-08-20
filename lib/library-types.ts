export type LibraryEntryKind = "code" | "website" | "game";

export type LibraryKindFilter = "all" | LibraryEntryKind;

export type LibraryEntry = {
  kind: LibraryEntryKind;
  key: string;
  prompt: string;
  cached_at: string;
  title: string;
  href: string;
  views?: number;
  relevance_score?: number;
  /** Code reverse */
  id?: number;
  owner?: string;
  repo?: string;
  /** Website reverse */
  slug?: string;
  target_url?: string;
  /** Game reverse */
  game_name?: string;
};

export type SortOption = "trending" | "newest" | "oldest";

export function hostnameFromUrl(url: string, fallback: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return fallback;
  }
}

export function codeEntryFromRow(row: {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
  cached_at: string;
  views?: number | null;
  title?: string | null;
  relevance_score?: number;
}): LibraryEntry {
  return {
    kind: "code",
    key: `code:${row.id}`,
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    prompt: row.prompt,
    cached_at: row.cached_at,
    views: row.views ?? 0,
    title: row.title?.trim() || row.repo,
    href: `/${encodeURIComponent(row.owner)}/${encodeURIComponent(row.repo)}`,
    relevance_score: row.relevance_score,
  };
}

export function websiteEntryFromRow(row: {
  slug: string;
  target_url: string;
  prompt: string;
  cached_at: string;
  relevance_score?: number;
}): LibraryEntry {
  const hostname = hostnameFromUrl(row.target_url, row.slug);
  return {
    kind: "website",
    key: `website:${row.slug}`,
    slug: row.slug,
    target_url: row.target_url,
    prompt: row.prompt,
    cached_at: row.cached_at,
    title: hostname,
    href: `/website/${encodeURIComponent(row.slug)}?url=${encodeURIComponent(row.target_url)}`,
    relevance_score: row.relevance_score,
  };
}

export function gameEntryFromRow(row: {
  slug: string;
  game_name: string;
  prompt: string;
  cached_at: string;
  relevance_score?: number;
}): LibraryEntry {
  return {
    kind: "game",
    key: `game:${row.slug}`,
    slug: row.slug,
    game_name: row.game_name,
    prompt: row.prompt,
    cached_at: row.cached_at,
    title: row.game_name,
    href: `/game/${encodeURIComponent(row.slug)}?name=${encodeURIComponent(row.game_name)}`,
    relevance_score: row.relevance_score,
  };
}

export function sortLibraryEntries(
  entries: LibraryEntry[],
  sort: SortOption
): LibraryEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case "oldest":
      sorted.sort(
        (a, b) =>
          new Date(a.cached_at).getTime() - new Date(b.cached_at).getTime()
      );
      break;
    case "trending":
      sorted.sort((a, b) => {
        const viewDiff = (b.views ?? 0) - (a.views ?? 0);
        if (viewDiff !== 0) return viewDiff;
        return (
          new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
        );
      });
      break;
    case "newest":
    default:
      sorted.sort(
        (a, b) =>
          new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
      );
      break;
  }
  return sorted;
}

export function paginateLibraryEntries(
  entries: LibraryEntry[],
  page: number,
  limit: number
): LibraryEntry[] {
  const from = page * limit;
  return entries.slice(from, from + limit);
}
