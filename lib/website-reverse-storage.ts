import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";

export type WebsiteReverseMeta = {
  targetUrl: string;
  prompt: string;
  updatedAt: string;
};

export async function readWebsiteReverse(
  slug: string
): Promise<{ designMd: string; meta: WebsiteReverseMeta } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("website_reverse_cache")
    .select("target_url, prompt, design_md, cached_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.prompt || !data?.design_md || !data?.target_url) {
    return null;
  }

  return {
    designMd: data.design_md as string,
    meta: {
      targetUrl: data.target_url as string,
      prompt: data.prompt as string,
      updatedAt: data.cached_at as string,
    },
  };
}

export async function readDesignMd(slug: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("website_reverse_cache")
    .select("design_md")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data?.design_md) return null;
  return data.design_md as string;
}

export async function writeWebsiteReverse(opts: {
  slug: string;
  targetUrl: string;
  designMd: string;
  prompt: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const { data: existing, error: readError } = await supabase
    .from("website_reverse_cache").select("target_url").eq("slug", opts.slug).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing && existing.target_url !== opts.targetUrl) {
    throw new Error("Website slug is already bound to a different URL.");
  }
  const row = {
    slug: opts.slug,
    target_url: opts.targetUrl,
    design_md: opts.designMd,
    prompt: opts.prompt,
    cached_at: new Date().toISOString(),
  };
  // An insert race must fail rather than overwrite another URL's cache entry.
  const { error } = existing
    ? await supabase.from("website_reverse_cache").update(row)
        .eq("slug", opts.slug).eq("target_url", opts.targetUrl)
    : await supabase.from("website_reverse_cache").insert(row);

  if (error) {
    throw new Error(error.message);
  }
}

export function designApiPath(slug: string): string {
  return `/api/website-design/${encodeURIComponent(slug)}`;
}
