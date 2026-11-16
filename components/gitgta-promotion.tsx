"use client";

import { useEffect, useRef } from "react";
import { track } from "@vercel/analytics";

const GITGTA_URL = "https://gitgta.com/?utm_source=gitreverse&utm_medium=referral";

type BannerProps = {
  className?: string;
  embedded?: boolean;
  placement?: "home-card" | "repo-card" | "website-card";
};

export function GitGtaBanner({ className = "", embedded = false, placement = "repo-card" }: BannerProps) {
  return (
    <a
      href={GITGTA_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("GitGTA Click", { placement })}
      className={`group flex items-center gap-3 rounded-lg border-2 border-zinc-900 bg-[#fce5f0] ${embedded ? "px-3 py-2.5" : "mt-4 px-4 py-3 shadow-[3px_3px_0_#18181b]"} transition-colors hover:bg-[#f9cce3] ${className}`}
    >
      <span aria-hidden="true" className="shrink-0 text-2xl">🌴</span>
      <div className="min-w-0 flex-1">
        <p className={`font-bold text-zinc-900 ${embedded ? "text-xs" : "text-sm"}`}>Your GitHub profile. A GTA VI game.</p>
        <p className="text-xs text-zinc-700">We built GitGTA. Turn any GitHub profile into a game.</p>
      </div>
      <span className="shrink-0 rounded border-2 border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white">Play now ↗</span>
      <span className="sr-only">Opens GitGTA in a new tab</span>
    </a>
  );
}

export function GitGtaPromotionModal() {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (dialog.current && !dialog.current.open) {
        dialog.current.showModal();
        track("GitGTA Impression", { placement: "arrival-modal" });
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="gitgta-promotion-title"
      aria-describedby="gitgta-promotion-description"
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-2 border-zinc-900 bg-[#fffdf8] p-0 text-zinc-900 shadow-[6px_6px_0_#18181b] backdrop:bg-zinc-950/60"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
        }
      }}
    >
      <div className="relative p-7 sm:p-9">
        <button type="button" aria-label="Close GitGTA promotion" onClick={() => dialog.current?.close()} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2">×</button>
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-pink-700">New from the GitReverse creator</p>
        <span aria-hidden="true" className="mb-4 block text-5xl">🌴</span>
        <h2 id="gitgta-promotion-title" className="text-3xl font-black leading-tight">Your GitHub.<br />Welcome to Vice City.</h2>
        <p id="gitgta-promotion-description" className="mt-4 text-base leading-relaxed text-zinc-600">We built a way to turn any GitHub profile into a GTA VI game.</p>
        <a href={GITGTA_URL} onClick={() => track("GitGTA Click", { placement: "arrival-modal" })} className="mt-6 block rounded-lg border-2 border-zinc-900 bg-[#f9a8d4] px-5 py-3 text-center font-bold transition-colors hover:bg-[#f472b6] focus-visible:outline-2 focus-visible:outline-offset-4">Try GitGTA →</a>
        <button type="button" onClick={() => dialog.current?.close()} className="mx-auto mt-4 block rounded px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900">Maybe later</button>
      </div>
    </dialog>
  );
}
