"use client";

import { useState } from "react";

const EXAMPLES = [
  { label: "Next.js", url: "https://github.com/vercel/next.js" },
  { label: "Shadcn", url: "https://github.com/shadcn-ui/ui" },
  { label: "React", url: "https://github.com/facebook/react" },
  { label: "Supabase", url: "https://github.com/supabase/supabase" },
] as const;

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPrompt("");
    setCopied(false);
    setLoading(true);
    try {
      const res = await fetch("/api/reverse-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });
      const data = (await res.json()) as { prompt?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      if (typeof data.prompt === "string") {
        setPrompt(data.prompt);
      } else {
        setError("No prompt in response.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

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
    <div className="min-h-screen bg-[#FFFDF8] text-zinc-900">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#FFFDF8]">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <span className="text-xl font-bold tracking-tight">
            <span className="text-zinc-900">Git</span>
            <span className="text-[#d31611]">Reverse</span>
          </span>
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
      </nav>

      <main className="mx-auto flex max-w-4xl flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <div className="flex w-full flex-col items-center gap-6">
        {/* Hero */}
        <div className="relative flex w-full flex-col items-center text-center">
          {/* Red decorative sparkle */}
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

          {/* Green decorative sparkle */}
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
            Paste a public GitHub repo link. We&apos;ll turn it into one
            plain-language &ldquo;vibe coding&rdquo; prompt you could have used
            to build it.
          </p>
        </div>

        {/* Main card */}
        <div className="relative w-full max-w-2xl">
          {/* Offset shadow */}
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <form
            onSubmit={onSubmit}
            className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              {/* Input with shadow */}
              <div className="relative flex-1">
                <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                <input
                  name="repoUrl"
                  autoComplete="off"
                  className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                  placeholder="https://github.com/…"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  required
                />
              </div>
              {/* Button with shadow */}
              <div className="group relative shrink-0">
                <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                <button
                  type="submit"
                  disabled={loading}
                  className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-[#d31611] px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px disabled:opacity-50"
                >
                  {loading ? "Working…" : "Get Prompt"}
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

            {error ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </div>
        </div>

        {/* Result card */}
        {prompt ? (
          <div className="relative w-full max-w-2xl">
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
    </div>
  );
}
