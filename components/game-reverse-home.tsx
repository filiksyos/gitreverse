"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { HOME_GAME_EXAMPLES } from "@/lib/home-example-repos";
import { nameToSlug, parseGameInput } from "@/lib/parse-game-input";

export function GameReverseHome() {
  const router = useRouter();
  const [gameName, setGameName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const gameRaw = gameName.trim();
    const isUrl =
      /^https?:\/\//i.test(gameRaw) ||
      /^github\.com\//i.test(gameRaw) ||
      (/^[^/\s]+\/[^/\s]+$/.test(gameRaw) && !gameRaw.includes(" "));
    if (isUrl) {
      setError(
        "That looks like a URL or repo. Use Codebase or Website reverse on the home page."
      );
      return;
    }

    const parsed = parseGameInput(gameRaw);
    if (!parsed) {
      setError("Could not parse game name. Enter a title like GTA Vice City.");
      return;
    }

    const slug = nameToSlug(parsed.name);
    void router.push(
      `/game/${encodeURIComponent(slug)}?name=${encodeURIComponent(parsed.name)}`
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <div className="flex w-full flex-col items-center gap-6">
          <div className="relative flex w-full flex-col items-center text-center">
            <h1 className="text-5xl font-extrabold tracking-tighter sm:text-6xl lg:text-7xl">
              Reverse a game
              <br />
              into a prompt
            </h1>
            <p className="mt-4 max-w-xl text-lg text-zinc-600">
              Type any game title and get a GAME.md spec plus a Cursor-ready
              build prompt.
            </p>
          </div>

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
                      value={gameName}
                      onChange={(e) => setGameName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="group relative w-full shrink-0 sm:w-auto">
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded bg-zinc-800" />
                    <button
                      type="submit"
                      className="relative z-10 flex w-full items-center justify-center gap-2 rounded border-[3px] border-zinc-900 bg-[#d31611] px-6 py-3 font-medium text-white transition-transform group-hover:-translate-x-px group-hover:-translate-y-px sm:min-w-[10rem]"
                    >
                      Get Prompt
                    </button>
                  </div>
                </div>

                {error ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    <span className="w-full text-sm text-zinc-600">
                      Try example games:
                    </span>
                    {HOME_GAME_EXAMPLES.map((example) => (
                      <div key={example.name} className="group relative">
                        <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                        <button
                          type="button"
                          onClick={() => setGameName(example.name)}
                          className="relative z-10 rounded border-[3px] border-zinc-900 bg-[#EBDBB7] px-3 py-1 text-sm font-medium text-zinc-900 transition-transform hover:bg-[#ffc480] group-hover:-translate-x-px group-hover:-translate-y-px"
                        >
                          {example.label}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            <p className="text-center text-sm text-zinc-500">
              Also reverse{" "}
              <Link
                href="/"
                className="font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900"
              >
                codebases
              </Link>{" "}
              or{" "}
              <Link
                href="/?mode=website"
                className="font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 hover:text-zinc-900"
              >
                websites
              </Link>{" "}
              on the home page.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-2 px-4 sm:px-6">
          <a
            href="https://github.com/filiksyos/gitreverse"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-zinc-700 underline decoration-zinc-400 underline-offset-2 transition-colors hover:text-zinc-900"
          >
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
            Discord
          </a>
        </div>
      </footer>
    </div>
  );
}
