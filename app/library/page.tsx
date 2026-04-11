import { connection } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { LibraryPage } from "@/components/library-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Prompt Library — GitReverse",
  description:
    "Browse 1,000+ reverse-engineered prompts from real GitHub repositories.",
};

const INITIAL_LIMIT = 24;

export default async function LibraryRoute() {
  await connection();
  const supabase = getSupabase();

  let initialData: {
    id: number;
    owner: string;
    repo: string;
    prompt: string;
    cached_at: string;
    views?: number;
  }[] = [];
  let initialTotal = 0;

  if (supabase) {
    const { data, count } = await supabase
      .from("prompt_cache")
      .select("id, owner, repo, prompt, cached_at, views", { count: "exact" })
      .order("cached_at", { ascending: false })
      .range(0, INITIAL_LIMIT - 1);

    initialData = (data ?? []) as typeof initialData;
    initialTotal = count ?? 0;
  }

  return <LibraryPage initialData={initialData} initialTotal={initialTotal} />;
}
