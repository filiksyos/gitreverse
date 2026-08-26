"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { CodeRabbitBanner } from "@/components/coderabbit-banner";
import { Navbar } from "@/components/navbar";
import { ReverseGenerationFlavorText } from "@/components/reverse-generation-flavor-text";
import { useAuth } from "@/contexts/AuthContext";
import {
  HOME_EXAMPLES,
  HOME_WEBSITE_EXAMPLES,
} from "@/lib/home-example-repos";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";
import { parseWebsiteInput, urlToSlug } from "@/lib/parse-website-input";
import {
  type HistoryEntry,
  historyPromptPreview,
  historySlotOf,
  migrateLocalHistoryToServer,
  readLocalHistory,
  syncHistoryEntry,
  writeLocalHistory,
} from "@/lib/user-history";
import { pathWithPartnerPreviewParams } from "@/lib/partner-preview";

type ReversePromptHomeProps = {
  initialRepoInput?: string;
  autoSubmit?: boolean;
  initialPrompt?: string;
  owner?: string;
  repo?: string;
  isHome?: boolean;
};

export function ReversePromptHome({
  initialRepoInput = "",
  autoSubmit = false,
  initialPrompt,
  owner,
  repo,
  isHome = false,
}: ReversePromptHomeProps) {
  const router = useRouter();
  const { isAuthenticated, session } = useAuth();
  const [repoUrl, setRepoUrl] = useState(initialRepoInput);
  const [siteUrl, setSiteUrl] = useState("");
  const [homeMode, setHomeMode] = useState<"codebase" | "website">("codebase");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const autoSubmitStartedRef = useRef(false);

  /** Home: honor `?mode=website`; legacy `?mode=game` redirects to /game. */
  useEffect(() => {
    if (!isHome || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode")?.trim().toLowerCase();
    if (mode === "game") {
      void router.replace("/game");
      return;
    }
    if (mode === "website") {
      setHomeMode("website");
    }
  }, [isHome, router]);

  const runReversePrompt = useCallback(async (input: string) => {
    setError(null);
    setRateLimited(false);
    setPrompt("");
    setCopied(false);
    setLoading(true);
    try {
      const res = await fetch("/api/reverse-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: input }),
      });
      const data = (await res.json()) as {
        prompt?: string;
        error?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      if (typeof data.prompt === "string") {
        setPrompt(data.prompt);
        const parsed = parseGitHubRepoInput(input);
        if (parsed && typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            pathWithPartnerPreviewParams(
              `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
            )
          );
        }
      } else {
        setError("No prompt in response.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  function setHomeModeAndUrl(next: "codebase" | "website") {
    setHomeMode(next);
    setError(null);
    if (typeof window === "undefined" || !isHome) return;
    const url = new URL(window.location.href);
    if (next === "website") {
      url.searchParams.set("mode", "website");
    } else {
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    if (isHome && homeMode === "website") {
      const siteRaw = siteUrl.trim();
      const isGitHubUrl =
        /^(https?:\/\/)?(www\.)?github\.com\/.+\/.+/i.test(siteRaw) ||
        /^github\.com\/.+\/.+/.test(siteRaw) ||
        (/^[^/\s]+\/[^/\s]+$/.test(siteRaw) && !siteRaw.includes("."));
      if (isGitHubUrl) {
        setError(
          "That looks like a GitHub repo. Switch to Codebase mode to reverse-engineer code."
        );
        return;
      }
      const parsed = parseWebsiteInput(siteRaw);
      if (!parsed) {
        setError(
          "Could not parse website URL. Use https://example.com or example.com."
        );
        return;
      }
      const slug = urlToSlug(parsed.hostname);
      void router.push(
        `/website/${encodeURIComponent(slug)}?url=${encodeURIComponent(parsed.url)}`
      );
      return;
    }

    const trimmed = repoUrl.trim();

    if (!initialRepoInput?.trim()) {
      const isNonGitHubWebUrl =
        /^https?:\/\//i.test(trimmed) &&
        (() => {
          try {
            const h = new URL(trimmed).hostname.replace(/^www\./, "");
            return h !== "github.com";
          } catch {
            return false;
          }
        })();
      if (isNonGitHubWebUrl) {
        setError(
          "That looks like a website URL. Switch to Website mode to reverse-engineer sites."
        );
        return;
      }
      const parsed = parseGitHubRepoInput(trimmed);
      if (!parsed) {
        setError(
          "Could not parse GitHub repo. Use owner/repo or a github.com URL."
        );
        return;
      }
      void router.push(
        `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
      );
      return;
    }

    void runReversePrompt(trimmed);
  }

  useEffect(() => {
    if (autoSubmitStartedRef.current) return;
    const trimmed = initialRepoInput?.trim() ?? "";
    if (!trimmed || !parseGitHubRepoInput(trimmed)) return;
    if (autoSubmit) {
      autoSubmitStartedRef.current = true;
      void runReversePrompt(trimmed);
    }
  }, [autoSubmit, initialRepoInput, runReversePrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = owner?.trim();
    const r = repo?.trim();
    if (!o || !r) return;

    void fetch("/api/increment-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: o, repo: r }),
    }).catch(() => {
      /* swallow ? view counter is best-effort */
    });
  }, [owner, repo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const o = owner?.trim();
    const r = repo?.trim();
    const p = prompt.trim();
    if (!o || !r || !p) return;

    const preview = historyPromptPreview(p);
    const arr: HistoryEntry[] = readLocalHistory();
    const slot = "quick";

    const idx = arr.findIndex(
      (e) => e.owner === o && e.repo === r && historySlotOf(e) === slot
    );

    let entry: HistoryEntry;

    if (idx === -1) {
      entry = {
        owner: o,
        repo: r,
        historySlot: slot,
        visitedAt: new Date().toISOString(),
        promptPreview: preview,
        lastGenerationType: "quick",
      };
      arr.unshift(entry);
      writeLocalHistory(arr);
    } else {
      const cur = arr[idx];
      const samePreview = cur.promptPreview === preview;
      const sameGen = cur.lastGenerationType === "quick";
      if (samePreview && sameGen) return;

      entry = {
        ...cur,
        historySlot: slot,
        visitedAt: new Date().toISOString(),
        promptPreview: preview,
        lastGenerationType: "quick",
      };
      arr[idx] = entry;
      writeLocalHistory(arr);
    }

    const token = session?.access_token;
    if (token) {
      void syncHistoryEntry(token, entry).catch(() => {});
    }
  }, [owner, repo, prompt, session?.access_token]);

  const historyMigratedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || !session?.access_token) return;
    if (historyMigratedRef.current) return;
    historyMigratedRef.current = true;
    void migrateLocalHistoryToServer(session.access_token).catch(() => {});
  }, [isAuthenticated, session?.access_token]);

  useEffect(() => {
    if (!prompt) return;
    const id = requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [prompt]);

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <div className="flex w-full flex-col items-center gap-6">
          {isHome ? (
            <div className="relative flex w-full flex-col items-center text-center">
              <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl lg:text-7xl">
                Reverse into
                <br />
                a prompt
              </h1>
              <p className="mt-4 max-w-xl text-lg text-zinc-600">
                Reverse engineer any codebase or website into a prompt.{" "}
                <Link
                  href="/game"
                  className="font-medium text-zinc-800 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-950"
                >
                  Games too.
                </Link>
              </p>
            </div>
          ) : owner && repo ? (
            <h1 className="sr-only">{`${owner}/${repo} ? reverse-engineered prompt`}</h1>
          ) : null}

          {isHome ? (
            <div
              className="inline-flex overflow-hidden rounded-[10px] border-[3px] border-zinc-900 bg-white"
              role="tablist"
              aria-label="Reverse mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === "codebase"}
                aria-pressed={homeMode === "codebase"}
                onClick={() => setHomeModeAndUrl("codebase")}
                className={`border-r-[2.5px] border-zinc-900 px-5 py-2.5 text-sm font-bold transition-colors ${
                  homeMode === "codebase"
                    ? "bg-[#d31611] text-white"
                    : "bg-transparent text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Codebase
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={homeMode === "website"}
                aria-pressed={homeMode === "website"}
                onClick={() => setHomeModeAndUrl("website")}
                className={`border-r-[2.5px] border-zinc-900 px-5 py-2.5 text-sm font-bold transition-colors ${
                  homeMode === "website"
                    ? "bg-[#d31611] text-white"
                    : "bg-transparent text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Website
              </button>
              <Link
                href="/game"
                className="px-5 py-2.5 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Game
              </Link>
            </div>
          ) : null}

          <div className="flex w-full max-w-2xl flex-col gap-3">
            <div className="relative w-full">
              <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
              <form
                onSubmit={onSubmit}
                className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="relative min-w-0 flex-1">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                      {isHome && homeMode === "website" ? (
                        <input
                          name="siteUrl"
                          autoComplete="off"
                          className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                          placeholder="https://?"
                          value={siteUrl}
                          onChange={(e) => setSiteUrl(e.target.value)}
                          required
                        />
                      ) : (
                        <input
                          name="repoUrl"
                          autoComplete="off"
                          className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                          placeholder="https://github.com/?"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          required
                        />
                      )}
                    </div>
                    <div className="group relative w-full shrink-0 sm:w-auto">
                      <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                      <button
                        type="submit"
                        disabled={loading}
                        aria-busy={loading}
                        className={`relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:pointer-events-none sm:min-w-[10rem] ${
                          loading ? "bg-[#b5120e]" : "bg-[#d31611]"
                        }`}
                      >
                        {loading ? (
                          <>
                            <svg
                              className="h-5 w-5 shrink-0 animate-spin text-white"
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
                            <span>Processing?</span>
                          </>
                        ) : (
                          "Get Prompt"
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="mt-4">
                    <ReverseGenerationFlavorText />
                  </div>
                ) : null}

                {rateLimited ? (
                  <div
                    className="mt-4 rounded-lg border-[3px] border-amber-400 bg-amber-50 p-4"
                    role="alert"
                  >
                    <p className="font-semibold text-amber-900">
                      Sorry, we&apos;re a bit overwhelmed right now.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className="w-full text-sm text-amber-800">
                        Come back in a couple of hours, or check out what others
                        have already generated:
                      </p>
                      <Link
                        href="/library"
                        className="inline-flex items-center justify-center rounded border-[2px] border-amber-600 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                      >
                        Browse the library
                      </Link>
                    </div>
                  </div>
                ) : error ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {error}
                  </p>
                ) : null}
                {isHome && !loading ? (
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="w-full text-sm text-zinc-600">
                        {homeMode === "website"
                          ? "Try example websites:"
                          : "Try example repos:"}
                      </span>
                      {(homeMode === "website"
                        ? HOME_WEBSITE_EXAMPLES
                        : HOME_EXAMPLES
                      ).map(({ label, url }) => (
                        <div key={url} className="group relative">
                          <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                          <button
                            type="button"
                            onClick={() => {
                              if (homeMode === "website") setSiteUrl(url);
                              else setRepoUrl(url);
                            }}
                            className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#EBDBB7] px-3 py-1 text-sm font-medium text-zinc-900 transition-transform hover:bg-[#ffc480] group-hover:-translate-x-px group-hover:-translate-y-px"
                          >
                            {label}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </form>
            </div>
            {isHome ? (
              <p className="text-center text-sm text-zinc-500">
                {homeMode === "codebase" ? (
                  <>
                    Also works: replace{" "}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
                      hub
                    </code>{" "}
                    with{" "}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
                      reverse
                    </code>{" "}
                    in any GitHub URL.
                  </>
                ) : (
                  <>
                    Also works:{" "}
                    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
                      pinterest.gitreverse.com
                    </code>{" "}
                    style hostnames.
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>

        {prompt ? (
          <div
            ref={resultsRef}
            data-results
            className="relative w-full max-w-2xl scroll-mt-24"
          >
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <section className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Reverse engineered prompt
                </h2>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <div className="group relative">
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={copyPrompt}
                      className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="mb-2 mt-4 text-base font-bold first:mt-0">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-2 mt-4 text-sm font-bold first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="mb-1 mt-3 text-sm font-semibold first:mt-0">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-2 last:mb-0">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-2 ml-4 list-disc space-y-0.5">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-2 ml-4 list-decimal space-y-0.5">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold">{children}</strong>
                    ),
                    em: ({ children }) => (
                      <em className="italic">{children}</em>
                    ),
                    code: ({ children }) => (
                      <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
                        {children}
                      </code>
                    ),
                    pre: ({ children }) => (
                      <pre className="mb-2 overflow-auto rounded bg-zinc-100 p-3 font-mono text-xs">
                        {children}
                      </pre>
                    ),
                    hr: () => <hr className="my-3 border-zinc-200" />,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-600">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {prompt}
                </ReactMarkdown>
              </div>
              {!loading ? (
                <CodeRabbitBanner
                  className="mt-4 w-full"
                  embedded
                  placement="repo-card"
                />
              ) : null}
            </section>
          </div>
        ) : null}
      </main>

      {isHome ? (
        <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
            <a
              href="https://github.com/filiksyos/gitreverse"
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
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              GitHub
            </a>
            <span className="text-zinc-300" aria-hidden>
              ·
            </span>
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
      ) : null}
    </div>
  );
}
