import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";
import {
  codeEntryFromRow,
  paginateLibraryEntries,
  sortLibraryEntries,
  websiteEntryFromRow,
  type LibraryEntry,
  type SortOption,
  type LibraryKindFilter,
  type LibraryEntryKind,
  type LibraryResult,
} from "@/lib/library-types";

const VIEW_BOOST = 0.4;
const TRENDING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Cap how many rows we pull per source when merging pages. */
const MAX_FETCH_LIMIT = 96;

const CODE_TABLE = "library_code_entries";
const WEBSITE_TABLE = "library_website_entries";
const CODE_COLUMNS = "id, owner, repo, prompt, cached_at, views, title";
const WEBSITE_COLUMNS = "slug, target_url, prompt, cached_at";

type PromptRow = {
  id: number;
  owner: string;
  repo: string;
  prompt: string;
  cached_at: string;
  views: number;
  title?: string | null;
  relevance_score?: number;
};

type WebsiteRow = {
  slug: string;
  target_url: string;
  prompt: string;
  cached_at: string;
};

function searchWords(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/u)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Quote a raw PostgREST value; the client handles URL encoding afterwards. */
function metadataMatch(columns: string[], word: string): string {
  const pattern = `%${word}%`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."${pattern}"`).join(",");
}

function previewPrompt(prompt: string | null | undefined): string {
  if (!prompt) return "";
  return prompt.length > 180 ? prompt.slice(0, 180) : prompt;
}

function applyCodeSort(
  // Supabase filter builder types don't compose cleanly across chained selects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sort: SortOption,
  searching: boolean
) {
  let q = query;
  switch (sort) {
    case "oldest":
      q = q.order("cached_at", { ascending: true });
      break;
    case "newest":
      q = q.order("cached_at", { ascending: false });
      break;
    case "trending":
    default:
      q = q
        .gte(
          "cached_at",
          new Date(Date.now() - TRENDING_WINDOW_MS).toISOString()
        )
        .order("views", { ascending: false })
        .order("cached_at", { ascending: false });
      break;
  }
  if (searching) {
    q = q.order("views", { ascending: false });
  }
  return q;
}

function applyWebsiteSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  sort: SortOption
) {
  switch (sort) {
    case "oldest":
      return query.order("cached_at", { ascending: true });
    case "newest":
      return query.order("cached_at", { ascending: false });
    case "trending":
    default:
      return query
        .gte(
          "cached_at",
          new Date(Date.now() - TRENDING_WINDOW_MS).toISOString()
        )
        .order("cached_at", { ascending: false });
  }
}

async function fetchCodeBrowse(
  supabase: SupabaseClient,
  sort: SortOption,
  fetchLimit: number
): Promise<{ rows: PromptRow[]; total: number }> {
  const { data, count, error } = await applyCodeSort(
    supabase.from(CODE_TABLE).select(CODE_COLUMNS, { count: "exact" }),
    sort,
    false
  ).range(0, fetchLimit - 1);

  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as PromptRow[], total: count ?? 0 };
}

async function fetchWebsiteBrowse(
  supabase: SupabaseClient,
  sort: SortOption,
  fetchLimit: number
): Promise<{ rows: WebsiteRow[]; total: number }> {
  const { data, count, error } = await applyWebsiteSort(
    supabase.from(WEBSITE_TABLE).select(WEBSITE_COLUMNS, { count: "exact" }),
    sort
  ).range(0, fetchLimit - 1);

  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as WebsiteRow[], total: count ?? 0 };
}

type FtsStrategy = "fts-plain" | "fts-or" | "ilike-and" | "ilike-or";

async function fetchCodeSearch(
  supabase: SupabaseClient,
  search: string,
  sort: SortOption,
  fetchLimit: number
): Promise<{ rows: PromptRow[]; total: number; strategy: FtsStrategy }> {
  const words = searchWords(search);

  const runLegacyQuery = (strategy?: FtsStrategy) => {
    let query = supabase
      .from(CODE_TABLE)
      .select(CODE_COLUMNS, { count: "exact" });

    if (words.length > 0 && strategy) {
      switch (strategy) {
        case "fts-plain":
          query = query.textSearch("search_vector", search, {
            type: "plain",
            config: "english",
          });
          break;
        case "fts-or":
          query = query.textSearch("search_vector", words.join(" OR "), {
            type: "websearch",
            config: "english",
          });
          break;
        case "ilike-and":
          // Avoid ilike on prompt — full-text scan blows past anon's 3s timeout.
          for (const word of words) {
            query = query.or(
              metadataMatch(["owner", "repo", "title"], word)
            );
          }
          break;
        case "ilike-or": {
          const clauses = words.map((word) =>
            metadataMatch(["owner", "repo", "title"], word)
          );
          query = query.or(clauses.join(","));
          break;
        }
      }
    }

    return applyCodeSort(query, sort, words.length > 0).range(0, fetchLimit - 1);
  };

  const runQuery = async (strategy?: FtsStrategy) => {
    const { data, error } = await supabase.rpc("library_keyword_search", {
      query_text: search,
      query_words: words,
      search_strategy: strategy ?? "fts-plain",
      sort_mode: sort === "newest" || sort === "oldest" ? sort : "trending",
      match_count: fetchLimit,
    });
    // Allow application and database rollouts in either order. Other RPC errors
    // remain failures and must not silently fall back to the expensive query plan.
    if (error?.code === "PGRST202") {
      return runLegacyQuery(strategy);
    }
    if (error) return { data: null, count: null, error };
    if (!data || !Array.isArray(data.rows) || typeof data.total !== "number") {
      throw new Error("Keyword search returned an invalid response.");
    }
    return { data: data.rows, count: data.total, error: null };
  };

  const strategies: FtsStrategy[] = ["fts-plain"];
  if (words.length > 1) strategies.push("fts-or");
  if (words.length > 0) strategies.push("ilike-and");
  if (words.length > 1) strategies.push("ilike-or");

  let emptyResult: { rows: PromptRow[]; total: number; strategy: FtsStrategy } | undefined;
  for (const strategy of strategies) {
    try {
      const res = await runQuery(words.length > 0 ? strategy : undefined);
      if (res.error) throw new Error(res.error.message);
      const result = {
        rows: (res.data ?? []) as PromptRow[],
        total: res.count ?? 0,
        strategy,
      };
      if (result.rows.length > 0 || result.total > 0) return result;
      emptyResult = result;
    } catch (error) {
      // A timed-out FTS query must still get the cheaper metadata fallback.
      logSourceFailure("code", strategy, error);
      // An earlier narrow zero-match response cannot prove a failed broader search is empty.
      emptyResult = undefined;
    }
  }
  if (emptyResult) return emptyResult;
  throw new Error("Code search is temporarily unavailable.");
}

async function fetchWebsiteSearch(
  supabase: SupabaseClient,
  search: string,
  sort: SortOption,
  fetchLimit: number
): Promise<{ rows: WebsiteRow[]; total: number }> {
  const words = searchWords(search);
  let query = supabase
    .from(WEBSITE_TABLE)
    .select(WEBSITE_COLUMNS, { count: "exact" });

  if (words.length > 0) {
    // Metadata-only match — scanning prompt text times out under anon limits.
    for (const word of words) {
      query = query.or(metadataMatch(["slug", "target_url"], word));
    }
  }

  const { data, count, error } = await applyWebsiteSort(query, sort).range(
    0,
    fetchLimit - 1
  );

  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as WebsiteRow[], total: count ?? 0 };
}

function scoreWebsiteSearch(row: WebsiteRow, search: string): number {
  const words = searchWords(search);
  if (words.length === 0) return 0;
  let score = 0;
  for (const word of words) {
    const w = word.toLowerCase();
    if (row.slug.toLowerCase().includes(w)) score += 3;
    if (row.target_url.toLowerCase().includes(w)) score += 2;
    if (row.prompt.toLowerCase().includes(w)) score += 1;
  }
  return score / words.length;
}

async function fetchCodeHybrid(
  supabase: SupabaseClient,
  search: string,
  fetchLimit: number,
  queryEmbed: number[]
): Promise<PromptRow[]> {
  const { data, error } = await supabase.rpc("hybrid_search", {
    query_text: search,
    query_embed: queryEmbed,
    match_count: fetchLimit,
    result_offset: 0,
  });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PromptRow[];

  const ids = rows.map((row) => row.id).filter(Boolean);
  if (ids.length === 0) return rows;

  const { data: titleRows } = await supabase
    .from(CODE_TABLE)
    .select("id, title, prompt")
    .in("id", ids);

  const metaById = new Map(
    (titleRows ?? []).map((row) => [
      row.id as number,
      {
        title: row.title as string | null,
        prompt: previewPrompt(row.prompt as string | null),
      },
    ])
  );

  const boosted = rows.map((row) => {
    const meta = metaById.get(row.id);
    return {
      ...row,
      prompt: meta?.prompt ?? previewPrompt(row.prompt),
      title: meta?.title ?? row.title ?? null,
      relevance_score:
        (row.relevance_score ?? 0) *
        (1 + Math.log10((row.views ?? 0) + 1) * VIEW_BOOST),
    };
  });

  const maxScore = boosted.reduce(
    (max, row) => Math.max(max, row.relevance_score ?? 0),
    0
  );

  if (maxScore <= 0) return boosted;

  return boosted.map((row) => ({
    ...row,
    relevance_score: (row.relevance_score ?? 0) / maxScore,
  }));
}

async function hybridSearchCount(
  supabase: SupabaseClient,
  search: string,
  queryEmbed: number[]
): Promise<number> {
  const { data, error } = await supabase.rpc("hybrid_search_count", {
    query_text: search,
    query_embed: queryEmbed,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

function mergeBrowse(
  codeRows: PromptRow[],
  websiteRows: WebsiteRow[],
  sort: SortOption
): LibraryEntry[] {
  const entries = [
    ...codeRows.map(codeEntryFromRow),
    ...websiteRows.map(websiteEntryFromRow),
  ];
  return sortLibraryEntries(entries, sort);
}

function mergeSearch(
  codeRows: PromptRow[],
  websiteRows: WebsiteRow[],
  search: string
): LibraryEntry[] {
  const entries: LibraryEntry[] = [
    ...codeRows.map(codeEntryFromRow),
    ...websiteRows.map((row) => {
      const entry = websiteEntryFromRow(row);
      const textScore = scoreWebsiteSearch(row, search);
      const hybridScore = entry.relevance_score ?? 0;
      return {
        ...entry,
        relevance_score: Math.max(hybridScore, textScore > 0 ? textScore / 3 : 0),
      };
    }),
  ];

  entries.sort((a, b) => {
    const scoreDiff = (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (
      new Date(b.cached_at).getTime() - new Date(a.cached_at).getTime()
    );
  });

  return entries;
}

function mergeFetchLimit(page: number, limit: number): number {
  return Math.min(MAX_FETCH_LIMIT, (page + 1) * limit);
}

function logSourceFailure(
  source: string,
  operation: string,
  error: unknown
): void {
  console.error(
    `[library] ${source} ${operation} failed:`,
    error instanceof Error ? error.message : error
  );
}

type SourceResult<T> =
  | { ok: true; value: T }
  | { ok: false; source: LibraryEntryKind };

async function readSource<T>(
  source: LibraryEntryKind,
  operation: string,
  fetch: () => Promise<T>
): Promise<SourceResult<T>> {
  try {
    return { ok: true, value: await fetch() };
  } catch (error) {
    logSourceFailure(source, operation, error);
    return { ok: false, source };
  }
}

function unavailableSources(results: SourceResult<unknown>[]): LibraryEntryKind[] {
  if (results.every((result) => !result.ok)) {
    throw new Error("The library is temporarily unavailable. Please try again.");
  }
  return results.flatMap((result) => result.ok ? [] : [result.source]);
}

async function searchCodeSource(opts: {
  supabase: SupabaseClient;
  search: string;
  sort: SortOption;
  useHybrid: boolean;
}, fetchLimit: number): Promise<{ rows: PromptRow[]; total: number; strategy: string }> {
  if (opts.useHybrid) {
    try {
      // Reuse the same vector for rows and count rather than paying for it twice.
      const queryEmbed = await embedText(opts.search);
      const [rows, total] = await Promise.all([
        fetchCodeHybrid(opts.supabase, opts.search, fetchLimit, queryEmbed),
        hybridSearchCount(opts.supabase, opts.search, queryEmbed),
      ]);
      if (rows.length > 0) return { rows, total, strategy: "hybrid" };
    } catch (error) {
      logSourceFailure("code", "hybrid search; falling back to keywords", error);
    }
  }
  return fetchCodeSearch(opts.supabase, opts.search, opts.sort, fetchLimit);
}

export async function browseLibrary(opts: {
  supabase: SupabaseClient;
  sort: SortOption;
  page: number;
  limit: number;
  kind?: LibraryKindFilter;
}): Promise<LibraryResult> {
  const kind = opts.kind ?? "all";
  const fetchLimit = mergeFetchLimit(opts.page, opts.limit);

  if (kind === "code") {
    const code = await fetchCodeBrowse(opts.supabase, opts.sort, fetchLimit);
    const merged = mergeBrowse(code.rows, [], opts.sort);
    return {
      data: paginateLibraryEntries(merged, opts.page, opts.limit),
      total: code.total,
    };
  }

  if (kind === "website") {
    const website = await fetchWebsiteBrowse(
      opts.supabase,
      opts.sort,
      fetchLimit
    );
    const merged = mergeBrowse([], website.rows, opts.sort);
    return {
      data: paginateLibraryEntries(merged, opts.page, opts.limit),
      total: website.total,
    };
  }

  const [code, website] = await Promise.all([
    readSource("code", "browse", () =>
      fetchCodeBrowse(opts.supabase, opts.sort, fetchLimit)
    ),
    readSource("website", "browse", () =>
      fetchWebsiteBrowse(opts.supabase, opts.sort, fetchLimit)
    ),
  ]);

  const unavailable = unavailableSources([code, website]);
  const merged = mergeBrowse(
    code.ok ? code.value.rows : [],
    website.ok ? website.value.rows : [],
    opts.sort
  );
  return {
    data: paginateLibraryEntries(merged, opts.page, opts.limit),
    total: (code.ok ? code.value.total : 0) + (website.ok ? website.value.total : 0),
    ...(unavailable.length > 0 ? { unavailableSources: unavailable } : {}),
  };
}

export async function searchLibrary(opts: {
  supabase: SupabaseClient;
  search: string;
  sort: SortOption;
  page: number;
  limit: number;
  useHybrid: boolean;
  kind?: LibraryKindFilter;
}): Promise<LibraryResult & { strategy: string }> {
  const kind = opts.kind ?? "all";
  const fetchLimit = mergeFetchLimit(opts.page, opts.limit);

  if (kind === "website") {
    const website = await fetchWebsiteSearch(
      opts.supabase,
      opts.search,
      opts.sort,
      fetchLimit
    );
    const merged = mergeSearch([], website.rows, opts.search);
    return {
      data: paginateLibraryEntries(merged, opts.page, opts.limit),
      total: website.total,
      strategy: "website-metadata",
    };
  }

  if (kind === "code") {
    const code = await searchCodeSource(opts, fetchLimit);
    return {
      data: paginateLibraryEntries(mergeSearch(code.rows, [], opts.search), opts.page, opts.limit),
      total: code.total,
      strategy: code.strategy,
    };
  }

  // Each source finishes its own fallback chain, regardless of the other source.
  const [code, website] = await Promise.all([
    readSource("code", "search", () => searchCodeSource(opts, fetchLimit)),
    readSource("website", "search", () =>
      fetchWebsiteSearch(opts.supabase, opts.search, opts.sort, fetchLimit)
    ),
  ]);
  const unavailable = unavailableSources([code, website]);
  const merged = mergeSearch(
    code.ok ? code.value.rows : [],
    website.ok ? website.value.rows : [],
    opts.search
  );
  return {
    data: paginateLibraryEntries(merged, opts.page, opts.limit),
    total: (code.ok ? code.value.total : 0) + (website.ok ? website.value.total : 0),
    strategy: code.ok ? code.value.strategy : "website-metadata",
    ...(unavailable.length > 0 ? { unavailableSources: unavailable } : {}),
  };
}

export async function fetchInitialLibrary(
  supabase: SupabaseClient,
  limit: number
): Promise<LibraryResult> {
  return browseLibrary({
    supabase,
    sort: "newest",
    page: 0,
    limit,
  });
}
