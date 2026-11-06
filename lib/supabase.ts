import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
let cachedAdmin: SupabaseClient | null = null;

/** Server-side Supabase client (publishable key); returns null if env is not configured. */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  if (!cached) cached = createClient(url, key);
  return cached;
}

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — ONLY use in server-side API routes, never in client code.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  if (!cachedAdmin) cachedAdmin = createClient(url, key, { auth: { persistSession: false } });
  return cachedAdmin;
}
