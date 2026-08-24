import { notFound } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { PromptMarkdown } from "@/components/prompt-markdown";
import { HeroKernelPreview } from "@/components/hero-kernel-preview";
import { isValidGameSlug } from "@/lib/parse-game-input";
import { readGameReverse } from "@/lib/game-reverse-storage";
import { readHeroAssetManifest } from "@/lib/game-asset-storage";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function GameSpecPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();

  if (!isValidGameSlug(slug)) {
    notFound();
  }

  const cached = await readGameReverse(slug);
  if (!cached) {
    notFound();
  }

  const downloadHref = `/api/game-spec/${encodeURIComponent(slug)}?download=1`;
  const heroAssets = (await readHeroAssetManifest(slug))?.assets ?? [];
  const heroPreview = heroAssets.find((asset) => asset.kind === "humanoid");

  return (
    <div className="flex min-h-screen flex-col bg-[#FFFDF8] text-zinc-900">
      <Navbar />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center gap-12 px-4 py-12 sm:px-6">
        <h1 className="sr-only">{`${cached.meta.gameName} game spec`}</h1>

        <div className="relative w-full max-w-2xl">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" />
          <section className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#fafafa] p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-700">
                  Game spec
                </h2>
                <p className="mt-0.5 truncate text-xs font-medium text-zinc-500">
                  {cached.meta.gameName}
                </p>
              </div>
              <div className="group relative shrink-0">
                <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded bg-zinc-900" />
                <a
                  href={downloadHref}
                  download={`${slug}-GAME.md`}
                  className="relative z-10 inline-flex rounded border-[3px] border-zinc-900 bg-[#ffc480] px-3 py-1.5 text-xs font-medium text-zinc-900 transition-transform group-hover:-translate-x-px group-hover:-translate-y-px"
                >
                  Download GAME.md
                </a>
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-800">
              <PromptMarkdown>{cached.specMd}</PromptMarkdown>
            </div>
            {heroPreview ? (
              <div className="mt-4 border-t border-zinc-200 pt-4">
                <HeroKernelPreview
                  modelUrl={`/api/game-assets/${encodeURIComponent(slug)}/${encodeURIComponent(heroPreview.filename)}`}
                  title="Generated hero"
                  subtitle={
                    heroPreview.kernel
                      ? "Auto-rigged to the Quaternius Universal skeleton"
                      : "Textured sculpt"
                  }
                  autoClip="Walk_Loop"
                />
              </div>
            ) : null}
            {heroAssets.length > 0 ? (
              <div className="mt-4 border-t border-zinc-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Generated hero GLBs
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {heroAssets.map((asset) => (
                    <li key={asset.filename}>
                      <a
                        href={`/api/game-assets/${encodeURIComponent(slug)}/${encodeURIComponent(asset.filename)}`}
                        download={asset.filename}
                        className="text-sm font-medium text-zinc-900 underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-900"
                      >
                        Download {asset.filename}
                      </a>
                      <span className="ml-2 text-xs text-zinc-500">
                        {asset.kernel
                          ? "Quaternius kernel"
                          : asset.hasWalk
                            ? "rigged walk"
                            : "textured sculpt"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
