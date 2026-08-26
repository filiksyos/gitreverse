import type { MetadataRoute } from "next";
import { getSupabase } from "@/lib/supabase";

const BASE_URL = "https://gitreverse.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/library`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/game`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from("prompt_cache")
        .select("owner, repo, cached_at")
        .order("cached_at", { ascending: false });

      if (data) {
        dynamicRoutes = data.map((row) => ({
          url: `${BASE_URL}/${encodeURIComponent(row.owner as string)}/${encodeURIComponent(row.repo as string)}`,
          lastModified: new Date(row.cached_at as string),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }));
      }
    }
  } catch {
    // return static routes only if DB is unavailable
  }

  return [...staticRoutes, ...dynamicRoutes];
}
