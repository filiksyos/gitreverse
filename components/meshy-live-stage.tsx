"use client";

import { HeroKernelPreview } from "@/components/hero-kernel-preview";
import type { HeroProgressEvent } from "@/lib/meshy-progress";

function stageLabel(hero: HeroProgressEvent): string {
  if (hero.stage === "ready") {
    return hero.kernel ? "Walking" : "Ready";
  }
  if (hero.stage === "kernel") return "Auto-rig";
  if (hero.stage === "refine") return `Texture ${hero.progress}%`;
  if (hero.stage === "failed") return "Failed";
  return `Sculpt ${hero.progress}%`;
}

function LiveHeroCard({ hero }: { hero: HeroProgressEvent }) {
  const moving = Boolean(hero.kernel && hero.modelUrl);
  return (
    <div className="relative">
      <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
      <section className="relative z-10 overflow-hidden rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-zinc-800">{hero.id}</p>
          <p className="text-xs font-medium text-zinc-500" role="status">
            {stageLabel(hero)}
          </p>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full bg-zinc-900 transition-[width] duration-500"
            style={{ width: `${Math.max(hero.stage === "ready" ? 100 : hero.progress, 2)}%` }}
          />
        </div>
        {hero.modelUrl ? (
          <HeroKernelPreview
            key={hero.modelUrl}
            modelUrl={hero.modelUrl}
            autoClip={moving ? "Walk_Loop" : "Idle_Loop"}
            compact
          />
        ) : hero.thumbnailUrl ? (
          <div className="overflow-hidden rounded-lg border-[3px] border-zinc-900 bg-[#f6efe2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.thumbnailUrl}
              alt=""
              className="mx-auto h-[16rem] w-auto object-contain"
            />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border-[3px] border-dashed border-zinc-300 bg-white text-xs text-zinc-500">
            {hero.status}
          </div>
        )}
      </section>
    </div>
  );
}

export function MeshyLiveStage({ heroes }: { heroes: HeroProgressEvent[] }) {
  if (!heroes.length) return null;
  return (
    <div className="flex w-full max-w-2xl flex-col gap-3" aria-live="polite">
      {heroes.map((hero) => (
        <LiveHeroCard key={hero.id} hero={hero} />
      ))}
    </div>
  );
}
