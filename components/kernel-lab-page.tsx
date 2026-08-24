"use client";

import { Navbar } from "@/components/navbar";
import { HeroKernelPreview } from "@/components/hero-kernel-preview";
import {
  QUATERNIUS_ROOT_MOTION_PUBLIC_PATH,
  QUATERNIUS_STANDARD_PUBLIC_PATH,
} from "@/lib/quaternius-kernel";

export function KernelLabPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Quaternius movement kernel
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Game reverse auto-rigs generated Meshy meshes onto this Universal
            skeleton and plays these clips. In-place playback uses{" "}
            <code className="text-xs">{QUATERNIUS_STANDARD_PUBLIC_PATH}</code>.
            Traveling locomotion is{" "}
            <code className="text-xs">
              {QUATERNIUS_ROOT_MOTION_PUBLIC_PATH}
            </code>
            .
          </p>
        </div>

        <section className="relative">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
            <HeroKernelPreview
              title="Universal mannequin (in-place)"
              subtitle="UAL1_Standard.glb — 43 clips, 65-joint Armature"
              autoClip="Walk_Loop"
            />
          </div>
        </section>

        <section className="relative">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
            <HeroKernelPreview
              modelUrl="/api/game-kernel/fixture"
              title="Auto-rigged T-pose dummy"
              subtitle="Procedural mesh bound to the same Universal rig, then driven by the kernel"
              autoClip="Walk_Loop"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
