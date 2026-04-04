"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { parseGitHubRepoInput } from "@/lib/parse-github-repo";

const EXAMPLES = [
  { label: "Next.js", url: "https://github.com/vercel/next.js" },
  { label: "Openclaw", url: "https://github.com/openclaw/openclaw" },
  { label: "React", url: "https://github.com/facebook/react" },
  { label: "Supabase", url: "https://github.com/supabase/supabase" },
  { label: "Linux", url: "https://github.com/torvalds/linux" },
] as const;

type ReversePromptHomeProps = {
  initialRepoInput?: string;
  autoSubmit?: boolean;
  initialPrompt?: string;
};

export function ReversePromptHome({
  initialRepoInput = "",
  autoSubmit = false,
  initialPrompt,
}: ReversePromptHomeProps) {
  const [repoUrl, setRepoUrl] = useState(initialRepoInput);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [needsByok, setNeedsByok] = useState(false);
  const [byokProvider, setByokProvider] = useState<"openrouter" | "google" | null>(
    null
  );
  const [byokApiKey, setByokApiKey] = useState("");
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [copied, setCopied] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const autoSubmitStartedRef = useRef(false);

  const runReversePrompt = useCallback(async (input: string) => {
    setError(null);
    setRateLimited(false);
    setPrompt("");
    setCopied(false);
    setLoading(true);
    const trimmedKey = byokApiKey.trim();
    try {
      const res = await fetch("/api/reverse-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: input,
          ...(trimmedKey ? { apiKey: trimmedKey } : {}),
        }),
      });
      const data = (await res.json()) as {
        prompt?: string;
        error?: string;
        provider?: "openrouter" | "google";
      };
      if (!res.ok) {
        if (res.status === 402 && data.error === "llm_credits_exhausted") {
          setNeedsByok(true);
          setByokProvider(data.provider ?? null);
          return;
        }
        if (res.status === 402 && data.error === "llm_credits_exhausted_user_key") {
          setError(
            "Your API key was accepted but the provider reported no quota or credits left. Try another key or top up your account."
          );
          return;
        }
        if (res.status === 429) {
          setRateLimited(true);
          return;
        }
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      if (typeof data.prompt === "string") {
        setNeedsByok(false);
        setByokProvider(null);
        setPrompt(data.prompt);
        const parsed = parseGitHubRepoInput(input);
        if (parsed && typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            `/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`
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
  }, [byokApiKey]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runReversePrompt(repoUrl.trim());
  }

  useEffect(() => {
    if (!autoSubmit || autoSubmitStartedRef.current) return;
    const trimmed = initialRepoInput?.trim() ?? "";
    if (!trimmed || !parseGitHubRepoInput(trimmed)) return;
    autoSubmitStartedRef.current = true;
    void runReversePrompt(trimmed);
  }, [autoSubmit, initialRepoInput, runReversePrompt]);

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
      <nav className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#FFFDF8]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-zinc-900">Git</span>
            <span className="text-[#d31611]">Reverse</span>
          </span>
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
              className="flex items-center gap-2 font-semibold text-zinc-900 transition-transform hover:-translate-y-0.5"
            >
            <svg
              className="h-5 w-5 shrink-0"
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
            GitHub
            </a>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <div className="flex w-full flex-col items-center gap-6">
          <div className="relative flex w-full flex-col items-center text-center">
            <svg
              className="absolute left-0 top-0 hidden h-16 w-16 sm:block lg:left-8"
              viewBox="0 0 91 98"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="m35.878 14.162 1.333-5.369 1.933 5.183c4.47 11.982 14.036 21.085 25.828 24.467l5.42 1.555-5.209 2.16c-11.332 4.697-19.806 14.826-22.888 27.237l-1.333 5.369-1.933-5.183C34.56 57.599 24.993 48.496 13.201 45.114l-5.42-1.555 5.21-2.16c11.331-4.697 19.805-14.826 22.887-27.237Z"
                fill="#FE4A60"
                stroke="#000"
                strokeWidth="3.445"
              />
              <path
                d="M79.653 5.729c-2.436 5.323-9.515 15.25-18.341 12.374m9.197 16.336c2.6-5.851 10.008-16.834 18.842-13.956m-9.738-15.07c-.374 3.787 1.076 12.078 9.869 14.943M70.61 34.6c.503-4.21-.69-13.346-9.49-16.214M14.922 65.967c1.338 5.677 6.372 16.756 15.808 15.659M18.21 95.832c-1.392-6.226-6.54-18.404-15.984-17.305m12.85-12.892c-.41 3.771-3.576 11.588-12.968 12.681M18.025 96c.367-4.21 3.453-12.905 12.854-14"
                stroke="#000"
                strokeWidth="2.548"
                strokeLinecap="round"
              />
            </svg>

            <svg
              className="absolute right-0 top-4 hidden h-14 w-14 sm:block lg:right-8"
              viewBox="0 0 92 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="m35.213 16.953.595-5.261 2.644 4.587a35.056 35.056 0 0 0 26.432 17.33l5.261.594-4.587 2.644A35.056 35.056 0 0 0 48.23 63.28l-.595 5.26-2.644-4.587a35.056 35.056 0 0 0-26.432-17.328l-5.261-.595 4.587-2.644a35.056 35.056 0 0 0 17.329-26.433Z"
                fill="#5CF1A4"
                stroke="#000"
                strokeWidth="2.868"
              />
              <path
                d="M75.062 40.108c1.07 5.255 1.072 16.52-7.472 19.54m7.422-19.682c1.836 2.965 7.643 8.14 16.187 5.121-8.544 3.02-8.207 15.23-6.971 20.957-1.97-3.343-8.044-9.274-16.588-6.254M12.054 28.012c1.34-5.22 6.126-15.4 14.554-14.369M12.035 28.162c-.274-3.487-2.93-10.719-11.358-11.75C9.104 17.443 14.013 6.262 15.414.542c.226 3.888 2.784 11.92 11.212 12.95"
                stroke="#000"
                strokeWidth="2.319"
                strokeLinecap="round"
              />
            </svg>

            <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl lg:text-7xl">
              Repository to
              <br />
              Prompt
            </h1>
            <p className="mt-4 max-w-xl text-lg text-zinc-600">
              Paste a public GitHub repo link or{" "}
              <span className="whitespace-nowrap">owner/repo</span>. We&apos;ll
              turn it into one plain-language &ldquo;vibe coding&rdquo; prompt
              you could have used to build it.
            </p>
          </div>

          <div className="flex w-full max-w-2xl flex-col gap-3">
          <div className="relative w-full">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <form
              onSubmit={onSubmit}
              className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                  <input
                    name="repoUrl"
                    autoComplete="off"
                    className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                    placeholder="https://github.com/… or owner/repo"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="group relative shrink-0">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                  <button
                    type="submit"
                    disabled={loading}
                    aria-busy={loading}
                    className={`relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:pointer-events-none ${
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
                        <span>Processing…</span>
                      </>
                    ) : (
                      "Get Prompt"
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="w-full text-sm text-zinc-600">
                  Try example repos:
                </span>
                {EXAMPLES.map(({ label, url }) => (
                  <div key={url} className="group relative">
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={() => setRepoUrl(url)}
                      className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#EBDBB7] px-3 py-1 text-sm font-medium text-zinc-900 transition-transform hover:bg-[#ffc480] group-hover:-translate-x-px group-hover:-translate-y-px"
                    >
                      {label}
                    </button>
                  </div>
                ))}
              </div>

              {needsByok || rateLimited ? (
                <div className="mt-4 rounded-lg border-[3px] border-amber-400 bg-amber-50 p-4" role="alert">
                  <p className="font-semibold text-amber-900">Sorry, we&apos;re a bit overwhelmed right now.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <p className="w-full text-sm text-amber-800">Come back in a couple of hours, or check out what others have already generated:</p>
                    <Link
                      href="/library"
                      className="inline-flex items-center gap-1.5 rounded border-[2px] border-amber-600 bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-200"
                    >
                      Browse the library
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                  {needsByok ? (
                    <div className="mt-4 border-t border-amber-300 pt-4">
                      <p className="text-sm font-medium text-amber-900">Or use your own API key to skip the queue:</p>
                      <label className="mt-2 block text-sm text-amber-900">
                        {byokProvider === "google" ? "Google AI Studio" : "OpenRouter"} API key
                        <input
                          type="password"
                          name="byokApiKey"
                          autoComplete="off"
                          value={byokApiKey}
                          onChange={(e) => setByokApiKey(e.target.value)}
                          className="mt-1.5 w-full rounded border-[2px] border-amber-600 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none"
                          placeholder={byokProvider === "google" ? "AIza…" : "sk-or-v1-…"}
                        />
                      </label>
                      <p className="mt-1.5 text-xs text-amber-700">Sent directly to the provider over HTTPS — never stored.</p>
                    </div>
                  ) : null}
                </div>
              ) : error ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          </div>
          <p className="text-center text-sm text-zinc-500">
            You can also replace{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
              hub
            </code>{" "}
            with{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">
              reverse
            </code>{" "}
            in any GitHub URL.
          </p>
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Reverse engineered prompt
                </h2>
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
              <pre className="max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                {prompt}
              </pre>
            </section>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        <div className="mx-auto flex max-w-4xl justify-center px-4 sm:px-6">
          <a
            href="https://discord.gg/Uq7fTGsQX"
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
