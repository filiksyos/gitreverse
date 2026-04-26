import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Sunucu Tarafı Supabase istemcisi; ortam ayarlanmamışsa "null" döner. (cache disabled). */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key);
  return cached;
}
