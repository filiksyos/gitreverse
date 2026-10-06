import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import type { LibraryResult } from "@/lib/library-types";
import { fetchInitialLibrary } from "@/lib/library-query";
import { getSupabase } from "@/lib/supabase";
import { LibraryPage } from "@/components/library-page";
import { JsonLd } from "@/components/json-ld";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Prompt Library",
  description:
    "Browse reverse-engineered prompts from GitHub repositories and live websites. Find coding agent prompts for open-source projects and product UIs.",
  alternates: { canonical: "https://gitreverse.com/library" },
  openGraph: {
    title: "Prompt Library",
    description:
      "Browse reverse-engineered prompts from GitHub repositories and live websites. Find coding agent prompts for open-source projects and product UIs.",
    url: "https://gitreverse.com/library",
    type: "website",
  },
  twitter: {
    title: "Prompt Library",
    description:
      "Browse reverse-engineered prompts from GitHub repositories and live websites. Find coding agent prompts for open-source projects and product UIs.",
  },
};

const INITIAL_LIMIT = 24;

const getCachedInitialLibrary = unstable_cache(
  async () => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Database unavailable.");
    return fetchInitialLibrary(supabase, INITIAL_LIMIT);
  },
  ["library-initial-newest-v4"],
  { revalidate: 60 }
);

export default async function LibraryRoute() {
  let initial: LibraryResult = { data: [], total: 0 };
  let initialError: string | undefined;
  try {
    initial = await getCachedInitialLibrary();
  } catch (error) {
    console.error("[library] initial fetch failed:", error);
    initialError = "The library is temporarily unavailable. Please try again.";
  }
  const { data: initialData, total: initialTotal } = initial;

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Prompt Library — GitReverse",
    description:
      "Browse reverse-engineered coding agent prompts from GitHub repositories and live websites.",
    url: "https://gitreverse.com/library",
    numberOfItems: initialTotal,
    hasPart: initialData.slice(0, 10).map((entry) => ({
      "@type": "TechArticle",
      name: entry.title,
      url: `https://gitreverse.com${entry.href}`,
    })),
  };

  return (
    <>
      <JsonLd data={collectionJsonLd} />
      <LibraryPage
        initialData={initialData}
        initialTotal={initialTotal}
        initialUnavailableSources={initial.unavailableSources}
        initialError={initialError}
      />
    </>
  );
}
