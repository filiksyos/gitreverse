"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const HISTORY_KEY = "gitreverse_history";

type HistoryEntry = {
  owner: string;
  repo: string;
  visitedAt: string;
  promptPreview?: string;
};

function isHistoryEntry(x: unknown): x is HistoryEntry {
  if (
    typeof x !== "object" ||
    x === null ||
    typeof (x as HistoryEntry).owner !== "string" ||
    typeof (x as HistoryEntry).repo !== "string" ||
    typeof (x as HistoryEntry).visitedAt !== "string"
  ) {
    return false;
  }
  const pv = (x as HistoryEntry).promptPreview;
  return pv === undefined || typeof pv === "string";
}

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

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      setEntries([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setEntries([]);
        return;
      }
      const list = parsed.filter(isHistoryEntry);
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime()
      );
      setEntries(sorted);
    } catch {
      setEntries([]);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <nav className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#FFFDF8]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight transition-opacity hover:opacity-80"
          >
            <span className="text-zinc-900">Git</span>
            <span className="text-[#d31611]">Reverse</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/library"
              className="font-semibold text-zinc-900 transition-transform hover:-translate-y-0.5"
            >
              Library
            </Link>
            <a
              href="https://github.com/filiksyos/gitreverse"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-zinc-900 transition-transform hover:-translate-y-0.5"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2 text-center sm:text-left">
          <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl">
            History
          </h1>
          <p className="text-zinc-600">
            Repositories you opened recently on this device.
          </p>
        </div>

        {entries === null ? (
          <p className="text-center text-zinc-500 sm:text-left">Loading&hellip;</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-zinc-600 sm:text-left">
            No history yet. Check out the{" "}
            <Link
              href="/library"
              className="font-semibold text-zinc-900 underline decoration-zinc-900/30 underline-offset-2 transition-colors hover:decoration-zinc-900"
            >
              Prompt Library
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {entries.map((e) => (
              <li key={`${e.owner}/${e.repo}`}>
                <HistoryCard entry={e} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const router = useRouter();
  const href = `/${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}`;

  return (
    <div
      className="group relative cursor-pointer"
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(href);
      }}
      role="link"
      tabIndex={0}
      aria-label={`${entry.owner}/${entry.repo}`}
    >
      <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900 transition-transform group-hover:translate-x-2 group-hover:translate-y-2" />
      <div className="relative z-10 flex flex-col gap-3 rounded-xl border-[3px] border-zinc-900 bg-white p-4 transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-zinc-500">
              {entry.owner}
            </p>
            <p className="truncate text-base font-bold text-zinc-900">
              {entry.repo}
            </p>
          </div>
          <a
            href={`https://github.com/${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:text-zinc-900"
            aria-label={`View ${entry.owner}/${entry.repo} on GitHub`}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 98 96"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.096-.08-9.211-13.588 2.963-16.424-5.867-16.424-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.613-10.839-1.22-22.229-5.412-22.229-24.054 0-5.312 1.895-9.718 5.424-13.126-.526-1.324-2.356-6.74.505-14.052 0 0 4.432-1.505 14.5 5.008 4.172-1.095 8.73-1.63 13.168-1.656 4.469.026 8.971.561 13.166 1.656 10.06-6.513 14.48-5.008 14.48-5.008 2.866 7.326 1.052 12.728.53 14.052 3.532 3.408 5.414 7.814 5.414 13.126 0 18.728-11.401 22.813-22.285 23.985 1.772 1.514 3.316 4.539 3.316 9.119 0 6.613-.08 11.898-.08 13.526 0 1.304.878 2.853 3.316 2.364C84.974 89.385 98 70.983 98 49.204 98 22 76.038 0 48.854 0z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>

        {entry.promptPreview ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600">
            {entry.promptPreview}
          </p>
        ) : null}

        <div className="flex items-center">
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500">
            {relativeTime(entry.visitedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
