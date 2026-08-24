"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GameSpecFlavorText } from "@/components/game-spec-flavor-text";
import { HeroKernelPreview } from "@/components/hero-kernel-preview";
import { Navbar } from "@/components/navbar";
import { PromptMarkdown } from "@/components/prompt-markdown";
import { nameToSlug, parseGameInput } from "@/lib/parse-game-input";
import type { StoredHeroAsset } from "@/lib/game-asset-storage";

type GameReversePageProps = {
  gameSlug: string;
  gameName: string;
};

export function GameReversePage({ gameSlug, gameName }: GameReversePageProps) {
  const router = useRouter();

  const [currentSlug, setCurrentSlug] = useState(gameSlug);
  const [currentGameName, setCurrentGameName] = useState(gameName);
  const [inputValue, setInputValue] = useState(gameName);

  const [prompt, setPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Checking if it's cached…");
  const [copied, setCopied] = useState(false);
  const [heroAssets, setHeroAssets] = useState<
    Array<StoredHeroAsset & { url: string }>
  >([]);
  const started = useRef(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadHeroAssets = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/game-assets/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setHeroAssets([]);
        return;
      }
      const data = (await res.json()) as {
        assets?: Array<StoredHeroAsset & { url: string }>;
      };
      setHeroAssets(data.assets ?? []);
    } catch {
      setHeroAssets([]);
    }
  }, []);

  const run = useCallback(async (slug: string, name: string) => {
    setLoading(true);
    setError(null);
    setPrompt(null);
    setHeroAssets([]);
    setStatusLine("Checking if it's cached…");

    try {
      const res = await fetch("/api/reverse-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameSlug: slug,
          gameName: name,
          stream: true,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await res.json()) as {
          prompt?: string;
          fromCache?: boolean;
          error?: string;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        if (data.prompt) {
          setPrompt(data.prompt);
          if (data.fromCache) setStatusLine("Loaded from cache");
          void loadHeroAssets(slug);
        } else {
          throw new Error("No prompt returned.");
        }
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        for (;;) {
          const idx = buf.indexOf("\n\n");
          if (idx < 0) break;
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const eventLine = block.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          try {
            const json = JSON.parse(dataLine.slice(5).trim()) as {
              message?: string;
              prompt?: string;
              fromCache?: boolean;
              error?: string;
            };

            if (event === "status" && typeof json.message === "string") {
              setStatusLine(json.message);
            }
            if (event === "done" && typeof json.prompt === "string") {
              setPrompt(json.prompt);
              if (json.fromCache) setStatusLine("Loaded from cache");
              void loadHeroAssets(slug);
            }
            if (event === "error" && typeof json.error === "string") {
              throw new Error(json.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              throw e;
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [loadHeroAssets]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(gameSlug, gameName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prompt && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [prompt]);

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const raw = inputValue.trim();
    const isUrl =
      /^https?:\/\//i.test(raw) ||
      /^github\.com\//i.test(raw) ||
      (/^[^/\s]+\/[^/\s]+$/.test(raw) && !raw.includes(" "));
    if (isUrl) {
      setError(
        "That looks like a URL or repo. Use Codebase or Website mode instead."
      );
      return;
    }

    const parsed = parseGameInput(raw);
    if (!parsed) {
      setError("Could not parse game name. Enter a title like GTA Vice City.");
      return;
    }

    const slug = nameToSlug(parsed.name);
    setCurrentSlug(slug);
    setCurrentGameName(parsed.name);
    router.replace(
      `/game/${encodeURIComponent(slug)}?name=${encodeURIComponent(parsed.name)}`,
      { scroll: false }
    );
    void run(slug, parsed.name);
  }

  const isWritingSpec = statusLine === "Writing GAME.md";

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <h1 className="sr-only">{`${currentGameName} — reverse-engineered prompt`}</h1>

        <div className="flex w-full max-w-2xl flex-col gap-3">
          <div className="relative w-full">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <form
              onSubmit={onSubmit}
              className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fff4da] p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="relative min-w-0 flex-1">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-900" />
                  <input
                    name="gameName"
                    autoComplete="off"
                    className="relative z-10 w-full rounded border-[3px] border-zinc-900 bg-white px-4 py-3 text-base text-zinc-900 placeholder-zinc-500 focus:outline-none"
                    placeholder="GTA Vice City"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    required
                  />
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
                        <span>Processing…</span>
                      </>
                    ) : (
                      "Get Prompt"
                    )}
                  </button>
                </div>
              </div>

              {loading && !prompt && !error ? (
                <div className="mt-4">
                  {isWritingSpec ? (
                    <GameSpecFlavorText />
                  ) : (
                    <p
                      className="min-h-[1.25rem] text-sm text-zinc-600"
                      role="status"
                      aria-live="polite"
                    >
                      {statusLine}…
                    </p>
                  )}
                </div>
              ) : null}

              {error ? (
                <div
                  className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {error}
                  <button
                    type="button"
                    onClick={() => void run(currentSlug, currentGameName)}
                    className="ml-3 font-medium underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </form>
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
                  <a
                    href={`/specs/${encodeURIComponent(currentSlug)}`}
                    className="text-xs font-medium text-zinc-600 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900 hover:decoration-zinc-900"
                  >
                    Open GAME.md
                  </a>
                  <div className="group relative">
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                    <button
                      type="button"
                      onClick={() => void copyPrompt()}
                      className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="max-h-[min(70vh,32rem)] overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                <PromptMarkdown>{prompt}</PromptMarkdown>
              </div>
            </section>
          </div>
        ) : null}

        {prompt ? (
          <div className="relative w-full max-w-2xl">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
            <section className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
              {heroAssets.find((a) => a.kind === "humanoid") ? (
                <HeroKernelPreview
                  modelUrl={
                    heroAssets.find((a) => a.kind === "humanoid")?.url ??
                    undefined
                  }
                  title="Generated hero"
                  subtitle={
                    heroAssets.find((a) => a.kernel)
                      ? "Auto-rigged to the Quaternius Universal skeleton"
                      : "Textured sculpt (kernel bind pending)"
                  }
                  autoClip="Walk_Loop"
                />
              ) : (
                <HeroKernelPreview
                  title="Movement kernel"
                  subtitle="Generated heroes are auto-rigged onto this Quaternius Universal rig and play these clips"
                  autoClip="Walk_Loop"
                />
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
