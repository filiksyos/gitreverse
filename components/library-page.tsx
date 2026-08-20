"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CodeRabbitBanner } from "@/components/coderabbit-banner";
import { Navbar } from "@/components/navbar";
import type { LibraryEntry, SortOption } from "@/lib/library-types";

const SORT_OPTIONS: SortOption[] = ["newest", "trending", "oldest"];

const SORT_LABELS: Record<SortOption, string> = {
  trending: "Trending",
  newest: "Newest",
  oldest: "Oldest",
};

const PAGE_SIZE = 24;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

type LibraryPageProps = {
  initialData: LibraryEntry[];
  initialTotal: number;
};

export function LibraryPage({ initialData, initialTotal }: LibraryPageProps) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");
  const [entries, setEntries] = useState<LibraryEntry[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  const fetchPage = useCallback(
    async (
      searchVal: string,
      sortVal: SortOption,
      pageVal: number,
      append: boolean
    ) => {
      const params = new URLSearchParams({
        search: searchVal,
        sort: sortVal,
        page: String(pageVal),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/library?${params.toString()}`, {
        // Browse responses are CDN-cached; search stays private/no-store server-side.
        cache: searchVal ? "no-store" : "default",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: LibraryEntry[];
        total: number;
      };
      if (append) {
        setEntries((prev) => [...prev, ...json.data]);
      } else {
        setEntries(json.data);
      }
      setTotal(json.total);
      setPage(pageVal);
    },
    []
  );

  // Debounce search + sort changes (skip very first render — SSR data is fresh)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      startTransition(() => {
        void fetchPage(search, sort, 0, false);
      });
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search, sort, fetchPage]);

  async function handleLoadMore() {
    setLoadingMore(true);
    await fetchPage(search, sort, page + 1, true);
    setLoadingMore(false);
  }

  const hasMore = entries.length < total;

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="group relative inline-block">
            <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-lg bg-zinc-900" />
            <div className="relative z-10 rounded-lg border-[3px] border-zinc-900 bg-[#d31611] px-4 py-1">
              <span className="text-sm font-bold text-white">
                {total.toLocaleString()}+ prompts
              </span>
            </div>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl">
            Prompt Library
          </h1>
          <p className="max-w-lg text-lg text-zinc-600">
            Reverse-engineered prompts from GitHub repositories and live websites.
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Search */}
          <div className="relative flex-1">
            <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
            <div className="relative z-10 flex items-center rounded-lg border-[3px] border-zinc-900 bg-white">
              <svg
                className="ml-4 h-4 w-4 shrink-0 text-zinc-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z"
                />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompts…"
                className="w-full bg-transparent px-3 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
              />
              {isPending && (
                <svg
                  className="mr-3 h-4 w-4 shrink-0 animate-spin text-zinc-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
            </div>
          </div>

          {/* Sort — only when browsing, not searching */}
          {!search.trim() ? (
            <div className="relative shrink-0">
              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="relative z-10 w-full cursor-pointer appearance-none rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-4 py-3 pr-10 text-sm font-semibold text-zinc-900 focus:outline-none sm:w-auto"
              >
                {SORT_OPTIONS.map((val) => (
                  <option key={val} value={val}>
                    {SORT_LABELS[val]}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-3 top-1/2 z-20 h-4 w-4 -translate-y-1/2 text-zinc-700"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </div>
          ) : (
            <div className="relative shrink-0">
              <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" />
              <div className="relative z-10 rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-4 py-3 text-sm font-semibold text-zinc-900 sm:w-auto">
                Sorted by relevance
              </div>
            </div>
          )}
        </div>

        <CodeRabbitBanner className="w-full" placement="library" />

        {/* Count line */}
        {search ? (
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-900">
              {total.toLocaleString()}
            </span>{" "}
            result{total !== 1 ? "s" : ""}
          </p>
        ) : null}

        {/* Card grid */}
        {entries.length === 0 ? (
          isPending ? (
            <SkeletonGrid />
          ) : (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <span className="text-4xl">∅</span>
              <p className="text-lg font-semibold text-zinc-700">No prompts found</p>
              <p className="text-zinc-500">Try a different search term.</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => (
              <LibraryCard key={entry.key} entry={entry} />
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 rounded-lg border-[3px] border-zinc-900 bg-[#fff4da] px-8 py-3 font-semibold text-zinc-900 hover:bg-[#ffc480] transition-colors disabled:pointer-events-none disabled:opacity-60"
            >
              {loadingMore ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading…
                </>
              ) : (
                <>Load {Math.min(PAGE_SIZE, total - entries.length)} more ↓</>
              )}
            </button>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
          <a
            href="https://discord.gg/AYnCD68WCr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900"
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Discord
          </a>
        </div>
      </footer>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="relative block">
          <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900/20" />
          <div className="relative z-10 flex animate-pulse flex-col gap-3 rounded-xl border-[3px] border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-4/5 rounded bg-zinc-200" />
                <div className="h-4 w-3/5 rounded bg-zinc-100" />
              </div>
              <div className="h-6 w-6 shrink-0 rounded bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 w-2/3 rounded bg-zinc-100" />
            </div>
            <div className="flex items-center justify-between">
              <div className="h-5 w-14 rounded bg-zinc-100" />
              <div className="h-5 w-20 rounded bg-zinc-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LibraryCard({ entry }: { entry: LibraryEntry }) {
  const truncated =
    entry.prompt.length > 160
      ? entry.prompt.slice(0, 160).trimEnd() + "…"
      : entry.prompt;

  return (
    <Link
      href={entry.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block cursor-pointer"
      aria-label={entry.title}
    >
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900 transition-transform group-hover:translate-x-2 group-hover:translate-y-2" />
      <div className="relative z-10 flex h-full flex-col gap-3 rounded-xl border-[3px] border-zinc-900 bg-white p-4 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-zinc-900">
          {entry.title}
        </h3>

        <p className="flex-1 text-sm leading-relaxed text-zinc-600">{truncated}</p>

        <div className="flex items-center justify-between gap-2">
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
            {relativeTime(entry.cached_at)}
          </span>
          <KindBadge kind={entry.kind} />
        </div>
      </div>
    </Link>
  );
}

function KindBadge({ kind }: { kind: LibraryEntry["kind"] }) {
  if (kind === "game") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800"
        title="Game reverse"
      >
        <svg
          className="h-3.5 w-3.5 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Game
      </span>
    );
  }

  if (kind === "website") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800"
        title="Website reverse"
      >
        <svg
          className="h-3.5 w-3.5 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A8.966 8.966 0 013 12c0-1.264.26-2.47.732-3.553"
          />
        </svg>
        Website
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700"
      title="Codebase reverse"
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 98 96"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.096-.08-9.211-13.588 2.963-16.424-5.867-16.424-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.613-10.839-1.22-22.229-5.412-22.229-24.054 0-5.312 1.895-9.718 5.424-13.126-.526-1.324-2.356-6.74.505-14.052 0 0 4.432-1.505 14.5 5.008 4.172-1.095 8.73-1.63 13.168-1.656 4.469.026 8.971.561 13.166 1.656 10.06-6.513 14.48-5.008 14.48-5.008 2.866 7.326 1.052 12.728.53 14.052 3.532 3.408 5.414 7.814 5.414 13.126 0 18.728-11.401 22.813-22.285 23.985 1.772 1.514 3.316 4.539 3.316 9.119 0 6.613-.08 11.898-.08 13.526 0 1.304.878 2.853 3.316 2.364C84.974 89.385 98 70.983 98 49.204 98 22 76.038 0 48.854 0z"
          fill="currentColor"
        />
      </svg>
      Code
    </span>
  );
}
