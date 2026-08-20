import { getSupabase } from "@/lib/supabase";

export type GameReverseMeta = {
  gameName: string;
  prompt: string;
  updatedAt: string;
};

export async function readGameReverse(
  slug: string
): Promise<{ specMd: string; meta: GameReverseMeta } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("game_reverse_cache")
    .select("game_name, prompt, spec_md, cached_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.prompt || !data?.spec_md || !data?.game_name) {
    return null;
  }

  return {
    specMd: data.spec_md as string,
    meta: {
      gameName: data.game_name as string,
      prompt: data.prompt as string,
      updatedAt: data.cached_at as string,
    },
  };
}

export async function readSpecMd(slug: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("game_reverse_cache")
    .select("spec_md")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.spec_md) return null;
  return data.spec_md as string;
}

export async function writeGameReverse(opts: {
  slug: string;
  gameName: string;
  specMd: string;
  prompt: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY."
    );
  }

  const { error } = await supabase.from("game_reverse_cache").upsert(
    {
      slug: opts.slug,
      game_name: opts.gameName,
      spec_md: opts.specMd,
      prompt: opts.prompt,
      metadata: opts.metadata ?? null,
      cached_at: new Date().toISOString(),
    },
    { onConflict: "slug" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export function specApiPath(slug: string): string {
  return `/api/game-spec/${encodeURIComponent(slug)}`;
}
